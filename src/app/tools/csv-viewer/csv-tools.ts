/**
 * The logic around the CSV viewer that is worth testing on its own.
 *
 * Papa Parse does the parsing — it handles the quoting rules, embedded newlines
 * and delimiter sniffing that make hand-rolled CSV splitting wrong on real
 * files. Everything here is what happens either side of it: naming the
 * delimiter it found, working out what a column actually holds, filtering rows
 * and turning the table back into JSON.
 */

/** One parsed row, as an array of cell strings. */
export type Row = string[];

export type ColumnType = 'number' | 'date' | 'boolean' | 'empty' | 'text';

export interface ColumnSummary {
  name: string;
  type: ColumnType;
  /** Cells that are empty or whitespace only. */
  blanks: number;
  /** Distinct non-blank values, capped — enough to spot an identifier column. */
  distinct: number;
}

/**
 * A readable name for the delimiter Papa Parse detected.
 *
 * Worth showing, because a file that looks wrong in a spreadsheet is very often
 * a file whose delimiter was guessed differently by the two programs — a
 * semicolon-separated export from a European locale being the usual case.
 */
export function describeDelimiter(delimiter: string): string {
  switch (delimiter) {
    case ',':
      return 'comma';
    case ';':
      return 'semicolon';
    case '\t':
      return 'tab';
    case '|':
      return 'pipe';
    case ' ':
      return 'space';
    case '':
      return 'none detected';
    default:
      return `"${delimiter}"`;
  }
}

const NUMBER = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d*\.?\d+([eE][+-]?\d+)?$/;
const BOOLEAN = /^(true|false|yes|no|y|n)$/i;
// ISO first, then the common written forms. Deliberately not exhaustive: this
// labels a column for the reader, it does not parse the value.
const DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?Z?$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;

function classify(value: string): ColumnType {
  const text = value.trim();
  if (text === '') {
    return 'empty';
  }
  if (NUMBER.test(text)) {
    return 'number';
  }
  if (DATE.test(text)) {
    return 'date';
  }
  if (BOOLEAN.test(text)) {
    return 'boolean';
  }
  return 'text';
}

/**
 * Describe one column from its values.
 *
 * A column is called a number or a date only if *every* non-blank cell in it
 * looks that way. One stray "N/A" in a price column makes it text, which is the
 * honest answer — and usually the thing you wanted to find out.
 */
export function summariseColumn(name: string, values: readonly string[]): ColumnSummary {
  let blanks = 0;
  const seen = new Set<string>();
  const kinds = new Set<ColumnType>();

  for (const value of values) {
    const kind = classify(value);
    if (kind === 'empty') {
      blanks++;
      continue;
    }
    kinds.add(kind);
    if (seen.size < 1000) {
      seen.add(value.trim());
    }
  }

  let type: ColumnType = 'text';
  if (kinds.size === 0) {
    type = 'empty';
  } else if (kinds.size === 1) {
    type = [...kinds][0];
  }

  return { name, type, blanks, distinct: seen.size };
}

/** Summarise every column of a table. */
export function summarise(headers: readonly string[], rows: readonly Row[]): ColumnSummary[] {
  return headers.map((name, index) =>
    summariseColumn(
      name,
      rows.map((row) => row[index] ?? ''),
    ),
  );
}

/** A row whose cell count does not match the rest of the file. */
export interface RaggedRow {
  /** 1-based line as a person would count it, header included. */
  row: number;
  cells: number;
}

/**
 * Rows whose cell count differs from `expected`.
 *
 * This has to be done here rather than taken from the parser. Papa Parse only
 * reports a field-count mismatch when it is parsing in header mode; asked for
 * plain arrays, as it is here, a short or long row is simply a shorter or
 * longer array and no error is raised. Left unchecked, the most common CSV
 * corruption there is — an unquoted delimiter inside a value, which shifts
 * every field after it in that row — would pass through silently.
 *
 * @param rows      Raw parsed rows, before any padding.
 * @param expected  The cell count the file should have.
 * @param offset    Added to each index, so numbering matches the source file.
 */
export function findRagged(
  rows: readonly Row[],
  expected: number,
  offset = 1,
  limit = 5,
): RaggedRow[] {
  const out: RaggedRow[] = [];
  for (let i = 0; i < rows.length && out.length < limit; i++) {
    const cells = rows[i].length;
    if (cells !== expected) {
      out.push({ row: i + offset + 1, cells });
    }
  }
  return out;
}

/**
 * Rows containing the query in any cell, case-insensitively.
 *
 * Searching every cell rather than a chosen column is deliberate: someone
 * looking for an order number does not want to first work out which column it
 * lives in.
 */
export function filterRows(rows: readonly Row[], query: string): Row[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return rows as Row[];
  }
  return rows.filter((row) => row.some((cell) => (cell ?? '').toLowerCase().includes(needle)));
}

/**
 * Column names for a table with no header row.
 *
 * Spreadsheet lettering, so they match what a user sees in Excel: A…Z, then AA,
 * AB and onwards.
 */
export function columnLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Header names, deduplicated and with blanks filled in. */
export function normaliseHeaders(raw: readonly string[]): string[] {
  const used = new Map<string, number>();
  return raw.map((name, index) => {
    const base = name.trim() === '' ? columnLabel(index) : name.trim();
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    // A duplicate header would otherwise silently overwrite the first when the
    // table is turned into objects.
    return seen === 0 ? base : `${base} (${seen + 1})`;
  });
}

/** The table as an array of objects, which is what most people want out of a CSV. */
export function toObjects(
  headers: readonly string[],
  rows: readonly Row[],
): Record<string, string>[] {
  return rows.map((row) => {
    const object: Record<string, string> = {};
    headers.forEach((name, index) => {
      object[name] = row[index] ?? '';
    });
    return object;
  });
}
