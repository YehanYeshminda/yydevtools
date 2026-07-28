/**
 * Image compression service, powered by sharp.
 *
 * Private companion to the Worker. The Worker forwards the raw image with a
 * shared secret; we re-encode (and optionally resize) it with sharp — which uses
 * mozjpeg for JPEG and libimagequant for palette PNG — and stream it back.
 *
 *   POST /compress?format=jpeg|webp|png&quality=80&max=1920
 *     Authorization: Bearer <IMAGE_SECRET>
 *     body: <image bytes>  ->  200 <re-encoded image>
 *   GET /health -> ok
 */

import { createServer } from 'node:http';
import sharp from 'sharp';

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.IMAGE_SECRET ?? '';

const MAX_BYTES = 25 * 1024 * 1024;

const FORMATS = new Set(['jpeg', 'webp', 'png']);
const MIME = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };

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

async function reencode(input, format, quality, max) {
  // `rotate()` with no args bakes in EXIF orientation so phone photos aren't
  // sideways; `failOn: 'none'` tolerates slightly-truncated files.
  let pipeline = sharp(input, { failOn: 'none' }).rotate();

  if (max > 0) {
    pipeline = pipeline.resize({
      width: max,
      height: max,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  if (format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality });
  } else {
    // Palette + quality routes PNG through libimagequant (pngquant-style).
    pipeline = pipeline.png({ palette: true, quality, compressionLevel: 9 });
  }

  return pipeline.toBuffer();
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

  if (!SECRET || (req.headers['authorization'] ?? '') !== `Bearer ${SECRET}`) {
    send(res, 401, 'UNAUTHORIZED', 'Missing or invalid credentials.');
    return;
  }

  const format = url.searchParams.get('format') ?? 'jpeg';
  if (!FORMATS.has(format)) {
    send(res, 400, 'INVALID_INPUT', `"${format}" is not a supported output format.`);
    return;
  }

  const quality = clamp(Number(url.searchParams.get('quality')), 1, 100, 80);
  const max = clamp(Number(url.searchParams.get('max')), 0, 10000, 0);

  let input;
  try {
    input = await readBody(req);
  } catch (error) {
    if (error && error.tooLarge) {
      send(res, 413, 'TOO_LARGE', 'That image is larger than this tool allows.');
    } else {
      send(res, 400, 'INVALID_INPUT', 'The request body could not be read.');
    }
    return;
  }
  if (input.length === 0) {
    send(res, 400, 'INVALID_INPUT', 'No image was sent.');
    return;
  }

  try {
    const output = await reencode(input, format, quality, max);
    res.writeHead(200, {
      'Content-Type': MIME[format],
      'Content-Length': String(output.length),
    });
    res.end(output);
  } catch {
    // sharp throws on inputs it cannot decode — that is a bad-input case.
    send(res, 400, 'INVALID_INPUT', 'That image could not be read or re-encoded.');
  }
});

/** Parses a query number, clamping to [min, max]; NaN falls back to `fallback`. */
function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

server.listen(PORT, () => console.log(`image-compress listening on :${PORT}`));
