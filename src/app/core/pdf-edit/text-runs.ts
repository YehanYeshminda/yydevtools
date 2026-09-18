/**
 * Where every piece of text on a page actually sits.
 *
 * This walks the content stream keeping the same state a PDF viewer keeps —
 * current transformation matrix, text matrix, font, spacing — and works out,
 * for each show-text operator, the point its baseline starts at and how far it
 * runs. The arithmetic is the spec's, not an approximation: it has to agree
 * with what pdf.js paints, or the editable box would sit beside the words
 * instead of on them. `text-runs.spec.ts` checks it against pdf.js on real
 * files for exactly that reason.
 *
 * Doing the geometry here rather than reading it off pdf.js buys the thing that
 * makes editing possible at all: every run knows which bytes produced it.
 */
import type { ContentOp, Operand } from './content-stream';
import { parseContentStream } from './content-stream';
import type { EditableFont } from './font-metrics';

/** `[a b c d e f]`, the six numbers of a PDF matrix. */
export type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `a` then `b`. */
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: x * m[0] + y * m[2] + m[4], y: x * m[1] + y * m[3] + m[5] };
}

/**
 * A form XObject the page draws, opened far enough to walk it.
 *
 * Handed in by the caller rather than resolved here, so this file stays free of
 * pdf-lib and its object graph.
 */
export interface FormXObject {
  /** Identifies the stream an edit will be spliced into. */
  id: string;
  bytes: Uint8Array;
  fonts: Map<string, EditableFont>;
  /** The form's own `/Matrix`, applied before the matrix in force. */
  matrix: Matrix;
  resolve: Resolve;
}

/** Looks a form XObject up by the name the content stream uses. */
export type Resolve = (name: string) => FormXObject | null;

/** One show-text operator, placed on the page. */
export interface TextRun {
  /** Which stream drew it: the empty string for the page's own content. */
  streamId: string;
  /** Position in the op list, so neighbours can be found. */
  index: number;
  /** The bytes that drew it, which is what an edit replaces. */
  start: number;
  end: number;
  text: string;
  /** Baseline start, in unrotated page points with the origin bottom-left. */
  x: number;
  y: number;
  /** How far the run advances along its baseline, in points. */
  width: number;
  /** The font size as it lands on the page, after every matrix. */
  size: number;
  /** Resource name of the font, and what to call it in front of a reader. */
  font: string;
  family: string;
  /** Fill colour as `#rrggbb`. */
  color: string;
  /** Text drawn in rendering mode 3: the invisible layer under a scan. */
  invisible: boolean;
  /** True when the baseline runs right to left or the text is rotated. */
  rotated: boolean;
  /** The matrix in force, needed to write a replacement back in place. */
  matrix: Matrix;
  /**
   * The three matrices `matrix` is made of, which is what relocating needs.
   *
   * `matrix` is `tm × ctm`, so it cannot be written back as a `Tm` — that
   * would apply the CTM twice. Moving a run means emitting a `tm` shifted in
   * text space and then putting `tmAfter` back, so the pen ends exactly where
   * the original left it and nothing after it shifts.
   */
  ctm: Matrix;
  tm: Matrix;
  tmAfter: Matrix;
  /** Font size before the matrix, i.e. the number next to `Tf`. */
  fontSize: number;
  /** Which of `Tj TJ ' "` drew it — the last two also move to a new line. */
  opText: string;
  /** Spacing in force, which `"` sets as part of showing its string. */
  wordSpacing: number;
  charSpacing: number;
  /** `Tz` as a factor, which scales every advance along the baseline. */
  horizontal: number;
}

interface TextState {
  font: EditableFont | null;
  fontName: string;
  size: number;
  charSpacing: number;
  wordSpacing: number;
  horizontal: number;
  leading: number;
  rise: number;
  mode: number;
}

interface GraphicsState {
  ctm: Matrix;
  color: string;
  text: TextState;
}

function blankText(): TextState {
  return {
    font: null,
    fontName: '',
    size: 0,
    charSpacing: 0,
    wordSpacing: 0,
    horizontal: 1,
    leading: 0,
    rise: 0,
    mode: 0,
  };
}

function numbers(operands: Operand[], count: number): number[] | null {
  if (operands.length < count) return null;
  const tail = operands.slice(operands.length - count);
  const out: number[] = [];
  for (const operand of tail) {
    if (operand.kind !== 'num') return null;
    out.push(operand.value);
  }
  return out;
}

