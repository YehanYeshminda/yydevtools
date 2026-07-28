/**
 * Convert service: PDF -> Office formats via LibreOffice headless.
 *
 * Private companion to the Worker, same shape as the other services. The Worker
 * forwards the PDF with a shared secret; we run `soffice --convert-to` and stream
 * the result back. Free per call, not metered.
 *
 *   POST /convert?format=docx|rtf|xlsx|pptx   Authorization: Bearer <CONVERT_SECRET>
 *     body: application/pdf  ->  200 <office bytes>
 *   GET /health -> ok
 *
 * QUALITY NOTE: LibreOffice imports a PDF as a Draw document, so docx/rtf come
 * out usable but xlsx/pptx are rough. This is a known limitation of the
 * open-source path, not a bug in this service.
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.CONVERT_SECRET ?? '';

const MAX_BYTES = 25 * 1024 * 1024;
const CONVERT_TIMEOUT_MS = 120_000;

/** Target format -> the LibreOffice export filter and result MIME type. */
const FORMATS = {
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  rtf: { mime: 'application/rtf' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
};

function send(res, status, code, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message } }));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(Object.assign(new Error('too large'), { tooLarge: true }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function runConvert(input, format) {
  const dir = await mkdtemp(join(tmpdir(), 'lo-'));
  const inPath = join(dir, `${randomUUID()}.pdf`);
  const outDir = join(dir, 'out');
  try {
    await writeFile(inPath, input);
    await new Promise((resolve, reject) => {
      execFile(
        'soffice',
        [
          '--headless',
          '--nologo',
          '--nofirststartwizard',
          // A private profile per call keeps concurrent conversions from
          // clobbering each other's LibreOffice user directory.
          `-env:UserInstallation=file://${join(dir, 'profile')}`,
          // Without this, LibreOffice opens a PDF in Draw, which has no Writer
          // export filters — every conversion dies with "no export filter for
          // <name>.docx found". Forcing the Writer PDF importer loads it as a
          // text document, so docx/rtf export works.
          '--infilter=writer_pdf_import',
          '--convert-to',
          format,
          '--outdir',
          outDir,
          inPath,
        ],
        { timeout: CONVERT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
        (error) => (error ? reject(error) : resolve()),
      );
    });

    // soffice names the output after the input stem; find whatever it wrote.
    const produced = (await readdir(outDir)).find((name) => name.endsWith(`.${format}`));
    if (!produced) {
      throw new Error('no output produced');
    }
    return await readFile(join(outDir, produced));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/convert') {
    send(res, 404, 'NOT_FOUND', 'Unknown endpoint.');
    return;
  }

  if (!SECRET || (req.headers['authorization'] ?? '') !== `Bearer ${SECRET}`) {
    send(res, 401, 'UNAUTHORIZED', 'Missing or invalid credentials.');
    return;
  }

  const format = url.searchParams.get('format') ?? 'docx';
  if (!Object.prototype.hasOwnProperty.call(FORMATS, format)) {
    send(res, 400, 'INVALID_INPUT', `"${format}" is not a supported target format.`);
    return;
  }

  let input;
  try {
    input = await readBody(req);
  } catch (error) {
    if (error && error.tooLarge) {
      send(res, 413, 'TOO_LARGE', 'That file is larger than this tool allows.');
    } else {
      send(res, 400, 'INVALID_INPUT', 'The request body could not be read.');
    }
    return;
  }
  if (input.length === 0) {
    send(res, 400, 'INVALID_INPUT', 'No document was sent.');
    return;
  }

  try {
    const output = await runConvert(input, format);
    res.writeHead(200, {
      'Content-Type': FORMATS[format].mime,
      'Content-Length': String(output.length),
    });
    res.end(output);
  } catch (error) {
    if (error && (error.killed || error.signal === 'SIGTERM')) {
      send(res, 504, 'TIMEOUT', 'Conversion took too long and was stopped.');
    } else {
      send(res, 502, 'UPSTREAM_REJECTED', 'The document could not be converted.');
    }
  }
});

server.listen(PORT, () => console.log(`pdf-convert listening on :${PORT}`));
