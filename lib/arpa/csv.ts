/**
 * CSV written for Spanish Excel, which is the only consumer that matters here.
 *
 * Two defaults in Excel break a plain RFC 4180 file on a Spanish locale:
 * the list separator is `;`, so a comma-separated file lands entirely in
 * column A, and a UTF-8 file without a byte order mark is read as Latin-1, so
 * every accent arrives mangled. Both are handled here rather than asking
 * anyone to walk through the import wizard.
 */

const DELIM = ';';

/** Leading characters that make Excel evaluate a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  // Spanish Excel expects a decimal comma. Safe to emit because the field
  // separator is a semicolon.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';

  const text = Array.isArray(value) ? value.join(' | ') : String(value);
  // A company name or note beginning with `=` or `@` would otherwise be run as
  // a formula when the file is opened. Quote it into an inert string.
  const safe = FORMULA_START.test(text) ? `'${text}` : text;

  return /["\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(DELIM), ...rows.map((r) => r.map(cell).join(DELIM))];
  // CRLF and a BOM, both for Excel.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

/** `YYYY-MM-DD`, for the filename. */
export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
