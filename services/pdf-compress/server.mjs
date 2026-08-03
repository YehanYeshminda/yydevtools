/**
 * Ghostscript PDF-compression service.
 *
 * A single POST endpoint that shells out to `gs` to shrink a PDF. It runs on
 * Fly.io as a private companion to the Cloudflare Worker: the Worker is the only
 * intended caller, and it authenticates with a shared secret. The service is
 * deliberately tiny — no framework, no dependencies — so the image stays small
 * and the attack surface minimal.
 *
 *   POST /compress?preset=screen|ebook|printer
 *     Authorization: Bearer <COMPRESS_SECRET>
 *     body: application/pdf
 *   -> 200 application/pdf, or a JSON { error: { code, message } }
 *      X-Input-Bytes / X-Output-Bytes / X-Compressed: what actually happened
 *
 *   GET /health -> 200 (Fly's health check; verifies Ghostscript is present)
 *
 * The helper block below (auth, body reading, PDF sniffing, the concurrency
 * gate, logging) is repeated near-identically in the OCR and convert services.
 * That is deliberate: each service is its own Docker build context, so a shared
 * module could not be COPYed in without restructuring all three builds, and
 * these are small enough that independent deployability is worth more than
 * removing the duplication.
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.COMPRESS_SECRET ?? '';

/** A little above the Worker's 20 MB cap so the Worker rejects first. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * gs can hang on malformed input; give a job this long before we kill it.
 * Must stay comfortably below the Worker's own budget for this route — a job
 * the Worker has already given up on is pure waste.
 */
const GS_TIMEOUT_MS = 90_000;

/**
 * How many Ghostscript processes may run at once.
 *
 * Ghostscript's image downsampling holds the page raster in memory, so a
 * handful of concurrent 20 MB scans is enough to exhaust a 1 GB machine. Fly's
 * `hard_limit` shapes traffic at the proxy, but it cannot see how heavy a
 * request is; this is the backstop that keeps the machine alive rather than
 * letting the OOM killer decide which request dies.
 */
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 3;

/**
 * Ghostscript's `-dPDFSETTINGS` presets, cheapest quality last. The Worker sends
 * one of these names; anything else is rejected rather than silently defaulted.
 */
const PRESETS = new Set(['screen', 'ebook', 'printer', 'prepress', 'default']);

let active = 0;

// --- Small helpers --------------------------------------------------------

function log(fields) {
  console.log(JSON.stringify({ at: new Date().toISOString(), svc: 'pdf-compress', ...fields }));
}

