/**
 * Runs every Base64 conversion off the main thread.
 *
 * The work itself, and the shape this exposes, live in `base64-codec.ts` — the
 * client calls that same object directly when a worker is not available, so
 * there is nothing here for the two paths to disagree about.
 *
 * Files are handed over as `File` objects, so their bytes are read here and
 * never materialise on the main thread; decoded bytes are marked for transfer,
 * so the result is moved back rather than copied.
 */
import { expose } from 'comlink';
import { base64Api } from './base64-codec';

expose(base64Api);
