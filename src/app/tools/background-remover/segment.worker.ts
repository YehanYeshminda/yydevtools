/**
 * Runs the segmentation model off the main thread.
 *
 * The model is U^2-Net "portable" (u2netp): 4.5 MB of Apache-2.0 weights that
 * predict, for every pixel, how likely it is to belong to the salient object in
 * the frame. It is the small sibling of the 176 MB full model, and the size is
 * the point — anything larger than about 20 MB cannot be served as a Cloudflare
 * Worker asset at all, and the whole promise of this tool is that the photo
 * never leaves the browser. It is genuinely weaker on fine detail; the page says
 * so rather than pretending otherwise.
 *
 * ONNX Runtime is imported through its `wasm` entry point, which bundles the
 * JavaScript glue and leaves only the .wasm binary to fetch. Threads are off:
 * the threaded build needs SharedArrayBuffer, which needs the site to be
 * cross-origin isolated, which would break every other tool that embeds
 * something. One thread is slower and costs nobody else anything.
 */
import { expose, transfer } from 'comlink';
import * as ort from 'onnxruntime-web/wasm';

import { normaliseMask } from './matte';

/** The input size the network was trained at. Not negotiable. */
const SIDE = 320;

/** ImageNet channel statistics, which u2netp's training used. */
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

ort.env.wasm.wasmPaths = '/wasm/';
ort.env.wasm.numThreads = 1;
// Without this the runtime narrates its own start-up into the console, which
// looks like a fault on a page that is otherwise silent.
ort.env.logLevel = 'error';

/** One session per worker, created on first use and kept for later images. */
let opening: Promise<ort.InferenceSession> | null = null;

function session(): Promise<ort.InferenceSession> {
  opening ??= ort.InferenceSession.create('/models/u2netp.onnx', {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  return opening;
}

/** Decodes the file and squares it off to the network's input size. */
async function inputTensor(file: File | Blob): Promise<ort.Tensor> {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(SIDE, SIDE);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('This browser could not prepare the image.');
  }

  // Stretched to a square rather than letterboxed, which is what the reference
  // implementation does — the mask is stretched back the same way afterwards, so
  // the distortion cancels out exactly.
  context.drawImage(bitmap, 0, 0, SIDE, SIDE);
  bitmap.close();

  const { data } = context.getImageData(0, 0, SIDE, SIDE);
  const pixels = SIDE * SIDE;
  // NCHW: all the red, then all the green, then all the blue.
  const values = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    const offset = i * 4;
    values[i] = (data[offset] / 255 - MEAN[0]) / STD[0];
    values[pixels + i] = (data[offset + 1] / 255 - MEAN[1]) / STD[1];
    values[pixels * 2 + i] = (data[offset + 2] / 255 - MEAN[2]) / STD[2];
  }
  return new ort.Tensor('float32', values, [1, 3, SIDE, SIDE]);
}

const api = {
  /**
   * Downloads the runtime and the weights without running anything.
   *
   * Separate from `segment` so the page can start the (large, one-off) download
   * as soon as someone picks a file and say what it is waiting for, instead of
   * showing one unexplained pause that covers both the download and the work.
   */
  async load(): Promise<void> {
    await session();
  },

  /** The salient-object mask, 320x320, stretched to the full 0-1 range. */
  async segment(file: File | Blob): Promise<Float32Array> {
    const active = await session();
    const tensor = await inputTensor(file);

    const outputs = await active.run({ [active.inputNames[0]]: tensor });
    // u2netp emits seven side outputs; the first is the fused one everything
    // else feeds into, and the only one worth reading.
    const first = outputs[active.outputNames[0]];
    const mask = normaliseMask(first.data as Float32Array);

    return transfer(mask, [mask.buffer]);
  },

  /** Frees the session's memory when the tool is closed. */
  async close(): Promise<void> {
    const active = await opening?.catch(() => null);
    await active?.release();
    opening = null;
  },
};

export type SegmentApi = typeof api;

expose(api);
