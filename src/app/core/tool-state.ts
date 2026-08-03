/**
 * Keeping a tool's state across a reload, and putting it in a link.
 *
 * Two features from one mechanism, and both are shaped by the same constraint:
 * this is a site whose entire promise is that what you paste stays on your
 * device.
 *
 * **Session restore.** A reload used to wipe everything — a long regex, a page
 * of JSON, two texts being compared. State is now mirrored into
 * `sessionStorage`, deliberately not `localStorage`: session storage is scoped
 * to the one tab and is gone when that tab closes, so nothing survives on disk
 * for the next person to use the machine. It solves the accidental refresh,
 * which is the actual complaint, without becoming a place where a stranger's
 * JSON quietly accumulates.
 *
 * **Share links.** The state is encoded into the URL's **hash fragment**, which
 * is the whole reason this is safe to offer: a fragment is never transmitted.
 * It does not appear in the request line, in Cloudflare's logs, in an access
 * log, or in a `Referer` header sent to a third party. The same data in a query
 * string would be written to disk in several places before the page even
 * rendered.
 *
 * Sharing is also never automatic. The address bar is not rewritten as you
 * type — a link exists only when you press the button that makes one, so state
 * cannot leak into browser history or a screen-share by accident.
 *
 * Tools whose state is a credential (JWT Decoder, the Hash Generator's HMAC
 * key) do not use this at all. See `tool-state.md` in the tool list below.
 */
import {
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

/** Prefix for the session-storage keys, so they are recognisable in devtools. */
const STORAGE_PREFIX = 'toolstate:';

/** The fragment parameter carrying an encoded state. */
const HASH_KEY = 's';

/**
 * Longest encoded payload we will put in a link.
 *
 * Browsers accept far more, but links get pasted into chat clients, issue
 * trackers and email, several of which truncate or wrap well before that. Past
 * this the button says the content is too large rather than handing over a URL
 * that will arrive broken.
 */
const MAX_LINK_CHARS = 4000;

/** How long to wait after a change before writing to storage. */
const WRITE_DEBOUNCE_MS = 300;

export interface ToolStateOptions<T extends object> {
  /** Unique per tool — the route slug. */
  key: string;
  /** The current state. Read reactively, so it must call signals. */
  snapshot: () => T;
  /** Apply a restored state. Receives only keys the tool itself declared. */
  restore: (state: Partial<T>) => void;
  /**
   * Keys left out of a share link but still kept for session restore. For
   * anything that is a secret in someone else's hands.
   */
  omitFromLink?: readonly (keyof T & string)[];
  /** Set false for tools whose state should never become a URL. */
  shareable?: boolean;
}

export interface ToolState {
  /**
   * An absolute URL carrying the current state, or null when there is nothing
   * worth sharing or it will not fit.
   */
  readonly link: Signal<string | null>;
  /** True when there is state, but it is too large to encode into a link. */
  readonly tooLarge: Signal<boolean>;
  /** Forget the stored state for this tool. */
  clear(): void;
}

/**
 * Wires a tool up to session restore and (optionally) share links.
 *
 * Call from a component's field initialiser or constructor — it uses `inject()`
 * and registers an effect, so it needs an injection context.
 */
export function syncToolState<T extends object>(options: ToolStateOptions<T>): ToolState {
  const injector = inject(Injector);

  const shareable = options.shareable ?? true;
  const storageKey = `${STORAGE_PREFIX}${options.key}`;

  /**
   * The state as first constructed, used for two things: deciding what counts
   * as "unchanged" (and so not worth a link), and fixing the set of keys a
   * restore is allowed to touch.
   */
  const initial = untracked(() => options.snapshot());
  const initialJson = JSON.stringify(initial);
  const allowedKeys = new Set(Object.keys(initial));

  /** Tracks the live state so `link` recomputes as the user types. */
  const current = signal(initialJson);
  const restored = signal(false);

  const link = computed<string | null>(() => {
    if (!shareable || !restored()) {
      return null;
    }
    const json = current();
    if (json === initialJson) {
      return null; // nothing has been entered yet
    }
    const encoded = encodeState(stripKeys(JSON.parse(json), options.omitFromLink));
    if (encoded === null || encoded.length > MAX_LINK_CHARS) {
      return null;
    }
    return `${location.origin}${location.pathname}#${HASH_KEY}=${encoded}`;
  });

  const tooLarge = computed(() => {
    if (!shareable || !restored() || current() === initialJson) {
      return false;
    }
    return link() === null;
  });

  afterNextRender(
    () => {
      // A shared link wins over whatever this tab was last doing: arriving via
      // someone else's URL should show their state, not yours.
      const fromLink = readHash();
      const state = fromLink ?? readStorage(storageKey);
      if (state) {
        const filtered = pickKeys(state, allowedKeys);
        if (Object.keys(filtered).length > 0) {
          options.restore(filtered as Partial<T>);
        }
      }
      restored.set(true);

      // Only start mirroring after the restore, so the effect's first run
      // cannot write the empty initial state over what we just recovered.
      effect(
        (onCleanup) => {
          const json = safeStringify(options.snapshot());
          if (json === null) {
            return;
          }
          current.set(json);
          const handle = setTimeout(() => writeStorage(storageKey, json, initialJson), WRITE_DEBOUNCE_MS);
          onCleanup(() => clearTimeout(handle));
        },
        { injector },
      );
    },
    { injector },
  );

  return {
    link,
    tooLarge,
    clear: () => removeStorage(storageKey),
  };
}

// --- Storage --------------------------------------------------------------

function readStorage(key: string): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? asRecord(JSON.parse(raw)) : null;
  } catch {
    return null; // disabled storage, or a value written by an older version
  }
}