function channel(value: number): string {
  return Math.round(Math.min(Math.max(value, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
}

function rgb(r: number, g: number, b: number): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** The naive conversion, which is what a viewer without a profile does too. */
function cmyk(c: number, m: number, y: number, k: number): string {
  return rgb((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));
}

/** How deep `Do` is followed before the nesting is assumed to be a cycle. */
const MAX_FORM_DEPTH = 8;

export interface WalkOptions {
  /** The matrix the stream starts under. The identity for a page. */
  base?: Matrix;
  /** Follows `Do`; leaving it out stops at the page's own content. */
  resolve?: Resolve;
  /** Names this stream's runs, for the caller to splice back into. */
  streamId?: string;
  depth?: number;
}

/**
 * Every run of text the stream draws, in the order it draws it.
 *
 * `Do` is followed into form XObjects, because whole producers put all of a
 * page's text inside one — a spreadsheet exported to PDF can have nothing but a
 * clip and a `Do` at the top level. Runs found that way carry the form's id, so
 * the caller knows the edit belongs to that stream and not to the page.
 */
export function findTextRuns(
  bytes: Uint8Array,
  fonts: Map<string, EditableFont>,
  options: WalkOptions = {},
): TextRun[] {
  const { base = IDENTITY, resolve, streamId = '', depth = 0 } = options;
  const ops = parseContentStream(bytes);
  const runs: TextRun[] = [];

  let state: GraphicsState = { ctm: base, color: '#000000', text: blankText() };
  const stack: GraphicsState[] = [];
  let textMatrix: Matrix = IDENTITY;
  let lineMatrix: Matrix = IDENTITY;

  const clone = (from: GraphicsState): GraphicsState => ({
    ctm: from.ctm,
    color: from.color,
    text: { ...from.text },
  });

  const newline = (tx: number, ty: number): void => {
    lineMatrix = multiply([1, 0, 0, 1, tx, ty], lineMatrix);
    textMatrix = lineMatrix;
  };

  ops.forEach((op, index) => {
    switch (op.op) {
      case 'q':
        stack.push(clone(state));
        return;
      case 'Q': {
        const popped = stack.pop();
        if (popped) state = popped;
        return;
      }
      case 'cm': {
        const m = numbers(op.operands, 6);
        if (m) state.ctm = multiply(m as unknown as Matrix, state.ctm);
        return;
      }
      case 'Do': {
        if (!resolve || depth >= MAX_FORM_DEPTH) return;
        const name = op.operands[op.operands.length - 1];
        if (name?.kind !== 'name') return;
        const form = resolve(name.value);
        if (!form) return;
        runs.push(
          ...findTextRuns(form.bytes, form.fonts, {
            base: multiply(form.matrix, state.ctm),
            resolve: form.resolve,
            streamId: form.id,
            depth: depth + 1,
          }),
        );
        return;
      }
      case 'BT':
        textMatrix = IDENTITY;
        lineMatrix = IDENTITY;
        return;
      case 'Tf': {
        const size = numbers(op.operands, 1);
        const name = op.operands.find((operand) => operand.kind === 'name');
        if (size) state.text.size = size[0];
        if (name?.kind === 'name') {
          state.text.fontName = name.value;
          state.text.font = fonts.get(name.value) ?? null;
        }
        return;
      }
      case 'Tc': {
        const value = numbers(op.operands, 1);
        if (value) state.text.charSpacing = value[0];
        return;
      }
      case 'Tw': {
        const value = numbers(op.operands, 1);
        if (value) state.text.wordSpacing = value[0];
        return;
      }
      case 'Tz': {
        const value = numbers(op.operands, 1);
        if (value) state.text.horizontal = value[0] / 100;
        return;
      }
      case 'TL': {
        const value = numbers(op.operands, 1);
        if (value) state.text.leading = value[0];
        return;
      }
      case 'Ts': {
        const value = numbers(op.operands, 1);
        if (value) state.text.rise = value[0];
        return;
      }
      case 'Tr': {
        const value = numbers(op.operands, 1);
        if (value) state.text.mode = value[0];
        return;
      }
      case 'Td': {
        const value = numbers(op.operands, 2);
        if (value) newline(value[0], value[1]);
        return;
      }
      case 'TD': {
        const value = numbers(op.operands, 2);
        if (value) {
          state.text.leading = -value[1];
          newline(value[0], value[1]);
        }
        return;
      }
      case 'Tm': {
        const m = numbers(op.operands, 6);
        if (m) {
          lineMatrix = m as unknown as Matrix;
          textMatrix = lineMatrix;
        }
        return;
      }
      case 'T*':
        newline(0, -state.text.leading);
        return;
      case 'g':
      case 'G': {
        const value = numbers(op.operands, 1);
        if (value && op.op === 'g') state.color = rgb(value[0], value[0], value[0]);
        return;
      }
      case 'rg':
      case 'RG': {
        const value = numbers(op.operands, 3);
        if (value && op.op === 'rg') state.color = rgb(value[0], value[1], value[2]);
        return;
      }
      case 'k':
      case 'K': {
        const value = numbers(op.operands, 4);
        if (value && op.op === 'k') state.color = cmyk(value[0], value[1], value[2], value[3]);
        return;
      }
      case 'sc':
      case 'scn': {
        // Without following /ColorSpace this can only read the obvious shapes:
        // one number is grey, three are RGB, four are CMYK.
        const values = op.operands.filter((operand) => operand.kind === 'num');
        if (values.length === 1)
          state.color = rgb(values[0].value, values[0].value, values[0].value);
        else if (values.length === 3)
          state.color = rgb(values[0].value, values[1].value, values[2].value);
        else if (values.length === 4)
          state.color = cmyk(values[0].value, values[1].value, values[2].value, values[3].value);
        return;
      }
      case 'Tj':
      case 'TJ':
      case "'":
      case '"': {
        if (op.op === "'") newline(0, -state.text.leading);
        if (op.op === '"') {
          const value = numbers(op.operands.slice(0, -1), 2);
          if (value) {
            state.text.wordSpacing = value[0];
            state.text.charSpacing = value[1];
          }
          newline(0, -state.text.leading);
        }
        const shown = op.operands[op.operands.length - 1];
        const run = placeRun(op, index, streamId, shown, state, textMatrix);
        if (run) {
          runs.push(run.run);
          textMatrix = run.after;
        }
        return;
      }
      default:
        return;
    }
  });

  return runs;
}

/**
 * Measures one show operator and advances the text matrix past it.
 *
 * Returns nothing when the operand is not a string or array, or when the font
 * is one this file could not read — in both cases the run is skipped rather
 * than placed somewhere invented, and the text matrix is left alone. That is
 * wrong for everything after it on the same line, but a wrong offset is
 * visible, and a confidently placed box over the wrong words is not.
 */
function placeRun(
  op: ContentOp,
  index: number,
  streamId: string,
  shown: Operand | undefined,
  state: GraphicsState,
  textMatrix: Matrix,
): { run: TextRun; after: Matrix } | null {
  const font = state.text.font;
  if (!font || !shown) return null;
  const pieces: Array<Uint8Array | number> = [];
  if (shown.kind === 'string') {
    pieces.push(shown.bytes);
  } else if (shown.kind === 'array') {
    for (const item of shown.items) {
      if (item.kind === 'string') pieces.push(item.bytes);
      else if (item.kind === 'num') pieces.push(item.value);
    }
  } else {
    return null;
  }

  const { size, charSpacing, wordSpacing, horizontal, rise } = state.text;
  let advance = 0;
  let text = '';
  for (const piece of pieces) {
    if (typeof piece === 'number') {
      // A kerning number moves the pen without drawing; the minus is the spec's.
      advance += (-piece / 1000) * size * horizontal;
      continue;
    }
    const codes = font.decode(piece);
    text += font.textOf(codes);
    for (const code of codes) {
      const glyph = (font.widthOf(code) / 1000) * size;
      const spacing = charSpacing + (font.isWordSpace(code) ? wordSpacing : 0);
      advance += (glyph + spacing) * horizontal;
    }
  }

  const matrix = multiply(textMatrix, state.ctm);
  const after = multiply([1, 0, 0, 1, advance, 0], textMatrix);
  const origin = apply(matrix, 0, rise);
  const end = apply(matrix, advance, rise);
  // The font size as painted: how long the text matrix makes a unit of height.
  const painted = size * Math.hypot(matrix[2], matrix[3]);

  return {
    run: {
      streamId,
      index,
      start: op.start,
      end: op.end,
      text,
      x: origin.x,
      y: origin.y,
      width: Math.hypot(end.x - origin.x, end.y - origin.y),
      size: Math.abs(painted),
      font: state.text.fontName,
      family: font.family,
      color: state.color,
      invisible: state.text.mode === 3 || state.text.mode === 7,
      // A baseline that is not left to right needs a rotated editor; the tool
      // shows these but does not offer to change them.
      rotated: Math.abs(matrix[1]) > 1e-6 || matrix[0] < 0,
      matrix,
      ctm: state.ctm,
      tm: textMatrix,
      tmAfter: after,
      fontSize: size,
      opText: op.op,
      wordSpacing,
      charSpacing,
      horizontal,
    },
    after,
  };
}
