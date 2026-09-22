/**
 * Reading the shape of a plain-text draft.
 *
 * Four renderers — email HTML, `.docx`, RTF and the plain-text half of the
 * `.eml` — all need the same answer to "what is in this text?", and they must
 * agree, or the Word file and the email say different things. So the text is
 * read once into a small block model here and every renderer walks that.
 *
 * The reading is rule-based, not a language model. Nothing on this site sends
 * what you paste anywhere, and that constraint is the point rather than a
 * limitation to work around: it means the tool lays your words out, it does not
 * rewrite them. What it infers is structure — paragraphs, bullets, a greeting,
 * a sign-off, a link on a line of its own.
 *
 * `marked` is already a dependency (the Markdown Editor renders with it) and
 * exposes its lexer, so the token stream comes for free rather than from a
 * second hand-written parser to keep correct.
 */
import { marked, type Token, type Tokens } from 'marked';

/** A run of text with one set of marks on it. */
export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  /** Set when this run is a link. */
  href?: string;
}

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; spans: Span[] }
  | { kind: 'paragraph'; spans: Span[]; role?: 'greeting' | 'signoff' }
  | { kind: 'list'; ordered: boolean; items: Span[][] }
  /** A link that was alone on its line — a call to action. */
  | { kind: 'button'; text: string; href: string }
  | { kind: 'rule' };

export interface Draft {
  /** The subject line, lifted out of the body when one can be identified. */
  subject: string | null;
  blocks: Block[];
}

export interface ParseOptions {
  /**
   * False reads the text as nothing but paragraphs: blank lines separate them
   * and not one other character is interpreted. For the person whose draft is
   * full of asterisks and hashes that are meant literally.
   */
  infer: boolean;
}

/** An explicit subject beats every guess. */
const SUBJECT_LINE = /^subject:[ \t]*(.+)$/i;

/** Openings that mean the paragraph is addressing the reader. */
const GREETING = /^(hi|hello|dear|hey|greetings|good (morning|afternoon|evening))\b/i;

/** Openings that mean the paragraph is the sign-off. */
const SIGNOFF =
  /^(thanks|thank you|many thanks|regards|kind regards|warm regards|best|best wishes|all the best|sincerely|yours|cheers|speak soon)\b/i;

/**
 * Longest first line still plausibly a subject rather than an opening sentence.
 * Mail clients truncate somewhere near this, so a longer line was written as
 * prose.
 */
const MAX_SUBJECT = 78;

/** Read `text` into a subject and a list of blocks. */
export function parseDraft(text: string, options: ParseOptions): Draft {
  const { body, subject: stated } = takeStatedSubject(text);

  if (!options.infer) {
    return { subject: stated, blocks: plainParagraphs(body) };
  }

  const blocks = toBlocks(marked.lexer(body, { gfm: true, breaks: true }));
  const inferred = stated === null ? takeInferredSubject(blocks) : null;
  markRoles(blocks);
  return { subject: stated ?? inferred, blocks };
}

/**
 * A leading `Subject: …` line, removed from the body.
 *
 * Checked before anything else and regardless of the inference switch: someone
 * who typed the word Subject meant it, whatever else they turned off.
 */
function takeStatedSubject(text: string): { body: string; subject: string | null } {
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1) {
    return { body: text, subject: null };
  }
  const match = SUBJECT_LINE.exec(lines[first].trim());
  if (!match) {
    return { body: text, subject: null };
  }
  lines.splice(0, first + 1);
  return { body: lines.join('\n').replace(/^\s+/, ''), subject: match[1].trim() };
}

/**
 * The first block as a subject, when it reads like one — and removed from the
 * body if so, because a title shown twice looks like a mistake.
 *
 * A leading heading is unambiguous. A bare first line is a guess, so it is
 * hedged: one line, short, no sentence-ending punctuation, and something after
 * it. That last condition matters most — without it a one-line note becomes a
 * subject with an empty body, which is the worst possible outcome for the
 * shortest possible input.
 */
function takeInferredSubject(blocks: Block[]): string | null {
  const first = blocks[0];
  if (!first || blocks.length < 2) {
    return null;
  }
  if (first.kind === 'heading') {
    blocks.shift();
    return flatten(first.spans);
  }
  if (first.kind !== 'paragraph') {
    return null;
  }
  const line = flatten(first.spans).trim();
  if (line === '' || line.includes('\n') || line.length > MAX_SUBJECT) {
    return null;
  }
  if (/[.!?,:;]$/.test(line) || GREETING.test(line)) {
    return null;
  }
  blocks.shift();
  return line;
}

/** Tag the opening and closing paragraphs so a shell can set them apart. */
function markRoles(blocks: Block[]): void {
  const paragraphs = blocks.filter((block) => block.kind === 'paragraph');
  const first = paragraphs[0];
  if (first && GREETING.test(flatten(first.spans).trim())) {
    first.role = 'greeting';
  }
  const last = paragraphs[paragraphs.length - 1];
  if (last && last !== first && SIGNOFF.test(flatten(last.spans).trim())) {
    last.role = 'signoff';
  }
}

