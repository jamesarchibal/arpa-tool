/**
 * Reads a SABI (Bureau van Dijk) Excel export into intake rows.
 *
 * WHAT THE FILE ACTUALLY IS, because it is not what you would guess:
 * SABI's "Excel Exporter" does not emit a table. It emits a *report*, one
 * company per worksheet, laid out visually for a human: 76 columns, ~350 rows,
 * 2804 merged cells, section headings in column 0, and twenty years of accounts
 * spread sideways. A header-row-to-column mapper finds nothing here.
 *
 * So this is a label scraper, not a column mapper. We look up each figure by
 * the Spanish label SABI prints next to it. Two consequences worth knowing:
 *
 * 1. Sheets are named "Page 1", "Page 2", ... One sheet is one company, so a
 *    single-company export and a 200-company export parse through the same
 *    code path. Nothing special is needed for bulk.
 *
 * 2. The year header row and the data rows DO NOT share column indexes. The
 *    header prints 31/12/2025 at column 14 while its figure sits at column 10,
 *    because both are merged ranges of different widths. Aligning by column
 *    index silently shifts every year by one. We align by ORDER instead: the
 *    nth figure in a data row belongs to the nth year in the header row. That
 *    is safe here because SABI writes "n.d." for a missing year rather than
 *    leaving the cell empty, so every data row has exactly one entry per year.
 *    `series()` enforces the count and refuses to guess if it ever disagrees.
 *
 * Everything is returned in EUROS, exactly as SABI prints it. The caller must
 * pass `units: 'eur'` to the intake so it converts to the millions the schema
 * stores. Getting that wrong does not throw, it just makes every company look
 * a million times bigger and silently passes ARPA's 1-5 M€ EBITDA filter.
 */

import * as XLSX from 'xlsx';

type Cell = string | number | boolean | Date | null;

/** One company, shaped for `intakeRowSchema`. Zod does the validating. */
export type SabiCompany = {
  legal_name: string;
  cif: string | null;
  city: string | null;
  region: string | null;
  country: string;
  cnae: string | null;
  employees: number | null;
  founded_year: number | null;
  revenue: (number | null)[];
  ebitda: (number | null)[];
  net_debt: number | null;
  working_capital: number | null;
  notes: string | null;
  source: string;
};

export type SabiParseResult = {
  rows: SabiCompany[];
  /** One line per sheet we could not read, so the UI can say which and why. */
  warnings: string[];
};

/** Lowercase, unaccented, single-spaced. SABI is inconsistent about all three. */
function norm(v: Cell): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * SABI writes "n.d." for not disclosed, which is NOT zero: a zero would drag an
 * average down while a null leaves the year out of the calculation entirely.
 */
function money(v: Cell): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v instanceof Date) return null;
  const s = v.trim();
  if (s === '' || s === '-' || /^n\.?\s*d\.?$/i.test(s)) return null;
  // "3.926.157 EUR" -> 3926157. Strip the currency, then the thousands dots.
  const cleaned = s
    .replace(/\s*(eur|€|miles|mil)\s*$/i, '')
    .replace(/[\s€]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const f = Number.parseFloat(cleaned);
  return Number.isFinite(f) ? f : null;
}

/** Pulls a 4-digit year out of a Date cell or a dd/mm/yyyy string. */
function year(v: Cell): number | null {
  if (v instanceof Date) return v.getUTCFullYear();
  const m = String(v ?? '').match(/(19|20)\d{2}/);
  if (!m) return null;
  const y = Number(m[0]);
  return y >= 1800 && y <= 2100 ? y : null;
}

/**
 * yyyy-mm-dd from the cell's own calendar day. `toISOString` would shift a
 * 31/12 midnight date in CET back to the 30th, which reads as a typo.
 */
function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The last non-null entry of a series, i.e. the most recent year reported. */
function latest(xs: (number | null)[]): number | null {
  for (let i = xs.length - 1; i >= 0; i -= 1) {
    if (xs[i] !== null) return xs[i];
  }
  return null;
}

