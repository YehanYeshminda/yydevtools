/**
 * OCR service: adds a searchable text layer to a PDF with ocrmypdf (Tesseract).
 *
 * A private companion to the Cloudflare Worker, same shape as the compress
 * service: the Worker forwards the PDF with a shared secret, we shell out to
 * `ocrmypdf`, and stream the searchable PDF back. Free per call — not metered.
 *
 *   POST /ocr?lang=eng[&deskew=1]   Authorization: Bearer <OCR_SECRET>
 *     body: application/pdf  ->  200 application/pdf
 *   GET /health -> ok (verifies ocrmypdf is present)
 *
 * The helper block (auth, body reading, PDF sniffing, concurrency gate, logging)
 * mirrors the other two services on purpose — each is its own Docker build
 * context, so a shared module could not be COPYed in without restructuring all
 * three builds.
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.OCR_SECRET ?? '';

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * OCR is slow — a scanned book can take a while — but this has to stay *below*
 * the Worker's budget for this route (currently 165 s).
 *
 * It used to be 240 s, which was longer than the Worker would wait: the Worker
 * gave up at 180 s and returned a timeout, while this machine carried on
 * grinding through pages for another minute, on a 2 GB CPU-heavy VM, producing
 * a document nobody would ever receive. Finishing after the caller has left is
 * pure cost.
 */
const OCR_TIMEOUT_MS = 150_000;

/**
 * ocrmypdf forks a Tesseract process per page and holds page rasters in memory;
 * two at once is what a 2 GB machine can actually survive.
 */
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 2;

/**
 * Tesseract language codes we ship packs for (see Dockerfile). The Worker maps
 * its locale codes onto these; anything else is rejected rather than defaulted.
 */
const LANGS = new Set([
  'eng', 'deu', 'fra', 'spa', 'ita', 'por', 'nld', 'swe',
  'pol', 'tur', 'rus', 'jpn', 'kor', 'chi_sim',
]);

let active = 0;

// --- Small helpers --------------------------------------------------------

function log(fields) {
  console.log(JSON.stringify({ at: new Date().toISOString(), svc: 'pdf-ocr', ...fields }));
}

function send(res, status, code, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message } }));
}

/** Compares the Authorization header without leaking how much of it matched. */
function authorised(header) {
  if (!SECRET) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${SECRET}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** True when the bytes plausibly start a PDF (header within the first KB). */
function looksLikePdf(buffer) {
  return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
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

/** Verifies ocrmypdf is installed, so a broken image fails its health check. */
let toolReady = null;

function verifyTool() {
  if (toolReady) {
    return toolReady;
  }
  toolReady = new Promise((resolve, reject) => {
    execFile('ocrmypdf', ['--version'], { timeout: 20_000 }, (error, stdout) => {
      if (error) {
        toolReady = null;
        reject(error);
      } else {
        resolve(String(stdout).trim());
      }
    });
  });
  return toolReady;
}

// --- OCR ------------------------------------------------------------------

async function runOcr(input, lang, deskew) {
  const dir = await mkdtemp(join(tmpdir(), 'ocr-'));
  const inPath = join(dir, `${randomUUID()}.pdf`);
  const outPath = join(dir, `${randomUUID()}.pdf`);
  try {
    await writeFile(inPath, input);
    const args = [
      '-l', lang,
      // Leave pages that already have real text untouched instead of erroring
      // or rasterizing them; only image pages get a new text layer.
      '--skip-text',
      // Scanners routinely produce sideways pages, and Tesseract reads almost
      // nothing off one. This detects the orientation and turns the page the
      // right way up first, which is often the difference between a useful text
      // layer and an empty one. Needs the `osd` traineddata (see Dockerfile).
      '--rotate-pages',
      // Keep the visual page as-is (no PDF/A colour conversion).
      '--output-type', 'pdf',
      '--optimize', '0',
    ];
    if (deskew) {
      // Straightens a crooked scan before recognition. Off by default because
      // it re-renders the page image, which is a real (if small) quality cost
      // to pay on a scan that was already straight.
      args.push('--deskew');
    }
    args.push(inPath, outPath);

    await new Promise((resolve, reject) => {
      execFile(
        'ocrmypdf',
        args,
        { timeout: OCR_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// --- Server ---------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    try {
      const version = await verifyTool();
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`ok ocrmypdf ${version}`);
    } catch {
      log({ event: 'health_failed' });
      send(res, 503, 'NOT_READY', 'ocrmypdf is not available.');
    }
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/ocr') {
    send(res, 404, 'NOT_FOUND', 'Unknown endpoint.');
    return;
  }

  if (!authorised(req.headers['authorization'])) {
    log({ event: 'unauthorized' });
    send(res, 401, 'UNAUTHORIZED', 'Missing or invalid credentials.');
    return;
  }

  const lang = url.searchParams.get('lang') ?? 'eng';
  if (!LANGS.has(lang)) {
    send(res, 400, 'INVALID_INPUT', `"${lang}" is not an installed OCR language.`);
    return;
  }
  const deskew = url.searchParams.get('deskew') === '1';

  if (active >= MAX_CONCURRENT) {
    log({ event: 'busy', active });
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '15' });
    res.end(
      JSON.stringify({
        error: { code: 'BUSY', message: 'The service is busy. Please try again in a moment.' },
      }),
    );
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
  if (!looksLikePdf(input)) {
    log({ event: 'rejected_not_pdf', bytes: input.length });
    send(res, 400, 'INVALID_INPUT', 'That file is not a PDF.');
    return;
  }

  const started = Date.now();
  active++;
  try {
    const output = await runOcr(input, lang, deskew);
    log({
      event: 'ok',
      lang,
      deskew,
      inBytes: input.length,
      outBytes: output.length,
      ms: Date.now() - started,
    });
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': String(output.length),
    });
    res.end(output);
  } catch (error) {
    const killed = error && (error.killed || error.signal === 'SIGTERM');
    log({
      event: killed ? 'timeout' : 'failed',
      lang,
      inBytes: input.length,
      ms: Date.now() - started,
    });
    if (killed) {
      send(res, 504, 'TIMEOUT', 'OCR took too long and was stopped.');
    } else {
      send(res, 502, 'UPSTREAM_REJECTED', 'The document could not be OCR-processed.');
    }
  } finally {
    active--;
  }
});

server.listen(PORT, () => {
  log({ event: 'listening', port: PORT, maxConcurrent: MAX_CONCURRENT });
  verifyTool().then(
    (version) => log({ event: 'tool_ready', version }),
    (error) => log({ event: 'tool_missing', message: String(error?.message ?? error) }),
  );
});
