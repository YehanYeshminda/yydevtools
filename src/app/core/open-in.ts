import type { Tool } from '../tools/tool.model';
import { TOOLS } from '../tools/tools.data';

/**
 * Which tools can open a given file, in the order an "Open in" menu lists them.
 *
 * The file itself travels through FileHandoff, which every <app-dropzone> picks
 * up on load — so a tool belongs here only if its dropzone is on screen when the
 * page opens. A tool that shows one only in a second mode would receive nothing.
 * `e2e/tools-files.spec.ts` opens every entry and checks the dropzone is there.
 *
 * Same matching as drop-targets.ts: extension first, then MIME, because a
 * browser's `type` is blank or wrong often enough for Office files that the
 * name is the better witness. The viewer for a type comes first.
 */
const GROUPS: { ext: RegExp; mime?: RegExp; slugs: string[] }[] = [
  {
    ext: /\.pdf$/,
    mime: /^application\/pdf$/,
    slugs: [
      'pdf-viewer',
      'pdf-edit',
      'pdf-compress',
      'pdf-split',
      'pdf-organizer',
      'pdf-merge',
      'pdf-sign',
      'pdf-watermark',
      'pdf-redact',
      'pdf-ocr',
      'pdf-protect',
      'pdf-convert',
      'pdf-form-fill',
    ],
  },
  { ext: /\.svg$/, mime: /^image\/svg\+xml$/, slugs: ['image-viewer', 'xml-viewer', 'favicon-generator'] },
  {
    ext: /\.(png|jpe?g|gif|webp|avif|bmp|hei[cf])$/,
    mime: /^image\//,
    slugs: [
      'image-viewer',
      'image-ocr',
      'qr-reader',
      'exif-viewer',
      'image-converter',
      'image-compressor',
      'image-resize',
      'background-remover',
      'palette-extractor',
      'passport-photo',
      'favicon-generator',
      'image-pdf',
    ],
  },
  { ext: /\.docx$/, mime: /wordprocessingml/, slugs: ['word-viewer', 'office-to-pdf'] },
  { ext: /\.xlsx$/, mime: /spreadsheetml/, slugs: ['excel-viewer', 'office-to-pdf'] },
  { ext: /\.pptx$/, mime: /presentationml/, slugs: ['powerpoint-viewer', 'office-to-pdf'] },
  { ext: /\.(csv|tsv)$/, mime: /^text\/(csv|tab-separated-values)$/, slugs: ['csv-viewer', 'json-csv'] },
  { ext: /\.(xml|xsd|xsl|rss|atom)$/, mime: /^application\/xml$|\+xml$/, slugs: ['xml-viewer'] },
  { ext: /\.(pem|crt|cer|der)$/, slugs: ['certificate-decoder'] },
  { ext: /\.(webm|mp4|mov|mkv)$/, mime: /^video\//, slugs: ['video-trimmer'] },
];

/**
 * Tools that take any file at all, offered after the type-specific ones. (Not
 * the Hash Generator: it opens on its Text tab, with no dropzone to catch one.)
 */
const ANY_FILE = ['file-inspector'];

/** Every slug this module can send a file to — for the checks that keep it honest. */
export const OPEN_IN_SLUGS: readonly string[] = [
  ...new Set([...GROUPS.flatMap((group) => group.slugs), ...ANY_FILE]),
];

export function openTargets(name: string, mime: string): Tool[] {
  const lower = name.toLowerCase();
  const group =
    GROUPS.find((candidate) => candidate.ext.test(lower)) ??
    GROUPS.find((candidate) => candidate.mime?.test(mime));
  const slugs = [...new Set([...(group?.slugs ?? []), ...ANY_FILE])];
  return slugs
    .map((slug) => TOOLS.find((tool) => tool.slug === slug))
    .filter((tool): tool is Tool => tool !== undefined && tool.ready);
}
