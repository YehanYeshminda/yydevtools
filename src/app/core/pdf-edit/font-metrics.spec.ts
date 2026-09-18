import { PDFDocument, PDFName, type PDFContext, type PDFDict, type PDFRef } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import { notInStandardFonts, readPageFonts, standardFaceFor } from './font-metrics';

/**
 * The fonts here are built by hand rather than embedded, because the shapes
 * that matter are the dictionary shapes: a subset Type0 whose ToUnicode CMap is
 * the only route from bytes to characters, a simple font whose `/Differences`
 * override the encoding, and a Standard 14 that declares no widths at all.
 * Embedding a real font file would test fontkit instead.
 */
async function pageWithFonts(
  build: (context: PDFContext) => Record<string, PDFRef>,
): Promise<Map<string, ReturnType<typeof readPageFonts> extends Map<string, infer F> ? F : never>> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const fonts = build(doc.context);
  page.node.set(PDFName.of('Resources'), doc.context.obj({ Font: fonts }) as PDFDict);
  return readPageFonts(page.node.Resources());
}

/** A CMap with one `bfchar` table and one `bfrange`, as producers emit them. */
const CMAP = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
2 beginbfchar
<0003> <0020>
<00B2> <2014>
endbfchar
2 beginbfrange
<0013> <001C> <0030>
<0024> <0026> <0041>
endbfrange
endcmap
end
end`;

function type0(context: PDFContext): Record<string, PDFRef> {
  const toUnicode = context.register(context.stream(CMAP));
  const descendant = context.register(
    context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'AAAAAA+Georgia',
      // Both shapes the /W array allows: a list for consecutive codes, and a
      // first-last-width triple for a range.
      W: [3, [250], 0x13, 0x1c, 500, 0x24, [700, 720, 740]],
      DW: 999,
    }),
  );
  return {
    F1: context.register(
      context.obj({
        Type: 'Font',
        Subtype: 'Type0',
        BaseFont: 'AAAAAA+Georgia',
        Encoding: 'Identity-H',
        DescendantFonts: [descendant],
        ToUnicode: toUnicode,
      }),
    ),
  };
}

describe('a composite (Type0) font', () => {
  it('reads two-byte codes and says what they spell', async () => {
    const font = (await pageWithFonts(type0)).get('F1')!;
    expect(font.twoByte).toBe(true);
    expect(font.family).toBe('Georgia');
    const codes = font.decode(Uint8Array.of(0x00, 0x24, 0x00, 0x03, 0x00, 0x13));
    expect(codes).toEqual([0x24, 0x03, 0x13]);
    expect(font.textOf(codes)).toBe('A 0');
  });

  it('takes widths from both shapes of the /W array', async () => {
    const font = (await pageWithFonts(type0)).get('F1')!;
    expect(font.widthOf(3)).toBe(250);
    expect(font.widthOf(0x18)).toBe(500);
    expect(font.widthOf(0x25)).toBe(720);
  });

  it('falls back to /DW for a code the array never mentions', async () => {
    const font = (await pageWithFonts(type0)).get('F1')!;
    expect(font.widthOf(0x99)).toBe(999);
  });

  it('writes back the codes the document already uses', async () => {
    const font = (await pageWithFonts(type0)).get('F1')!;
    expect([...(font.encode('CAB') ?? [])]).toEqual([0x00, 0x26, 0x00, 0x24, 0x00, 0x25]);
  });

  it('refuses a character the subset has no glyph for', async () => {
    const font = (await pageWithFonts(type0)).get('F1')!;
    // The CMap covers 0-9, A-C, space and an em dash. "Z" is not in the file.
    expect(font.missing('AZ9')).toEqual(['Z']);
    expect(font.encode('AZ9')).toBeNull();
  });

  it('reads a bfchar entry that stands for a character outside Latin-1', async () => {
    const font = (await pageWithFonts(type0)).get('F1')!;
    expect(font.textOf([0xb2])).toBe('—');
  });
});

function simple(context: PDFContext): Record<string, PDFRef> {
  return {
    F1: context.register(
      context.obj({
        Type: 'Font',
        Subtype: 'TrueType',
        BaseFont: 'BBBBBB+Consolas',
        FirstChar: 65,
        Widths: [600, 610, 620],
        Encoding: { Type: 'Encoding', Differences: [66, 'bullet'] },
      }),
    ),
  };
}

describe('a simple (one-byte) font', () => {
  it('reads one code per byte and measures by /Widths', async () => {
    const font = (await pageWithFonts(simple)).get('F1')!;
    expect(font.twoByte).toBe(false);
    expect(font.decode(Uint8Array.of(65, 67))).toEqual([65, 67]);
    expect(font.widthOf(65)).toBe(600);
    expect(font.widthOf(67)).toBe(620);
  });

  it('lets /Differences override the base encoding', async () => {
    const font = (await pageWithFonts(simple)).get('F1')!;
    expect(font.textOf([65])).toBe('A');
    expect(font.textOf([66])).toBe('•');
    expect([...(font.encode('•') ?? [])]).toEqual([66]);
  });

  it('applies word spacing to code 32 and nothing else', async () => {
    const font = (await pageWithFonts(simple)).get('F1')!;
    expect(font.isWordSpace(32)).toBe(true);
    expect(font.isWordSpace(65)).toBe(false);
  });
});

describe('a Standard 14 font that declares no widths', () => {
  it('measures from the built-in metrics instead of coming back as zero', async () => {
    const fonts = await pageWithFonts((context) => ({
      F1: context.register(
        context.obj({
          Type: 'Font',
          Subtype: 'Type1',
          BaseFont: 'Helvetica',
          Encoding: 'WinAnsiEncoding',
        }),
      ),
    }));
    const font = fonts.get('F1')!;
    // The AFM numbers for Helvetica, which a viewer would use for the same page.
    expect(font.widthOf(65)).toBe(667);
    expect(font.widthOf(32)).toBe(278);
    expect(font.textOf([65, 32, 66])).toBe('A B');
  });
});

describe('standardFaceFor', () => {
  it('keeps weight and slope while swapping the family', () => {
    expect(standardFaceFor('AAAAAA+Arial-BoldMT')).toBe('Helvetica-Bold');
    expect(standardFaceFor('Georgia-Italic')).toBe('Times-Italic');
    expect(standardFaceFor('CourierNewPSMT')).toBe('Courier');
    expect(standardFaceFor('Georgia-BoldItalic')).toBe('Times-BoldItalic');
  });

  it('sends anything it does not recognise to Helvetica', () => {
    expect(standardFaceFor('Whitney-Book')).toBe('Helvetica');
  });
});

describe('notInStandardFonts', () => {
  it('passes anything WinAnsi covers', () => {
    expect(notInStandardFonts('Fée — 42 £')).toEqual([]);
  });

  it('names what it cannot write, once each', () => {
    expect(notInStandardFonts('日本語日')).toEqual(['日', '本', '語']);
  });
});
