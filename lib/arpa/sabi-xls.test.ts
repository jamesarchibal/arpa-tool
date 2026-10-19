/**
 * Run: node --test --experimental-strip-types lib/arpa/sabi-xls.test.ts
 *
 * The sheet here is SYNTHETIC on purpose. A real SABI export is licensed data
 * from Bureau van Dijk, and `ENRICH_SOURCES` exists precisely so that copied
 * data stays findable and deletable, so committing one as a fixture would be
 * the wrong trade. What matters is not the real bytes, it is the three traps
 * the real layout sets, and those are reproduced exactly:
 *
 *   1. The year header row and the figure rows use DIFFERENT column indexes
 *      (header at 14/22/29, figures at 10/16/24), because both are merged
 *      ranges of unequal width. This is the bug that silently shifts a company
 *      onto the wrong year's accounts.
 *   2. Years run newest first, while the intake reads the LAST three entries.
 *   3. "n.d." means not disclosed, which must become null and never zero.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';

import { parseSabiWorkbook, type SabiCompany } from './sabi-xls.ts';

/** Places values at explicit column indexes, the way the real export does. */
function row(pairs: Record<number, string | number>): (string | number | null)[] {
  const out: (string | number | null)[] = [];
  const max = Math.max(...Object.keys(pairs).map(Number));
  for (let i = 0; i <= max; i += 1) out[i] = pairs[i] ?? null;
  return out;
}

/**
 * `order: 'asc'` writes the SAME company with its years running oldest first,
 * which is how a single-company export actually prints them. Both layouts must
 * parse to identical output, because the direction is a formatting detail of
 * the report and not a fact about the business.
 */
function build(order: 'desc' | 'asc' = 'desc'): Uint8Array {
  const aoa: (string | number | null)[][] = [];
  const put = (i: number, r: (string | number | null)[]) => {
    while (aoa.length <= i) aoa.push([]);
    aoa[i] = r;
  };
  /** Flips a row's values while leaving the label and the columns alone. */
  const dir = (pairs: Record<number, string | number>): Record<number, string | number> => {
    if (order === 'desc') return pairs;
    const keys = Object.keys(pairs).map(Number).sort((a, b) => a - b);
    const data = keys.filter((k) => k !== 0);
    const flipped: Record<number, string | number> = {};
    if (0 in pairs) flipped[0] = pairs[0];
    data.forEach((k, i) => { flipped[k] = pairs[data[data.length - 1 - i]]; });
    return flipped;
  };

  put(0, row({ 1: 'EJEMPLO INDUSTRIAL SL' }));
  put(2, row({ 0: '08001 BARCELONA (BARCELONA, ESPANA)', 11: 'Código NIF', 20: 'B-12.345.678' }));
  put(19, row({ 0: 'Forma jurídica', 9: 'Sociedad limitada' }));
  put(20, row({ 0: 'Forma jurídica detallada', 9: 'Sociedad limitada unipersonal' }));
  put(22, row({ 0: 'Fecha constitución', 9: '13/03/1996' }));
  put(24, row({ 0: 'Estado', 9: 'Activa' }));
  put(46, row({ 0: 'Descripción actividad' }));
  put(47, row({ 0: 'Fabricación de componentes' }));
  put(53, row({ 0: 'Código(s) CNAE 2009' }));
  put(54, row({ 0: 'Código(s) primario :' }));
  put(55, row({ 0: '2561', 7: ' - ', 8: 'Tratamiento y revestimiento de metales' }));

  // The trap: header columns 14/22/29 against figure columns 10/16/24.
  put(96, row(dir({ 0: 'Cuentas No Consolidadas', 14: '31/12/2025', 22: '31/12/2024', 29: '31/12/2023' })));
  put(97, row({ 14: 'EUR', 22: 'EUR', 29: 'EUR' }));
  put(101, row(dir({ 0: '  Ingresos de explotación', 10: 9_000_000, 16: 8_000_000, 24: 7_000_000 })));
  put(113, row(dir({ 0: '  Número empleados', 10: 42, 16: 40, 24: 38 })));
  put(138, row(dir({ 0: '    Tesorería', 10: 500_000, 16: 400_000, 24: 300_000 })));
  put(147, row(dir({ 0: '   Acreedores a L. P.', 10: 1_000_000, 16: 900_000, 24: 800_000 })));
  put(152, row(dir({ 0: '   Deudas financieras', 10: 200_000, 16: 'n.d.', 24: 'n.d.' })));
  put(158, row(dir({ 0: '  Fondo de maniobra', 10: 1_250_000, 16: 1_100_000, 24: 950_000 })));
  put(188, row(dir({ 0: 'EBITDA', 10: 2_000_000, 16: 1_500_000, 24: 'n.d.' })));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Page 1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xls' }));
}

function only(): SabiCompany {
  const { rows, warnings } = parseSabiWorkbook(build());
  assert.deepEqual(warnings, []);
  assert.equal(rows.length, 1);
  return rows[0];
}

