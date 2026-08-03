/**
 * Convert service: PDF -> Office formats via LibreOffice headless.
 *
 * Private companion to the Worker, same shape as the other services. The Worker
 * forwards the PDF with a shared secret; we run `soffice --convert-to` and stream
 * the result back. Free per call, not metered.
 *
 *   POST /convert?format=docx|rtf   Authorization: Bearer <CONVERT_SECRET>
 *     body: application/pdf  ->  200 <office bytes>
 *   GET /health -> ok (verifies LibreOffice is present)
 *
 * QUALITY NOTE: LibreOffice imports a PDF as a Draw document, so docx/rtf come
 * out usable but xlsx/pptx are rough. This is a known limitation of the
 * open-source path, not a bug in this service — and the reason the Worker only
 * offers docx and rtf.
 *
 * The helper block (auth, body reading, PDF sniffing, concurrency gate, logging)
 * mirrors the other two services on purpose — each is its own Docker build
 * context, so a shared module could not be COPYed in without restructuring all
 * three builds.
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.CONVERT_SECRET ?? '';

const MAX_BYTES = 25 * 1024 * 1024;

/** Stays below the Worker's budget for this route (currently 135 s). */
const CONVERT_TIMEOUT_MS = 120_000;

/**
 * LibreOffice is a full office suite per invocation and is not fond of
 * parallelism even with separate user profiles. Two at once on a 2 GB machine.
 */
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 2;

/** Target format -> the result MIME type. */
const FORMATS = {
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  rtf: { mime: 'application/rtf' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
};

let active = 0;

// --- Small helpers --------------------------------------------------------

function log(fields) {
  console.log(JSON.stringify({ at: new Date().toISOString(), svc: 'pdf-convert', ...fields }));
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

/**
 * True when the bytes plausibly start a PDF (header within the first KB).
 *
 * This matters more here than elsewhere: LibreOffice will cheerfully attempt to
 * import dozens of formats, so without a check the endpoint is a general-purpose
 * document parser exposed to whatever gets through. `--infilter` already pins
 * the importer, and this makes sure the bytes match what we claim to accept.
 */
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

/** Verifies LibreOffice is installed, so a broken image fails its health check. */
let toolReady = null;

function verifyTool() {
  if (toolReady) {
    return toolReady;
  }
  toolReady = new Promise((resolve, reject) => {
    execFile('soffice', ['--version'], { timeout: 30_000 }, (error, stdout) => {
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

// --- LibreOffice ----------------------------------------------------------

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

// --- Server ---------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    try {
      const version = await verifyTool();
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`ok ${version}`);
    } catch {
      log({ event: 'health_failed' });
      send(res, 503, 'NOT_READY', 'LibreOffice is not available.');
    }
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/convert') {
    send(res, 404, 'NOT_FOUND', 'Unknown endpoint.');
    return;
  }

  if (!authorised(req.headers['authorization'])) {
    log({ event: 'unauthorized' });
    send(res, 401, 'UNAUTHORIZED', 'Missing or invalid credentials.');
    return;
  }

  const format = url.searchParams.get('format') ?? 'docx';
  if (!Object.prototype.hasOwnProperty.call(FORMATS, format)) {
    send(res, 400, 'INVALID_INPUT', `"${format}" is not a supported target format.`);
    return;
  }

  if (active >= MAX_CONCURRENT) {
    log({ event: 'busy', active });
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '10' });
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
    const output = await runConvert(input, format);
    log({
      event: 'ok',
      format,
      inBytes: input.length,
      outBytes: output.length,
      ms: Date.now() - started,
    });
    res.writeHead(200, {
      'Content-Type': FORMATS[format].mime,
      'Content-Length': String(output.length),
    });
    res.end(output);
  } catch (error) {
    const killed = error && (error.killed || error.signal === 'SIGTERM');
    log({
      event: killed ? 'timeout' : 'failed',
      format,
      inBytes: input.length,
      ms: Date.now() - started,
    });
    if (killed) {
      send(res, 504, 'TIMEOUT', 'Conversion took too long and was stopped.');
    } else {
      send(res, 502, 'UPSTREAM_REJECTED', 'The document could not be converted.');
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