function writeStorage(key: string, json: string, initialJson: string): void {
  try {
    if (json === initialJson) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, json);
    }
  } catch {
    // Private mode, or the quota is full. Losing the restore is not worth an error.
  }
}

function removeStorage(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // As above.
  }
}

// --- The URL fragment -----------------------------------------------------

function readHash(): Record<string, unknown> | null {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  if (hash === '') {
    return null;
  }
  const encoded = new URLSearchParams(hash).get(HASH_KEY);
  return encoded ? decodeState(encoded) : null;
}

// --- Encoding -------------------------------------------------------------

/**
 * JSON, deflated, as base64url.
 *
 * The compression is what makes this practical: the states worth sharing are
 * text — a regex and its test string, a page of JSON, two revisions being
 * diffed — and text deflates to a fraction of its size, which is the difference
 * between a link that fits and one that does not. Base64url keeps it safe in a
 * fragment without any further escaping.
 */
export function encodeState(value: unknown): string | null {
  try {
    const bytes = deflateSync(strToU8(JSON.stringify(value)), { level: 9 });
    return toBase64Url(bytes);
  } catch {
    return null;
  }
}

/** Reverses `encodeState`. Returns null for anything unreadable. */
export function decodeState(encoded: string): Record<string, unknown> | null {
  try {
    const json = strFromU8(inflateSync(fromBase64Url(encoded)));
    return asRecord(JSON.parse(json));
  } catch {
    // A truncated, corrupted or hand-edited link. Falling back to the tool's
    // own defaults is a better outcome than an error page.
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  // btoa's output is padded to a multiple of four; atob wants it back.
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

// --- Shaping --------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Drops the keys a tool marked as secret before they can reach a link. */
export function stripKeys(
  state: Record<string, unknown>,
  omit: readonly string[] | undefined,
): Record<string, unknown> {
  if (!omit?.length) {
    return state;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!omit.includes(key)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Keeps only the keys the tool actually declared.
 *
 * A link is untrusted input — anyone can hand-edit the fragment — so a restore
 * applies the tool's own shape and nothing else, rather than spreading whatever
 * the URL happened to contain into the component.
 */
export function pickKeys(
  state: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (allowed.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null; // a cycle, or a value JSON cannot represent
  }
}