test('reads identity out of the report layout', () => {
  const c = only();
  assert.equal(c.legal_name, 'EJEMPLO INDUSTRIAL SL');
  // Punctuation stripped, so the CIF matches however SABI chose to print it.
  assert.equal(c.cif, 'B12345678');
  assert.equal(c.city, 'BARCELONA');
  assert.equal(c.region, 'BARCELONA');
  assert.equal(c.founded_year, 1996);
  assert.equal(c.cnae, '2561 Tratamiento y revestimiento de metales');
});

test('series come back oldest first, so the last entry is the newest year', () => {
  const c = only();
  // Written 2025, 2024, 2023 in the sheet. The intake reads the tail as recent.
  assert.deepEqual(c.revenue, [7_000_000, 8_000_000, 9_000_000]);
  assert.equal(c.revenue.at(-1), 9_000_000);
});

test('misaligned header and figure columns still land on the right years', () => {
  // The whole point. Aligning by column index would read revenue as
  // [null, null, 9_000_000] and lose two years of history.
  const c = only();
  assert.equal(c.revenue.length, 3);
  assert.ok(c.revenue.every((v) => v !== null));
});

test('n.d. becomes null, never zero', () => {
  const c = only();
  // Zero here would drag any average or growth rate towards a false floor.
  assert.deepEqual(c.ebitda, [null, 1_500_000, 2_000_000]);
  assert.ok(!c.ebitda.includes(0));
});

test('latest figures ignore trailing nulls', () => {
  const c = only();
  assert.equal(c.employees, 42);
  assert.equal(c.working_capital, 1_250_000);
});

test('net debt is short plus long debt minus cash', () => {
  const c = only();
  assert.equal(c.net_debt, 200_000 + 1_000_000 - 500_000);
});

test('figures stay in euros for the intake to convert', () => {
  const c = only();
  // If this ever comes back as 9 rather than 9_000_000 the caller's
  // `units: 'eur'` becomes a million-fold error that passes the EBITDA filter.
  assert.equal(c.revenue.at(-1), 9_000_000);
});

test('an oldest-first export parses identically to a newest-first one', () => {
  // A real single-company SABI export prints 2017 -> 2024 left to right, the
  // opposite of a list export. Assuming one direction does not fail loudly on
  // the other, it hands the series over backwards: `latest()` then returns the
  // OLDEST year, so a 2017 headcount gets scored as today's. Found on a real
  // file where employees came back 72 instead of 230.
  const { rows, warnings } = parseSabiWorkbook(build('asc'));
  assert.deepEqual(warnings, []);
  const c = rows[0];
  assert.deepEqual(c.revenue, [7_000_000, 8_000_000, 9_000_000]);
  assert.deepEqual(c.ebitda, [null, 1_500_000, 2_000_000]);
  assert.equal(c.employees, 42);
  assert.equal(c.working_capital, 1_250_000);
  assert.equal(c.net_debt, 200_000 + 1_000_000 - 500_000);
  assert.deepEqual(c, only());
});

test('a sheet with no accounts block is reported, not thrown', () => {
  const ws = XLSX.utils.aoa_to_sheet([row({ 1: 'SIN CUENTAS SL' })]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Page 1');
  const { rows, warnings } = parseSabiWorkbook(
    new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xls' })),
  );
  assert.equal(rows.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /cuentas/i);
});

test('every sheet is a company, so a bulk export needs no special path', () => {
  const wb = XLSX.read(build(), { type: 'array', cellDates: true });
  const multi = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(multi, wb.Sheets['Page 1'], 'Page 1');
  XLSX.utils.book_append_sheet(multi, wb.Sheets['Page 1'], 'Page 2');
  const { rows } = parseSabiWorkbook(
    new Uint8Array(XLSX.write(multi, { type: 'array', bookType: 'xls' })),
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[1].source, 'SABI · Page 2 · cuentas individuales');
});

test('the source says whether the figures are the group or the company', () => {
  // SABI prints one basis or the other under the same heading, and the parser
  // takes the first block it finds. On the real PROMOCIONS LLORENS export that
  // block is consolidated: 56 M€ of revenue over three companies, against a
  // mandate of 1-5 M€ of EBITDA. Screening that as if it were the target is how
  // a deal inside the band gets killed for being too big, so the basis has to
  // travel with the numbers.
  const wb = XLSX.read(build(), { type: 'array', cellDates: true });
  const ws = wb.Sheets['Page 1'];
  // The fixture's accounts heading, row 96 zero-based, flipped to the other basis.
  ws['A97'] = { t: 's', v: 'Cuentas Consolidadas' };
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, ws, 'Page 1');
  const { rows } = parseSabiWorkbook(
    new Uint8Array(XLSX.write(out, { type: 'array', bookType: 'xls' })),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'SABI · Page 1 · cuentas consolidadas');
});
