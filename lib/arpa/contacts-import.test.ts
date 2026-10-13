import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCalendarIcs, parseContactsCsv } from './contacts-import.ts';

// ─────────────────────────────────────────────────────────────────────────────
// CSV. The traps are all about the file being called "CSV" by four tools that
// write four different things.
// ─────────────────────────────────────────────────────────────────────────────

test('reads a Spanish Excel CSV: semicolon delimiter and a BOM', () => {
  const csv =
    '\uFEFFNombre;Email;Teléfono;Empresa;Ciudad\r\n' +
    'Joan Riera;J.Riera@Example.com;+34 600 11 22 33;Riera Advisors;Barcelona\r\n';

  const { rows, warnings } = parseContactsCsv(csv);

  assert.equal(warnings.length, 0);
  assert.deepEqual(rows, [
    {
      full_name: 'Joan Riera',
      email: 'j.riera@example.com',
      phone: '+34 600 11 22 33',
      org: 'Riera Advisors',
      city: 'Barcelona',
      notes: null,
    },
  ]);
});

test('reads a Google Contacts CSV: comma delimiter and split name columns', () => {
  const csv =
    'First Name,Last Name,Organization Name,E-mail 1 - Value,Phone 1 - Value\n' +
    'Marc,Palà,ARPA Partners,marc@arpa.example,600112233\n';

  const { rows } = parseContactsCsv(csv);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].full_name, 'Marc Palà');
  assert.equal(rows[0].org, 'ARPA Partners');
  assert.equal(rows[0].email, 'marc@arpa.example');
});

test('a semicolon inside a quoted note does not decide the delimiter', () => {
  const csv = 'Nombre,Notas\n' + 'Ana Gil,"vende; quiere cerrar en 2027"\n';

  const { rows } = parseContactsCsv(csv);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].full_name, 'Ana Gil');
  assert.equal(rows[0].notes, 'vende; quiere cerrar en 2027');
});

test('a quoted field keeps its commas, newlines and doubled quotes', () => {
  const csv = 'Nombre,Notas\n' + '"Gil, Ana","dijo ""no"" en enero\nvolver en junio"\n';

  const { rows } = parseContactsCsv(csv);

  assert.equal(rows[0].full_name, 'Gil, Ana');
  assert.equal(rows[0].notes, 'dijo "no" en enero\nvolver en junio');
});

test('"Joan <j@x.com>" reduces to the bare address, because that is the join key', () => {
  const { rows } = parseContactsCsv('Nombre,Email\nJoan,"Joan Riera <J@X.com>"\n');
  assert.equal(rows[0].email, 'j@x.com');
});

test('rows with no name are dropped and counted, not silently lost', () => {
  const csv = 'Nombre,Email\nJoan,a@b.com\n,c@d.com\n,\n';

  const { rows, warnings } = parseContactsCsv(csv);

  assert.equal(rows.length, 1);
  // The fully empty line is a trailing newline, not a row worth reporting.
  assert.deepEqual(warnings, ['1 fila(s) sin nombre, descartadas.']);
});

test('a file with no name column is refused rather than half-imported', () => {
  const { rows, warnings } = parseContactsCsv('Email,Teléfono\na@b.com,600\n');

  assert.equal(rows.length, 0);
  assert.match(warnings[0], /columna de nombre/);
});

test('no email column still imports, but says what that costs', () => {
  const { rows, warnings } = parseContactsCsv('Nombre,Empresa\nJoan,Riera\n');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, null);
  assert.match(warnings[0], /sin email/);
});

// ─────────────────────────────────────────────────────────────────────────────
// ICS
// ─────────────────────────────────────────────────────────────────────────────

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:abc-123@google.com',
  'DTSTART:20261013T090000Z',
  'SUMMARY:Llamada con Valent Plant\\, primera toma de contacto',
  'DESCRIPTION:Hablar de EBITDA\\nY de la sucesión',
  'ORGANIZER;CN=Marc Pala:mailto:Marc@Arpa.Example',
  'ATTENDEE;CN=Joan Riera;ROLE=REQ-PARTICIPANT:mailto:j.riera@exam',
  ' ple.com',
  'ATTENDEE;CN=Joan Riera:mailto:j.riera@example.com',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('reads one event: UID, instant, unescaped text and both addresses', () => {
  const { rows, warnings } = parseCalendarIcs(ICS);

  assert.equal(warnings.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].uid, 'abc-123@google.com');
  assert.equal(rows[0].starts_at, '2026-10-13T09:00:00.000Z');
  assert.equal(rows[0].summary, 'Llamada con Valent Plant, primera toma de contacto');
  assert.equal(rows[0].detail, 'Hablar de EBITDA\nY de la sucesión');
});

test('unfolds a wrapped ATTENDEE line, and de-duplicates the address', () => {
  const { rows } = parseCalendarIcs(ICS);

  // Without unfolding, the folded line yields `j.riera@exam` and the real
  // address is never matched, so the meeting imports against nobody.
  assert.deepEqual(rows[0].emails, ['marc@arpa.example', 'j.riera@example.com']);
});

test('an all-day DTSTART with no time is midnight UTC, not a dropped event', () => {
  const ics = [
    'BEGIN:VEVENT',
    'UID:all-day',
    'DTSTART;VALUE=DATE:20261013',
    'SUMMARY:Visita a planta',
    'END:VEVENT',
  ].join('\n');

  const { rows } = parseCalendarIcs(ics);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].starts_at, '2026-10-13T00:00:00.000Z');
});

test('events with no UID or no date are dropped and counted', () => {
  const ics = [
    'BEGIN:VEVENT',
    'DTSTART:20261013T090000Z',
    'SUMMARY:sin uid',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:sin-fecha',
    'SUMMARY:sin fecha',
    'END:VEVENT',
  ].join('\n');

  const { rows, warnings } = parseCalendarIcs(ics);

  assert.equal(rows.length, 0);
  assert.deepEqual(warnings, [
    '1 evento(s) sin UID, descartados.',
    '1 evento(s) sin fecha, descartados.',
  ]);
});

test('two events come out as two, and state is not carried between them', () => {
  const ics = [
    'BEGIN:VEVENT',
    'UID:one',
    'DTSTART:20261001T080000Z',
    'SUMMARY:uno',
    'ATTENDEE:mailto:a@b.com',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:two',
    'DTSTART:20261002T080000Z',
    'SUMMARY:dos',
    'END:VEVENT',
  ].join('\n');

  const { rows } = parseCalendarIcs(ics);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].emails, ['a@b.com']);
  // The second event had no attendee of its own. If it inherits one, every
  // meeting after the first gets attached to the wrong person.
  assert.deepEqual(rows[1].emails, []);
});
