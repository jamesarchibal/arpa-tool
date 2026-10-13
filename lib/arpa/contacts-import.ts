/**
 * Readers for the two files a CRM is normally seeded from: an address book
 * export (CSV) and a calendar export (ICS).
 *
 * Both are PURE. No database, no Supabase client, no `window`. They turn text
 * into plain objects and a list of warnings, which is what makes them testable
 * without a fixture of licensed or personal data, and what lets the same code
 * run in the browser (to keep the upload small) and in a unit test.
 *
 * Neither one invents a field. If the export does not say what kind of
 * stakeholder somebody is, the caller decides, because guessing "Owner" from a
 * Gmail contact would put a wrong label on a person's record.
 */

export interface ImportedContact {
  full_name: string;
  email: string | null;
  phone: string | null;
  org: string | null;
  city: string | null;
  notes: string | null;
}

export interface ImportedEvent {
  /** iCalendar UID. The dedupe key, so an event with no UID is dropped. */
  uid: string;
  /** ISO 8601, UTC. */
  starts_at: string;
  summary: string | null;
  detail: string | null;
  /** Lowercased attendee and organiser addresses, de-duplicated. */
  emails: string[];
}

export interface ParseResult<T> {
  rows: T[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits one CSV document into rows of fields.
 *
 * Hand-rolled rather than pulled from npm because the whole job is four rules
 * (quotes, doubled quotes inside quotes, newlines inside quotes, a chosen
 * delimiter) and a dependency here would be a supply chain risk for code that
 * reads a file full of personal data.
 */
function splitCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      quoted = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Which delimiter the file uses, decided on the header line.
 *
 * Spanish Excel writes `;` and Google Contacts writes `,`, and both are called
 * "CSV". Counting on the header rather than on the whole file avoids being
 * fooled by a semicolon inside a notes field.
 */
function sniffDelimiter(firstLine: string): string {
  const outside = firstLine.replace(/"[^"]*"/g, '');
  const semis = (outside.match(/;/g) ?? []).length;
  const commas = (outside.match(/,/g) ?? []).length;
  const tabs = (outside.match(/\t/g) ?? []).length;
  if (tabs > semis && tabs > commas) return '\t';
  return semis > commas ? ';' : ',';
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Header aliases, normalised. Covers what the three exporters people actually
 * use emit: Google Contacts, Outlook, and a hand-made Spanish spreadsheet.
 * First match in the row wins, so the more specific alias is listed first.
 */
const HEADERS: Record<string, string[]> = {
  full_name: ['nombre completo', 'nombre y apellidos', 'full name', 'name', 'nombre', 'display name'],
  first_name: ['first name', 'given name', 'nombre de pila'],
  last_name: ['last name', 'family name', 'apellidos', 'apellido'],
  email: [
    'email',
    'e-mail',
    'correo',
    'correo electronico',
    'email address',
    'e-mail address',
    'e-mail 1 - value',
    'primary email',
  ],
  phone: [
    'telefono',
    'phone',
    'mobile phone',
    'movil',
    'phone 1 - value',
    'business phone',
    'mobile',
  ],
  org: ['organizacion', 'empresa', 'organization name', 'organization', 'company', 'org'],
  city: ['ciudad', 'city', 'poblacion', 'localidad'],
  notes: ['notas', 'notes', 'observaciones', 'comentarios'],
};

/** Column index for each known field, or -1. */
function mapHeader(header: string[]): Record<string, number> {
  const cells = header.map(norm);
  const out: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADERS)) {
    out[field] = cells.findIndex((c) => aliases.includes(c));
  }
  return out;
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

export function parseContactsCsv(text: string): ParseResult<ImportedContact> {
  const body = text.replace(/^\uFEFF/, '');
  if (body.trim() === '') return { rows: [], warnings: ['El fichero está vacío.'] };

  const firstLine = body.split('\n', 1)[0] ?? '';
  const table = splitCsv(body, sniffDelimiter(firstLine));
  const header = table.shift();
  if (!header) return { rows: [], warnings: ['El fichero está vacío.'] };

  const col = mapHeader(header);
  const warnings: string[] = [];

  const hasName = col.full_name >= 0 || col.first_name >= 0 || col.last_name >= 0;
  if (!hasName) {
    return {
      rows: [],
      warnings: [
        'No encuentro una columna de nombre. La cabecera debe tener "Nombre", "Full Name" ' +
          'o bien "First Name" y "Last Name".',
      ],
    };
  }
  if (col.email < 0) {
    warnings.push(
      'El fichero no trae columna de email. Se importarán igual, pero sin email no se pueden ' +
        'cruzar con el calendario ni evitar duplicados en una segunda subida.',
    );
  }

  const rows: ImportedContact[] = [];
  let noName = 0;

  for (const r of table) {
    // A trailing newline produces one empty row. That is not a problem worth
    // reporting.
    if (r.every((c) => c.trim() === '')) continue;

    const at = (i: number) => (i >= 0 ? clean(r[i]) : null);
    const full =
      at(col.full_name) ?? [at(col.first_name), at(col.last_name)].filter(Boolean).join(' ');

    if (!full) {
      noName += 1;
      continue;
    }

    // Only the address, so "Joan <j@x.com>" and a list of three addresses both
    // reduce to something that can be a join key against the calendar.
    const address = at(col.email)?.match(/[^\s<>,;]+@[^\s<>,;]+/)?.[0];

    rows.push({
      full_name: full.slice(0, 200),
      email: address ? address.toLowerCase() : null,
      phone: at(col.phone),
      org: at(col.org),
      city: at(col.city),
      notes: at(col.notes),
    });
  }

  if (noName > 0) warnings.push(`${noName} fila(s) sin nombre, descartadas.`);
  if (rows.length === 0) warnings.push('No he encontrado ningún contacto con nombre.');

  return { rows, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// ICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Undoes iCalendar line folding.
 *
 * RFC 5545 wraps long lines at 75 octets and marks the continuation with a
 * leading space or tab. Skipping this step cuts an ATTENDEE address in half,
 * which fails silently: the event imports with one fewer attendee.
 */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

/**
 * `20261013T090000Z`, `20261013T090000` or `20261013` to an ISO instant.
 *
 * A floating or zoned local time is treated as UTC rather than guessed at. The
 * TZID parameter would need a full tz database to resolve, and being an hour or
 * two out on a logged meeting is harmless, whereas dropping the event is not.
 */
function icsDate(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** `ATTENDEE;CN=Joan;ROLE=REQ:mailto:j@x.com` -> `j@x.com` */
function mailto(value: string): string | null {
  const m = value.match(/mailto:([^\s;,]+@[^\s;,]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Unescape the text escapes RFC 5545 defines for SUMMARY and DESCRIPTION. */
function icsText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

export function parseCalendarIcs(text: string): ParseResult<ImportedEvent> {
  const lines = unfold(text);
  const rows: ImportedEvent[] = [];
  const warnings: string[] = [];

  let open = false;
  let uid = '';
  let start: string | null = null;
  let summary: string | null = null;
  let detail: string | null = null;
  let emails: string[] = [];
  let skippedNoUid = 0;
  let skippedNoDate = 0;

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper.startsWith('BEGIN:VEVENT')) {
      open = true;
      uid = '';
      start = null;
      summary = null;
      detail = null;
      emails = [];
      continue;
    }

    if (upper.startsWith('END:VEVENT')) {
      open = false;
      if (!uid) skippedNoUid += 1;
      else if (!start) skippedNoDate += 1;
      else {
        rows.push({
          uid,
          starts_at: start,
          summary: summary ? summary.slice(0, 1000) : null,
          detail: detail ? detail.slice(0, 8000) : null,
          emails: [...new Set(emails)],
        });
      }
      continue;
    }

    if (!open) continue;

    // The name is everything up to the first `:` that is not inside a quoted
    // parameter value, and parameters are separated from it by `;`.
    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const name = line.slice(0, sep).split(';')[0].toUpperCase();
    const value = line.slice(sep + 1);

    if (name === 'UID') uid = value.trim();
    else if (name === 'DTSTART') start = icsDate(value.trim());
    else if (name === 'SUMMARY') summary = icsText(value);
    else if (name === 'DESCRIPTION') detail = icsText(value);
    else if (name === 'ATTENDEE' || name === 'ORGANIZER') {
      const e = mailto(line);
      if (e) emails.push(e);
    }
  }

  if (skippedNoUid > 0) warnings.push(`${skippedNoUid} evento(s) sin UID, descartados.`);
  if (skippedNoDate > 0) warnings.push(`${skippedNoDate} evento(s) sin fecha, descartados.`);
  if (rows.length === 0 && warnings.length === 0) {
    warnings.push('No he encontrado ningún evento en el fichero.');
  }

  return { rows, warnings };
}
