/**
 * The document information a PDF carries, and a copy with it removed.
 *
 * Two places hold it. The Info dictionary is the classic set — title, author,
 * producer, dates — and the XMP stream is the same again in XML, plus an edit
 * history and document IDs that Acrobat and Illustrator maintain. Modern files
 * usually carry both, and they do not always agree.
 *
 * Stripping replaces the Info dictionary with an empty one and drops the XMP
 * stream and any application-private PieceInfo. pdf-lib re-serialises the file
 * to do that, so the bytes change, but the pages are the same objects.
 */
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from '@cantoo/pdf-lib';

export interface PdfField {
  label: string;
  value: string;
  identifying: boolean;
}

export interface PdfMetadata {
  fields: PdfField[];
  pages: number;
  /** True when the file is password-protected; its strings cannot be read here. */
  encrypted: boolean;
  hasXmp: boolean;
}

const INFO: [keyof typeof GETTERS, string, boolean][] = [
  ['title', 'Title', false],
  ['author', 'Author', true],
  ['subject', 'Subject', false],
  ['keywords', 'Keywords', false],
  ['creator', 'Created with', false],
  ['producer', 'Producer', false],
  ['created', 'Created', true],
  ['modified', 'Modified', true],
];

const GETTERS = {
  title: (doc: PDFDocument) => doc.getTitle(),
  author: (doc: PDFDocument) => doc.getAuthor(),
  subject: (doc: PDFDocument) => doc.getSubject(),
  keywords: (doc: PDFDocument) => doc.getKeywords(),
  creator: (doc: PDFDocument) => doc.getCreator(),
  producer: (doc: PDFDocument) => doc.getProducer(),
  created: (doc: PDFDocument) => doc.getCreationDate()?.toISOString(),
  modified: (doc: PDFDocument) => doc.getModificationDate()?.toISOString(),
};

/** XMP elements worth surfacing beyond what Info already said. */
const XMP: [RegExp, string, boolean][] = [
  [/<xmp:CreatorTool>([^<]*)</, 'XMP creator tool', false],
  [/<dc:creator>\s*<rdf:Seq>\s*<rdf:li>([^<]*)</, 'XMP author', true],
  [/<xmpMM:DocumentID>([^<]*)</, 'XMP document ID', true],
  [/<xmpMM:InstanceID>([^<]*)</, 'XMP instance ID', true],
];

export async function readPdfMetadata(bytes: Uint8Array): Promise<PdfMetadata | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return null;
  }
  const encrypted = doc.isEncrypted;
  const fields: PdfField[] = [];
  const xmp = xmpText(doc);

  if (!encrypted) {
    for (const [key, label, identifying] of INFO) {
      let value: string | undefined;
      try {
        value = GETTERS[key](doc);
      } catch {
        value = undefined;
      }
      if (value?.trim()) {
        fields.push({ label, value: value.trim(), identifying });
      }
    }
    for (const [pattern, label, identifying] of XMP) {
      const value = pattern.exec(xmp)?.[1].trim();
      if (value) {
        fields.push({ label, value, identifying });
      }
    }
    const history = (xmp.match(/<stEvt:action>/g) ?? []).length;
    if (history) {
      fields.push({
        label: 'XMP edit history',
        value: `${history} recorded edit${history === 1 ? '' : 's'}`,
        identifying: true,
      });
    }
  }

  return { fields, pages: doc.getPageCount(), encrypted, hasXmp: xmp !== '' };
}

/** A copy with the metadata removed, or null when the file is encrypted. */
export async function stripPdfMetadata(bytes: Uint8Array): Promise<Uint8Array | null> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  if (doc.isEncrypted) {
    return null;
  }
  doc.context.trailerInfo.Info = doc.context.register(doc.context.obj({}));
  doc.catalog.delete(PDFName.of('Metadata'));
  doc.catalog.delete(PDFName.of('PieceInfo'));
  return doc.save();
}

function xmpText(doc: PDFDocument): string {
  try {
    const stream = doc.catalog.lookup(PDFName.of('Metadata'));
    if (!(stream instanceof PDFRawStream)) {
      return '';
    }
    return new TextDecoder('utf-8').decode(decodePDFRawStream(stream).decode());
  } catch {
    return '';
  }
}