/** Blank-line-separated paragraphs, with nothing else interpreted. */
function plainParagraphs(text: string): Block[] {
  return text
    .split(/\r?\n[ \t]*\r?\n/)
    .map((chunk) => chunk.replace(/\r\n/g, '\n').trim())
    .filter((chunk) => chunk !== '')
    .map((chunk) => ({ kind: 'paragraph', spans: [{ text: chunk }] }) as Block);
}

function toBlocks(tokens: Token[]): Block[] {
  const blocks: Block[] = [];
  for (const token of tokens) {
    const block = toBlock(token);
    if (block) {
      blocks.push(block);
    }
  }
  return blocks;
}

function toBlock(token: Token): Block | null {
  switch (token.type) {
    case 'heading': {
      const heading = token as Tokens.Heading;
      const level = Math.min(heading.depth, 3) as 1 | 2 | 3;
      return { kind: 'heading', level, spans: spansOf(heading.tokens) };
    }
    case 'paragraph': {
      const spans = spansOf((token as Tokens.Paragraph).tokens);
      return asButton(spans) ?? { kind: 'paragraph', spans };
    }
    case 'list': {
      const list = token as Tokens.List;
      return {
        kind: 'list',
        ordered: list.ordered,
        items: list.items.map((item) => spansOf(item.tokens)),
      };
    }
    case 'hr':
      return { kind: 'rule' };
    // A fenced block, a table, a blockquote: no renderer here has a form for
    // them, and dropping the words would be worse than flattening them.
    case 'code':
      return { kind: 'paragraph', spans: [{ text: (token as Tokens.Code).text, code: true }] };
    case 'blockquote':
      return { kind: 'paragraph', spans: spansOf((token as Tokens.Blockquote).tokens) };
    case 'space':
      return null;
    default: {
      const text = (token as { raw?: string }).raw?.trim() ?? '';
      return text === '' ? null : { kind: 'paragraph', spans: [{ text }] };
    }
  }
}

/**
 * A paragraph that is nothing but one link, as a call to action.
 *
 * Only the shells that have a button honour it; the plain look renders it as
 * the link it already was. That keeps the decision in the design rather than in
 * the parser, where it would surprise someone who simply pasted a URL.
 */
function asButton(spans: Span[]): Block | null {
  if (spans.length !== 1) {
    return null;
  }
  const [only] = spans;
  return only.href && only.text.trim() !== ''
    ? { kind: 'button', text: only.text.trim(), href: only.href }
    : null;
}

/**
 * Inline tokens as flat runs of marked-up text.
 *
 * Raw HTML is deliberately *not* passed through — it is taken as the characters
 * the person typed and escaped downstream like any other text. The preview runs
 * in a scriptless sandbox, but the `.html` and `.eml` this produces get opened
 * in a mail client, and a tool that quietly forwards markup into a file bound
 * for someone else's inbox is doing something nobody asked it to.
 */
function spansOf(tokens: Token[] | undefined, marks: Omit<Span, 'text'> = {}): Span[] {
  const spans: Span[] = [];
  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'strong':
        spans.push(...spansOf((token as Tokens.Strong).tokens, { ...marks, bold: true }));
        break;
      case 'em':
        spans.push(...spansOf((token as Tokens.Em).tokens, { ...marks, italic: true }));
        break;
      case 'link': {
        const link = token as Tokens.Link;
        const inner = spansOf(link.tokens, { ...marks, href: link.href });
        spans.push(...(inner.length ? inner : [{ ...marks, href: link.href, text: link.text }]));
        break;
      }
      case 'codespan':
        spans.push({ ...marks, code: true, text: (token as Tokens.Codespan).text });
        break;
      case 'br':
        spans.push({ ...marks, text: '\n' });
        break;
      case 'text': {
        const inner = token as Tokens.Text;
        if (inner.tokens?.length) {
          spans.push(...spansOf(inner.tokens, marks));
        } else {
          spans.push({ ...marks, text: inner.text });
        }
        break;
      }
      case 'escape':
        spans.push({ ...marks, text: (token as Tokens.Escape).text });
        break;
      default: {
        // Raw HTML lands here, as do del and anything else without a form of
        // its own. `raw` is what was typed, which is what gets escaped later.
        const raw = (token as { raw?: string; text?: string }).raw ?? '';
        if (raw !== '') {
          spans.push({ ...marks, text: raw });
        }
        break;
      }
    }
  }
  return spans;
}

/** The text of a run of spans, marks discarded. */
export function flatten(spans: readonly Span[]): string {
  return spans.map((span) => span.text).join('');
}

/** Every block as plain text — the readable half of a multipart email. */
export function draftToText(draft: Draft): string {
  const lines: string[] = [];
  for (const block of draft.blocks) {
    switch (block.kind) {
      case 'heading':
        lines.push(flatten(block.spans), '');
        break;
      case 'paragraph':
        lines.push(flatten(block.spans), '');
        break;
      case 'list':
        block.items.forEach((item, index) => {
          lines.push(`${block.ordered ? `${index + 1}.` : '*'} ${flatten(item)}`);
        });
        lines.push('');
        break;
      case 'button':
        lines.push(`${block.text}: ${block.href}`, '');
        break;
      case 'rule':
        lines.push('---', '');
        break;
    }
  }
  return lines.join('\n').trim();
}
