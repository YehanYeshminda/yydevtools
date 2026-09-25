import type { ToolCategory } from '../tools/tool.model';

/**
 * The words on each category landing page (/developer-tools, /converter-tools,
 * /document-tools). The heading and path live in CATEGORY_META, which tool pages
 * also read for their breadcrumb; this file is only loaded by the landing pages.
 * The tool list is derived from tools.data.ts, so a new tool appears on its
 * category page without touching this file.
 *
 * Keep the copy specific to what the category really holds, and true: the
 * privacy claims here are the same ones the privacy page and the tool pages make.
 */
export interface CategoryCopy {
  /** One paragraph under the H1: what the category is for. */
  lead: string;
  /** Plain paragraphs below the tool list. */
  about: string[];
}

export const CATEGORY_COPY: Record<ToolCategory, CategoryCopy> = {
  Developer: {
    lead:
      'Formatters, decoders, generators and testers for the everyday work around code: JSON, ' +
      'JWTs, hashes, regular expressions, cron schedules, SQL, UUIDs, keys and passwords.',
    about: [
      'Most of these exist because the alternative is pasting something sensitive into a site ' +
        'you know nothing about. A JWT carries claims about a user, a config file carries ' +
        'connection strings, and a password generated somewhere you cannot inspect is a password ' +
        'you cannot trust. Here the work happens in the page: the JSON Formatter, JWT Decoder, ' +
        'Hash Generator and Password Generator never send what you give them anywhere.',
      'Roughly, they cover four jobs. Working with data: formatting and querying JSON, turning ' +
        'it into types, diffing it, and reading XML. Checking text: regular expressions, diffs, ' +
        'invisible characters and case. Generating identifiers and secrets: UUIDs, keys, ' +
        'passwords and one-time links. And reading what something really says: a token, a ' +
        'certificate or a cron schedule, in plain English.',
    ],
  },
  Converter: {
    lead:
      'Change one format into another: images between HEIC, JPEG, PNG, WebP and AVIF, text to ' +
      'and from Base64 or percent-encoding, JSON to CSV, TOML to JSON or YAML, timestamps to ' +
      'dates, and units from one system to another.',
    about: [
      'A conversion is only useful if you know what it changed, so these tools say when ' +
        'something is lost or altered. The TOML Converter warns about values the target format ' +
        'cannot hold, the Image Compressor lets you choose a quality or a target size and ' +
        'decide what happens to the Exif data, and the EXIF Viewer shows the camera, time and ' +
        'GPS location a photo carries before you share it.',
      'The image and video tools do their work on your device, including the heavy ones. The ' +
        'Background Remover runs its segmentation model in the page and the Video Trimmer runs ' +
        'ffmpeg in the page, so a photo or a clip is never uploaded to be processed.',
    ],
  },
  Document: {
    lead:
      'PDFs and office files: merge, split, reorder, compress, sign, redact, fill in and edit ' +
      'PDFs; view Word, Excel, PowerPoint and CSV files without installing anything; and write ' +
      'Markdown, invoices and emails.',
    about: [
      'Most PDF work happens in the page. Merging, splitting, reordering, signing, ' +
        'watermarking, redacting and editing all run in your browser, so a contract or a bank ' +
        'statement never leaves your machine.',
      'A few jobs cannot be done that way: converting a PDF to Word, making a scanned PDF ' +
        'searchable, compressing it, password-protecting or unlocking it, and opening or ' +
        'converting Office files. Those send the file over HTTPS to this site’s own processing ' +
        'service, which deletes it as soon as the request completes. Each one is marked below, ' +
        'and says so on its own page.',
    ],
  },
};
