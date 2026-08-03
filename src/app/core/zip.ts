/**
 * Bundling a batch of results into a single `.zip`.
 *
 * The batch tools all hit the same wall: a browser throttles — and eventually
 * blocks — a burst of programmatic downloads, so "one file per page" or "twenty
 * compressed images" could not simply call `downloadBytes` in a loop. PDF Split
 * warned the user about it rather than solving it. One archive is one download,
 * so the throttle never comes into play.
 *
 * fflate does the deflating in its own worker pool, which keeps a large batch
 * off the main thread for free.
 */
import { zip } from 'fflate';

import { downloadBlob } from './download';

export interface ZipEntry {
  /** Name inside the archive. Collisions are resolved by `uniqueNames`. */
  name: string;
  bytes: Uint8Array;
}

/**
 * Extensions whose contents are already compressed. Deflating them again costs
 * real time and buys nothing — a JPEG typically gets *larger*. These are stored
 * verbatim instead.
 */
const PRECOMPRESSED = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'heic',
  'heif',
  'pdf',
  'zip',
  'gz',
  'br',
  'mp3',
  'mp4',
  'woff',
  'woff2',
]);

/** fflate's deflate level for a member: 0 stores, 6 is its balanced default. */
export function compressionLevel(name: string): 0 | 6 {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return PRECOMPRESSED.has(ext) ? 0 : 6;
}

/**
 * Disambiguates repeated names by suffixing ` (2)`, ` (3)`, … before the
 * extension, the way a file manager does.
 *
 * Two archive members with the same name is not an error a zip reader has to
 * report — several silently keep only the last. Batches hit this constantly:
 * pick `logo.png` from two folders, or split two PDFs that both yield `p1.pdf`.
 * Comparison is case-insensitive because Windows and macOS treat the names that
 * way, and an archive that unpacks to fewer files than it holds is the bug we
 * are avoiding.
 */
export function uniqueNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    if (!taken.has(name.toLowerCase())) {
      taken.add(name.toLowerCase());
      return name;
    }
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${n})${ext}`;
      if (!taken.has(candidate.toLowerCase())) {
        taken.add(candidate.toLowerCase());
        return candidate;
      }
    }
  });
}

/** Build a zip archive from `entries`, de-duplicating their names. */
export function buildZip(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  const names = uniqueNames(entries.map((entry) => entry.name));
  const members: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  entries.forEach((entry, index) => {
    members[names[index]] = [entry.bytes, { level: compressionLevel(names[index]) }];
  });

  return new Promise((resolve, reject) => {
    zip(members, (error, data) => {
      if (error) {
        reject(new Error(`Could not build the archive: ${error.message}`));
      } else {
        resolve(data);
      }
    });
  });
}

/** Build the archive and save it as `zipName`. */
export async function downloadZip(
  entries: readonly ZipEntry[],
  zipName: string,
): Promise<void> {
  const archive = await buildZip(entries);
  downloadBlob(new Blob([archive.slice()], { type: 'application/zip' }), zipName);
}
