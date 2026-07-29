/**
 * Thin, pure wrapper over cronstrue (plain-English description) and cron-parser
 * (upcoming run times). Keeping both behind one function means the component
 * never touches either library directly, and the awkward "one lib accepts an
 * expression the other rejects" cases are resolved in a single, tested place.
 */
import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue';

export interface CronPreview {
  /** Human-readable description, or null when the expression can't be described. */
  description: string | null;
  /** Upcoming fire times as absolute instants, in cron-field order. */
  runs: Date[];
  /** Set only when the expression is non-empty and neither library can read it. */
  error: string | null;
}

export interface CronOptions {
  /** The instant to compute upcoming runs from. */
  from: Date;
  /** IANA time zone the cron fields are interpreted in, e.g. "UTC". */
  tz: string;
  /** How many upcoming runs to return. */
  count: number;
}

export function explainCron(expression: string, options: CronOptions): CronPreview {
  const trimmed = expression.trim();
  if (trimmed === '') {
    return { description: null, runs: [], error: null };
  }

  let description: string | null = null;
  let descriptionError: string | null = null;
  try {
    description = cronstrue.toString(trimmed, { throwExceptionOnParseError: true });
  } catch (error) {
    descriptionError = messageOf(error);
  }

  let runs: Date[] = [];
  let runsError: string | null = null;
  try {
    const parsed = CronExpressionParser.parse(trimmed, {
      currentDate: options.from,
      tz: options.tz,
    });
    runs = parsed.take(options.count).map((date) => date.toDate());
  } catch (error) {
    runsError = messageOf(error);
  }

  // Only surface an error when nothing could be produced at all — if cronstrue
  // described it but cron-parser tripped (or vice versa), show what we have.
  const error = description === null && runs.length === 0 ? (runsError ?? descriptionError) : null;

  return { description, runs, error };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid cron expression';
}
