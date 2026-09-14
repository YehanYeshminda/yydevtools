/**
 * Which tool opens a file dropped somewhere that is not a tool.
 *
 * Extension first, then MIME: a browser fills in `type` from the OS registry,
 * which is blank for anything the machine has no app for, and wrong often
 * enough for Office files that the name is the better witness. Only tools with
 * a dropzone are listed — the text tools take a paste, not a file.
 */
const DROP_TARGETS: { slug: string; ext: RegExp; mime?: RegExp }[] = [
  { slug: 'pdf-viewer', ext: /\.pdf$/, mime: /^application\/pdf$/ },
  { slug: 'word-viewer', ext: /\.docx$/, mime: /wordprocessingml/ },
  { slug: 'excel-viewer', ext: /\.xlsx$/, mime: /spreadsheetml/ },
  { slug: 'powerpoint-viewer', ext: /\.pptx$/, mime: /presentationml/ },
  { slug: 'csv-viewer', ext: /\.(csv|tsv)$/, mime: /^text\/(csv|tab-separated-values)$/ },
  { slug: 'xml-viewer', ext: /\.(xml|xsd|xsl|svg|rss|atom)$/, mime: /xml$/ },
  { slug: 'certificate-decoder', ext: /\.(pem|crt|cer|der)$/ },
  { slug: 'image-compressor', ext: /\.(heic|heif)$/, mime: /^image\// },
];

/**
 * Anything no viewer claims goes to the inspector, which opens every file and
 * answers the question a stray drop is usually asking: what is this?
 */
const FALLBACK = 'file-inspector';

export function toolForFile(name: string, type: string): string {
  const lower = name.toLowerCase();
  return (
    DROP_TARGETS.find((target) => target.ext.test(lower))?.slug ??
    DROP_TARGETS.find((target) => target.mime?.test(type))?.slug ??
    FALLBACK
  );
}