function send(res, status, code, message) {
  const body = JSON.stringify({ error: { code, message } });
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

/**
 * Compares the Authorization header without leaking how much of it matched.
 *
 * The length check first is unavoidable — `timingSafeEqual` throws on a length
 * mismatch — but the length of "Bearer <hex>" is not the secret part.
 */
function authorised(header) {
  if (!SECRET) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${SECRET}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * True when the bytes plausibly start a PDF.
 *
 * The header is scanned within the first kilobyte rather than required at
 * offset 0: the specification says offset 0, but a great many real files carry
 * leading junk and every reader tolerates it, so being stricter than Ghostscript
 * would reject documents that work fine. The point is to fail obvious garbage in
 * microseconds instead of spending 90 seconds of a shared CPU discovering it.
 */
function looksLikePdf(buffer) {
  return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}

/** Collects the request body, bailing out early if it exceeds the cap. */
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

/**
 * Verifies Ghostscript is actually installed and runnable.
 *
 * A health check that only proves Node is up will happily report a machine
 * healthy when the image is missing its one dependency, and every request then
 * fails with a 502 that looks like a document problem. Success is cached — the
 * binary is not going to disappear — while a failure is retried on the next
 * check so a transient fork failure does not pin the machine as unhealthy.
 */
let toolReady = null;

function verifyTool() {
  if (toolReady) {
    return toolReady;
  }
  toolReady = new Promise((resolve, reject) => {
    execFile('gs', ['--version'], { timeout: 10_000 }, (error, stdout) => {
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

// --- Ghostscript ----------------------------------------------------------

/** Runs Ghostscript over `input` with the given preset and returns the result. */
async function runGhostscript(input, preset) {
  const dir = await mkdtemp(join(tmpdir(), 'gs-'));
  const inPath = join(dir, `${randomUUID()}.pdf`);
  const outPath = join(dir, `${randomUUID()}.pdf`);
  try {
    await writeFile(inPath, input);
    await new Promise((resolve, reject) => {
      execFile(
        'gs',
        [
          '-sDEVICE=pdfwrite',
          '-dCompatibilityLevel=1.4',
          `-dPDFSETTINGS=/${preset}`,
          '-dNOPAUSE',
          '-dQUIET',
          '-dBATCH',
          // Ghostscript otherwise guesses page orientation from the text and
          // silently turns pages sideways — a long-standing surprise for anyone
          // compressing a landscape document.
          '-dAutoRotatePages=/None',
          // Scans and slide decks repeat the same image on many pages; storing
          // it once is free size we would otherwise leave on the table.
          '-dDetectDuplicateImages=true',
          // Never let a document trigger an interactive prompt or run embedded
          // PostScript — this input is untrusted.
          '-dSAFER',
          `-sOutputFile=${outPath}`,
          inPath,
        ],
        { timeout: GS_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    return await readFile(outPath);
  } finally {
    // Best effort — the machine may stop right after, but don't leak temp files.
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
      res.end(`ok gs ${version}`);
    } catch {
      log({ event: 'health_failed' });
      send(res, 503, 'NOT_READY', 'Ghostscript is not available.');
    }
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/compress') {
    send(res, 404, 'NOT_FOUND', 'Unknown endpoint.');
    return;
  }

  if (!authorised(req.headers['authorization'])) {
    log({ event: 'unauthorized' });
    send(res, 401, 'UNAUTHORIZED', 'Missing or invalid credentials.');
    return;
  }

  const preset = url.searchParams.get('preset') ?? 'ebook';
  if (!PRESETS.has(preset)) {
    send(res, 400, 'INVALID_INPUT', `"${preset}" is not a supported preset.`);
    return;
  }

  if (active >= MAX_CONCURRENT) {
    log({ event: 'busy', active });
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
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
    const output = await runGhostscript(input, preset);

    // Ghostscript regularly *grows* a PDF that was already optimised — a linear
    // web-optimised file re-written at /screen can come back bigger. Handing
    // that back would make a tool called "compress" produce a worse file, so the
    // original wins and the headers say which was sent.
    const compressed = output.length < input.length;
    const body = compressed ? output : input;

    log({
      event: 'ok',
      preset,
      inBytes: input.length,
      outBytes: body.length,
      compressed,
      ms: Date.now() - started,
    });

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': String(body.length),
      'X-Input-Bytes': String(input.length),
      'X-Output-Bytes': String(body.length),
      'X-Compressed': compressed ? '1' : '0',
    });
    res.end(body);
  } catch (error) {
    const killed = error && (error.killed || error.signal === 'SIGTERM');
    log({
      event: killed ? 'timeout' : 'failed',
      preset,
      inBytes: input.length,
      ms: Date.now() - started,
    });
    if (killed) {
      send(res, 504, 'TIMEOUT', 'Compression took too long and was stopped.');
    } else {
      send(res, 502, 'UPSTREAM_REJECTED', 'Ghostscript could not process this document.');
    }
  } finally {
    active--;
  }
});

server.listen(PORT, () => {
  log({ event: 'listening', port: PORT, maxConcurrent: MAX_CONCURRENT });
  // Surface a broken image in the logs at boot rather than on the first request.
  verifyTool().then(
    (version) => log({ event: 'tool_ready', version }),
    (error) => log({ event: 'tool_missing', message: String(error?.message ?? error) }),
  );
});
