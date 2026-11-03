# Writes src/app/tools/resume-builder/resume-glyphs.ts from the resume fonts.
# Usage: python scripts/resume-glyphs.py public/fonts/resume src/app/tools/resume-builder/resume-glyphs.ts
# Needs PyMuPDF (pip install pymupdf).
import fitz, sys
D = sys.argv[1]; out = sys.argv[2]
fam = {
  'Inter': ['Inter-Regular','Inter-Italic','Inter-SemiBold','Inter-Bold'],
  'Serif': ['SourceSerif4-Regular','SourceSerif4-Italic','SourceSerif4-SemiBold','SourceSerif4-Bold'],
  'Sans': ['SourceSans3-Regular','SourceSans3-Italic','SourceSans3-SemiBold','SourceSans3-Bold'],
  'Playfair': ['PlayfairDisplay-SemiBold','PlayfairDisplay-Bold'],
  'Manrope': ['Manrope-Bold','Manrope-ExtraBold'],
}
lines = []
for name, files in fam.items():
    fonts = [fitz.Font(fontfile=f'{D}/{f}.ttf') for f in files]
    ranges = []; start = None
    for cp in range(0x20, 0x3000):
        ok = all(f.has_glyph(cp) for f in fonts)
        if ok and start is None: start = cp
        if not ok and start is not None: ranges.append((start, cp - 1)); start = None
    if start is not None: ranges.append((start, 0x2fff))
    flat = ','.join(f'0x{a:x},0x{b:x}' for a, b in ranges)
    lines.append(f'  {name}: [{flat}],')
    print(name, len(ranges), 'ranges')
with open(out, 'w', newline='\n') as fh:
    fh.write('''/**
 * Which characters each resume font can draw, as [first, last, first, last, ...]
 * code point ranges below U+3000.
 *
 * GENERATED from the TTFs in public/fonts/resume with PyMuPDF (Font.has_glyph),
 * counting a character only when every weight of the family has it. Regenerate
 * when a font file changes. Used to warn before a missing glyph silently turns
 * into a gap in somebody's resume.
 */
export const GLYPH_RANGES: Record<string, readonly number[]> = {
''' + '\n'.join(lines) + '\n};\n')
