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
 *
 *   GET /health -> 200 (used by Fly's health checks; needs no secret)
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.COMPRESS_SECRET ?? '';

/** A little above the Worker's 20 MB cap so the Worker rejects first. */
const MAX_BYTES = 25 * 1024 * 1024;

/** gs can hang on malformed input; give a job this long before we kill it. */
const GS_TIMEOUT_MS = 90_000;

/**
 * Ghostscript's `-dPDFSETTINGS` presets, cheapest quality last. The Worker sends
 * one of these names; anything else is rejected rather than silently defaulted.
 */
const PRESETS = new Set(['screen', 'ebook', 'printer', 'prepress', 'default']);

function send(res, status, code, message) {
  const body = JSON.stringify({ error: { code, message } });
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/compress') {
    send(res, 404, 'NOT_FOUND', 'Unknown endpoint.');
    return;
  }

  // Constant-ish check is fine here; the secret is high-entropy and the service
  // is not public-facing by design.
  const auth = req.headers['authorization'] ?? '';
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    send(res, 401, 'UNAUTHORIZED', 'Missing or invalid credentials.');
    return;
  }

  const preset = url.searchParams.get('preset') ?? 'ebook';
  if (!PRESETS.has(preset)) {
    send(res, 400, 'INVALID_INPUT', `"${preset}" is not a supported preset.`);
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
    const output = await runGhostscript(input, preset);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': String(output.length),
    });
    res.end(output);
  } catch (error) {
    const killed = error && (error.killed || error.signal === 'SIGTERM');
    if (killed) {
      send(res, 504, 'TIMEOUT', 'Compression took too long and was stopped.');
    } else {
      send(res, 502, 'UPSTREAM_REJECTED', 'Ghostscript could not process this document.');
    }
  }
});

server.listen(PORT, () => {
  console.log(`pdf-compress listening on :${PORT}`);
});