function parseSheet(ws: XLSX.WorkSheet, sheetName: string): SabiCompany | string {
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });

  /** Non-empty cells of a row as [columnIndex, value], left to right. */
  const cells = (i: number): [number, Cell][] =>
    (grid[i] ?? [])
      .map((v, j) => [j, v] as [number, Cell])
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');

  /** Non-empty cells of a row, skipping the label in column 0. */
  const values = (i: number): Cell[] => cells(i).filter(([j]) => j > 0).map(([, v]) => v);

  const rowWithLabel = (label: string): number =>
    grid.findIndex((r) => norm(r?.[0] ?? null) === label);

  /**
   * The value printed to the right of a label, wherever the label sits. SABI
   * puts "Código NIF" in column 11 and its value in column 20; "Forma jurídica"
   * in column 0 and its value in column 9. Exact match on the normalised label,
   * so "forma juridica" never captures "forma juridica detallada".
   */
  const rightOf = (label: string): Cell => {
    for (let i = 0; i < grid.length; i += 1) {
      const row = cells(i);
      const at = row.findIndex(([, v]) => norm(v) === label);
      if (at >= 0 && at + 1 < row.length) return row[at + 1][1];
    }
    return null;
  };

  /** The first non-empty column-0 text below a section heading. */
  const under = (label: string): string | null => {
    const start = rowWithLabel(label);
    if (start < 0) return null;
    for (let i = start + 1; i < Math.min(start + 5, grid.length); i += 1) {
      const v = grid[i]?.[0];
      if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
    }
    return null;
  };

  // --- identity ---------------------------------------------------------
  // The name is alone on the first row. Scan a couple of rows in case the
  // export gains a banner, but stop before row 2, which is the address line.
  let legalName = '';
  for (let i = 0; i < 2 && !legalName; i += 1) {
    const first = cells(i)[0];
    if (first) legalName = String(first[1]).trim();
  }
  if (!legalName) return `${sheetName}: no se encontró el nombre de la empresa.`;

  const cifRaw = rightOf('codigo nif') ?? rightOf('nif');
  const cif = cifRaw ? String(cifRaw).toUpperCase().replace(/[^A-Z0-9]/g, '') || null : null;

  // Row 2 is a single parseable line: "43830 TORREDEMBARRA (TARRAGONA, ESPANA)".
  // Cheaper and far more reliable than walking the contact block, which varies.
  let city: string | null = null;
  let region: string | null = null;
  for (let i = 0; i < 6 && !region; i += 1) {
    const m = String(grid[i]?.[0] ?? '').match(/^\s*\d{5}\s+(.+?)\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/);
    if (m) {
      city = m[1].trim();
      region = m[2].trim();
    }
  }

  const founded = year(rightOf('fecha constitucion'));

  // --- activity ---------------------------------------------------------
  // CNAE 2009 first: it is the vintage the BORME pass and the taxonomy use, so
  // matching on it keeps the two sources comparable.
  let cnae: string | null = null;
  for (const heading of ['codigo(s) cnae 2009', 'cnae 2025 code(s)', 'codigo(s) nace rev. 2']) {
    const start = rowWithLabel(heading);
    if (start < 0) continue;
    for (let i = start + 1; i < Math.min(start + 6, grid.length); i += 1) {
      const row = cells(i);
      if (row.length === 0) continue;
      const code = String(row[0][1]).trim();
      if (!/^\d{3,6}$/.test(code)) continue; // skips the "Código(s) primario :" line
      const desc = row.length > 2 ? String(row[row.length - 1][1]).trim() : '';
      cnae = `${code}${desc ? ` ${desc}` : ''}`.slice(0, 120);
      break;
    }
    if (cnae) break;
  }

  // --- accounts ---------------------------------------------------------
  const headerIdx = grid.findIndex((r) => /^cuentas (no )?consolidadas$/.test(norm(r?.[0] ?? null)));
  if (headerIdx < 0) return `${sheetName}: no se encontró el bloque de cuentas.`;

  // WHICH set of accounts this is. The regex above accepts either, takes the
  // first block in the sheet and used to throw the answer away, which is the
  // difference between screening a company and screening its whole group.
  // PROMOCIONS LLORENS exports consolidated only: 56 M€ of revenue and 8.3 M€
  // of EBITDA over three companies. ARPA's mandate is 1-5 M€ of EBITDA, so the
  // deal was sized, and killed on k2, on figures that are not the target's.
  const consolidated = !/no consolidadas/i.test(String(grid[headerIdx]?.[0] ?? ''));

  // The intake reads the LAST three entries as the three most recent years, so
  // everything below must come out ascending.
  //
  // Do NOT assume a direction. SABI emits both: an export of one company prints
  // 2017 -> 2024 left to right, a list export prints 2025 -> 2023. Hardcoding
  // "newest first" does not fail loudly on the other layout, it silently hands
  // over the series backwards, so `latest()` returns the OLDEST year and the
  // scoring reads a 2017 headcount as today's. Read the direction off the header.
  const fileYears = values(headerIdx).map(year).filter((y): y is number => y !== null);
  if (fileYears.length === 0) return `${sheetName}: el bloque de cuentas no tiene años legibles.`;
  const descending = fileYears.length > 1 && fileYears[0] > fileYears[fileYears.length - 1];
  const asc = <T,>(xs: T[]): T[] => (descending ? [...xs].reverse() : xs);
  const years = asc(fileYears);

  const series = (label: string): (number | null)[] => {
    const i = rowWithLabel(label);
    if (i < 0) return [];
    const raw = values(i);
    // Refuse rather than misalign. A length mismatch means this row does not
    // carry one figure per year, so matching them up by order would be fiction.
    if (raw.length !== years.length) return [];
    return asc(raw.map(money));
  };

  const revenue = series('ingresos de explotacion');
  const ebitda = series('ebitda');
  const employeeSeries = series('numero empleados');
  const cash = series('tesoreria');
  const shortDebt = series('deudas financieras');
  const longDebt = series('acreedores a l. p.');
  const workingCapital = series('fondo de maniobra');

  // Net debt is a PROXY, not a reported figure. Abbreviated Spanish accounts do
  // not break out all interest-bearing debt, and "Acreedores a L. P." can hold
  // non-financial items. Good enough to rank on, never good enough to price on.
  const nd = [latest(shortDebt), latest(longDebt), latest(cash)];
  const netDebt =
    nd.some((v) => v !== null) ? (nd[0] ?? 0) + (nd[1] ?? 0) - (nd[2] ?? 0) : null;

  // --- context we do not model as columns -------------------------------
  // Ownership is deliberately NOT inferred. A "Global Ultimate Owner" line can
  // mean a family holding or a trade parent, and that distinction drives the
  // OWNERSHIP_FIT criterion. Guessing it would quietly bias the score, so the
  // raw sentence goes in the notes for a human to read.
  const noteParts: [string, Cell][] = [
    ['Actividad', under('descripcion actividad')],
    ['Estado', rightOf('estado detallado') ?? rightOf('estado')],
    ['Forma jurídica', rightOf('forma juridica detallada') ?? rightOf('forma juridica')],
    ['Capital social (EUR)', rightOf('capital social (eur)')],
    // Both officers, not just the CEO. Together with the appointment dates they
    // are the succession signal a human reads to set OWNERSHIP_FIT, and dropping
    // the president halved it.
    ['Presidente', rightOf('presidente')],
    ['Director ejecutivo', rightOf('director ejecutivo')],
    // SABI says here whether the other basis exists at all. "Cons. & No Cons."
    // next to a consolidated block means the target's own accounts are one
    // re-export away, which is the first thing to do before trusting the size.
    ['Cuentas disponibles', rightOf('cuentas disponibles')],
    ['Últimas cuentas', rightOf('fecha ultimas cuentas')],
    ['Independencia BvD', rightOf('indicador independencia bvd')],
    ['Accionistas', rightOf('num. accionistas')],
  ];
  const guo = grid
    .map((r) => String(r?.[0] ?? ''))
    .find((s) => /global ultimate owner/i.test(s));

  const notes = [
    ...noteParts
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(([k, v]) => `${k}: ${v instanceof Date ? localDate(v) : String(v).trim()}`),
    guo ? guo.trim() : null,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000);

  return {
    legal_name: legalName,
    cif,
    city,
    region,
    country: 'ES',
    cnae,
    employees: latest(employeeSeries),
    founded_year: founded,
    revenue,
    ebitda,
    net_debt: netDebt,
    working_capital: latest(workingCapital),
    notes: notes || null,
    // The basis rides with the figures. It lands in `financials_src`, which the
    // ficha already prints, so nobody can read an EBITDA off this import without
    // being told whether it belongs to the company or to its group.
    source: `SABI · ${sheetName} · ${consolidated ? 'cuentas consolidadas' : 'cuentas individuales'}`,
  };
}

/**
 * Parses every worksheet in a SABI export. One worksheet is one company.
 *
 * A sheet that cannot be read produces a warning and is skipped, so one odd
 * company in a batch of two hundred never costs the other hundred and ninety
 * nine. The caller shows the warnings.
 */
export function parseSabiWorkbook(data: ArrayBuffer | Uint8Array): SabiParseResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });

  const rows: SabiCompany[] = [];
  const warnings: string[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const parsed = parseSheet(ws, name);
    if (typeof parsed === 'string') warnings.push(parsed);
    else rows.push(parsed);
  }

  if (rows.length === 0 && warnings.length === 0) {
    warnings.push('El fichero no contiene hojas legibles.');
  }

  return { rows, warnings };
}
