/**
 * Runs every digest off the main thread.
 *
 * The work itself, and the shape this exposes, live in `hash-codec.ts` — the
 * client calls that same object directly when a worker is not available, so
 * there is nothing here for the two paths to disagree about.
 */
import { expose } from 'comlink';
import { hashApi } from './hash-codec';

expose(hashApi);
