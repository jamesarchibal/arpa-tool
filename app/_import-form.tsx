'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { importBatch } from './actions';
import type { IntakeResult } from '@/lib/arpa/intake';

/**
 * Drop a SABI export in, get scored opportunities out.
 *
 * ── Why the parse happens in the BROWSER and not in the server action ──
 * A SABI export is a dossier, not a table: one worksheet per company, 349 rows
 * by 76 columns, and a single company file is already 210 KB. Vercel caps a
 * request body at 4.5 MB, so uploading the raw file would start failing at
 * around twenty companies, which is a normal filter result. Parsing here and
 * sending compact JSON removes that ceiling entirely.
 *
 * The client is therefore NOT trusted: `importBatch` revalidates every row with
 * zod and rejects implausible magnitudes, exactly as it did when a human pasted
 * the JSON by hand.
 *
 * SheetJS is loaded with a dynamic import so its ~900 KB stays out of the
 * first-load bundle of a page that is mostly a table.
 */
export default function ImportForm() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onPick(file: File) {
    setMessage(null);
    setWarnings([]);
    setResult(null);

    let rows: Awaited<ReturnType<typeof readFile>>['rows'];
    let parseWarnings: string[];
    try {
      const parsed = await readFile(file);
      rows = parsed.rows;
      parseWarnings = parsed.warnings;
    } catch (error) {
      setMessage({
        ok: false,
        text: `No he podido leer el fichero: ${error instanceof Error ? error.message : 'error'}`,
      });
      return;
    }

    setWarnings(parseWarnings);

    if (rows.length === 0) {
      setMessage({ ok: false, text: 'No he encontrado ninguna empresa en el fichero.' });
      return;
    }

    startTransition(async () => {
      // `units: 'eur'` is not a guess: SABI prints euros and the schema stores
      // millions. Getting this wrong passes the 1-5 M€ mandate filter and
      // falsifies every score without throwing, so it is hard-coded next to
      // the parser that produced the figures rather than left to the user.
      const res = await importBatch({
        units: 'eur',
        label: `SABI · ${file.name}`,
        rows,
      });
      setMessage({ ok: res.ok, text: res.message });
      setResult(res.result ?? null);
      if (res.result && res.result.created + res.result.updated > 0) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept=".xls,.xlsx,.xlsm"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so picking the same file twice fires onChange again, which
            // is what you do after fixing the export in SABI.
            event.target.value = '';
            if (file) void onPick(file);
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {pending ? 'Importando...' : 'Subir export de SABI'}
        </button>
        <span className="text-xs text-ink-faint">.xls o .xlsx, tal cual sale de SABI</span>
        {message ? (
          <span className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
            {message.text}
          </span>
        ) : null}
      </div>

      {warnings.length > 0 ? (
        <ul className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {result ? <ResultTable result={result} /> : null}
    </div>
  );
}

async function readFile(file: File) {
  const { parseSabiWorkbook } = await import('@/lib/arpa/sabi-xls');
  return parseSabiWorkbook(await file.arrayBuffer());
}

function Verdict({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="text-ink-faint">—</span>;
  const tone =
    v === 'Proceed'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : v === 'Pass'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {v}
    </span>
  );
}

function ResultTable({ result }: { result: IntakeResult }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-bg-elevated text-left text-[11px] uppercase tracking-wider text-ink-mute">
          <tr>
            <th className="px-3 py-2 font-medium">Empresa</th>
            <th className="px-3 py-2 font-medium">NIF</th>
            <th className="px-3 py-2 font-medium">Resultado</th>
            <th className="px-3 py-2 text-right font-medium">QSS</th>
            <th className="px-3 py-2 font-medium">Veredicto</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={`${r.cif ?? r.legal_name}-${i}`} className="border-t border-border">
              <td className="px-3 py-2 text-ink">{r.legal_name}</td>
              <td className="px-3 py-2 text-xs tabular-nums text-ink-soft">{r.cif ?? '—'}</td>
              <td className="px-3 py-2 text-xs">
                {r.status === 'rejected' ? (
                  <span className="text-rose-600">rechazada</span>
                ) : (
                  <span className="text-ink-soft">
                    {r.status === 'created' ? 'nueva' : 'actualizada'}
                  </span>
                )}
                {r.reason ? <div className="text-[11px] text-rose-600">{r.reason}</div> : null}
              </td>
              <td className="px-3 py-2 text-right text-xs tabular-nums text-ink">{r.qss ?? '—'}</td>
              <td className="px-3 py-2">
                <Verdict v={r.verdict} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
