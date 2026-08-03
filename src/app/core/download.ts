/**
 * Saving a result to disk.
 *
 * Every tool that produces a file had its own copy of the same six lines —
 * make an object URL, build an anchor, click it, revoke. They differed only in
 * the ways you would rather they did not: some revoked the URL, some leaked it,
 * and the PDF tools had to remember to `slice()` a `Uint8Array` so the `Blob`
 * owned a plain `ArrayBuffer` rather than a possibly-shared view.
 */

/**
 * How long a download's object URL is kept alive after the click.
 *
 * Revoking it on the next line — which every tool here used to do — is a race:
 * the browser has to have started reading the blob before the URL goes away,
 * and for a large archive that is not guaranteed. Holding it briefly costs a
 * few seconds of memory and removes the failure mode entirely.
 */
const REVOKE_DELAY_MS = 10_000;

/** Save a blob under `name`. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Save raw bytes under `name`.
 *
 * The `slice()` is not incidental: a `Uint8Array` may be a view onto a larger
 * (or shared) buffer, and handing that straight to `Blob` either copies too
 * much or throws on a `SharedArrayBuffer`. Copying out is the cheap, correct
 * thing to do.
 */
export function downloadBytes(bytes: Uint8Array, name: string, type: string): void {
  downloadBlob(new Blob([bytes.slice()], { type }), name);
}

/** Save a string under `name`, as UTF-8. */
export function downloadText(text: string, name: string, type = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), name);
}

/**
 * A filename stem with any extension removed, falling back to `fallback` when
 * that leaves nothing. Used to derive an output name from an input one.
 */
export function fileStem(name: string, fallback = 'file'): string {
  return name.replace(/\.[^./\\]+$/, '') || fallback;
}
