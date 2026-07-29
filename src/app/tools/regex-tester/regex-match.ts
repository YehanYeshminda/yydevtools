/**
 * Pure helpers behind the regex tester: compile a pattern safely and run it
 * over a subject string, collecting every match with its capture groups. The
 * component only ever renders what these functions return, which keeps the
 * (fiddly) global-flag and zero-width-match handling in one testable place.
 */

export interface CaptureGroup {
  /** 1-based index, or the group name when the pattern uses `(?<name>…)`. */
  label: string;
  value: string | undefined;
}

export interface RegexMatch {
  /** The whole matched substring (group 0). */
  value: string;
  index: number;
  groups: CaptureGroup[];
}

export interface CompileResult {
  regex: RegExp | null;
  error: string | null;
}

export interface MatchRun {
  matches: RegexMatch[];
  /** True when a global search was stopped at the safety cap. */
  truncated: boolean;
}

/** Hard cap so a pathological pattern on a large input cannot lock the tab up. */
const MAX_MATCHES = 10_000;

export function compile(pattern: string, flags: string): CompileResult {
  if (pattern === '') {
    return { regex: null, error: null };
  }
  try {
    return { regex: new RegExp(pattern, flags), error: null };
  } catch (error) {
    return { regex: null, error: error instanceof Error ? error.message : 'Invalid pattern' };
  }
}

export function run(regex: RegExp | null, text: string): MatchRun {
  if (!regex || text === '') {
    return { matches: [], truncated: false };
  }

  // Without the global flag a regex only ever yields its first match; honour
  // that so the tool mirrors real `String.prototype.match` behaviour.
  if (!regex.global) {
    const match = regex.exec(text);
    return { matches: match ? [toMatch(match)] : [], truncated: false };
  }

  const matches: RegexMatch[] = [];
  const sticky = new RegExp(regex.source, regex.flags);
  sticky.lastIndex = 0;
  let result: RegExpExecArray | null;
  while ((result = sticky.exec(text)) !== null) {
    matches.push(toMatch(result));
    // A zero-width match (e.g. /a*/g) does not advance lastIndex; nudge it so
    // the loop terminates instead of spinning on the same position forever.
    if (result[0] === '') {
      sticky.lastIndex++;
    }
    if (matches.length >= MAX_MATCHES) {
      return { matches, truncated: true };
    }
  }
  return { matches, truncated: false };
}

function toMatch(result: RegExpExecArray): RegexMatch {
  const named = result.groups ?? {};
  const namedByValue = new Map<string, string>();
  for (const [name, value] of Object.entries(named)) {
    if (value !== undefined) {
      namedByValue.set(name, value);
    }
  }

  const groups: CaptureGroup[] = [];
  for (let i = 1; i < result.length; i++) {
    const value = result[i];
    // Prefer the group's name when this capture corresponds to a named group.
    const name = value !== undefined ? findName(named, value, groups) : undefined;
    groups.push({ label: name ?? String(i), value });
  }
  return { value: result[0], index: result.index, groups };
}

/** Best-effort mapping of a positional group to its name, if it has one. */
function findName(
  named: Record<string, string | undefined>,
  value: string,
  already: CaptureGroup[],
): string | undefined {
  const used = new Set(already.map((group) => group.label));
  for (const [name, groupValue] of Object.entries(named)) {
    if (groupValue === value && !used.has(name)) {
      return name;
    }
  }
  return undefined;
}
