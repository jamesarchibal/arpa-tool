'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { importCalendar, importContacts, type ImportReport } from '../actions';
import { STAKEHOLDER_KINDS } from '@/lib/arpa/lists';

/**
 * Bulk load of the address book and the calendar.
 *
 * Two separate pickers rather than one, because the two files answer different
 * questions and the second one depends on the first: a calendar event is only
 * imported when one of its attendees is already a contact. Doing it in one step
 * would hide that order from the person uploading.
 *
 * The file is read to text in the browser and the text is posted. The parsing
 * happens on the server, so there is a single parser and the client cannot
 * decide what ends up in the database.
 */
export default function ContactUpload() {
  const [report, setReport] = useState<(ImportReport & { what: string }) | null>(null);
  const [kind, setKind] = useState('Owner');
  const [pending, startTransition] = useTransition();
  const csv = useRef<HTMLInputElement>(null);
  const ics = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function run(what: string, file: File, call: (text: string) => Promise<ImportReport>) {
    setReport(null);
    startTransition(async () => {
      const text = await file.text();
      const res = await call(text);
      setReport({ ...res, what });
      if (res.created + res.updated > 0) router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Subir contactos y calendario</h2>
        <p className="mt-1 text-xs text-ink-mute">
          Exporta de Gmail, Outlook o Excel y suelta el fichero aquí. Puedes volver a subir el
          mismo fichero más adelante: se completa lo que falte y no se duplica nada.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink-mute" htmlFor="import_kind">
            Tipo de contacto
          </label>
          <select
            id="import_kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            {STAKEHOLDER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <p className="mt-1 max-w-[220px] text-[10px] text-ink-faint">
            Un CSV no dice qué es cada persona. Se aplica solo a los contactos nuevos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Clearing the value lets the same file be picked twice, which is what
              you do after fixing the export. */}
          <input
            ref={csv}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) {
                run('Contactos', file, (text) =>
                  importContacts({ file_name: file.name, text, kind }));
              }
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => csv.current?.click()}
            className="rounded bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            {pending ? 'Procesando…' : 'Contactos (CSV)'}
          </button>

          <input
            ref={ics}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) {
                run('Calendario', file, (text) =>
                  importCalendar({ file_name: file.name, text }));
              }
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => ics.current?.click()}
            className="rounded border border-border px-3.5 py-2 text-sm font-semibold text-ink-soft transition hover:bg-bg-elevated disabled:opacity-50"
          >
            {pending ? 'Procesando…' : 'Calendario (ICS)'}
          </button>
        </div>
      </div>

      {report ? (
        <div
          className={`rounded border p-3 text-xs ${
            report.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <strong className="font-semibold">{report.what}:</strong> {report.message}
        </div>
      ) : null}

      {report && report.warnings.length > 0 ? (
        <ul className="list-inside list-disc space-y-1 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {report.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
