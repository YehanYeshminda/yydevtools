/**
 * OCR service: adds a searchable text layer to a PDF with ocrmypdf (Tesseract).
 *
 * A private companion to the Cloudflare Worker, same shape as the compress
 * service: the Worker forwards the PDF with a shared secret, we shell out to
 * `ocrmypdf`, and stream the searchable PDF back. Free per call — not metered.
 *
 *   POST /ocr?lang=eng            Authorization: Bearer <OCR_SECRET>
 *     body: application/pdf  ->  200 application/pdf
 *   GET /health -> ok
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.OCR_SECRET ?? '';

const MAX_BYTES = 25 * 1024 * 1024;
/** OCR is slow — a scanned book can take a while — so allow generous headroom. */
const OCR_TIMEOUT_MS = 240_000;

/**
 * Tesseract language codes we ship packs for (see Dockerfile). The Worker maps
 * its locale codes onto these; anything else is rejected rather than defaulted.
 */
const LANGS = new Set([
  'eng', 'deu', 'fra', 'spa', 'ita', 'por', 'nld', 'swe',
  'pol', 'tur', 'rus', 'jpn', 'kor', 'chi_sim',
]);

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

async function runOcr(input, lang) {
  const dir = await mkdtemp(join(tmpdir(), 'ocr-'));
  const inPath = join(dir, `${randomUUID()}.pdf`);
  const outPath = join(dir, `${randomUUID()}.pdf`);
  try {
    await writeFile(inPath, input);
    await new Promise((resolve, reject) => {
      execFile(
        'ocrmypdf',
        [
          '-l', lang,
          // Leave pages that already have real text untouched instead of erroring
          // or rasterizing them; only image pages get a new text layer.
          '--skip-text',
          // Keep the visual page as-is (no PDF/A colour conversion).
          '--output-type', 'pdf',
          '--optimize', '0',
          inPath,
          outPath,
        ],
        { timeout: OCR_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    return await readFile(outPath);
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

  if (req.method !== 'POST' || url.pathname !== '/ocr') {
    send(res, 404, 'NOT_FOUND', 'Unknown endpoint.');
    return;
  }

  if (!SECRET || (req.headers['authorization'] ?? '') !== `Bearer ${SECRET}`) {
    send(res, 401, 'UNAUTHORIZED', 'Missing or invalid credentials.');
    return;
  }

  const lang = url.searchParams.get('lang') ?? 'eng';
  if (!LANGS.has(lang)) {
    send(res, 400, 'INVALID_INPUT', `"${lang}" is not an installed OCR language.`);
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
    const output = await runOcr(input, lang);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': String(output.length),
    });
    res.end(output);
  } catch (error) {
    if (error && (error.killed || error.signal === 'SIGTERM')) {
      send(res, 504, 'TIMEOUT', 'OCR took too long and was stopped.');
    } else {
      send(res, 502, 'UPSTREAM_REJECTED', 'The document could not be OCR-processed.');
    }
  }
});

server.listen(PORT, () => console.log(`pdf-ocr listening on :${PORT}`));
