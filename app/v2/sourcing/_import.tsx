'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { importSabiCompanies, type SabiImportResult } from '../actions';

/**
 * Drop a SABI export on the long list.
 *
 * The workbook is parsed HERE, in the browser, and only compact JSON crosses the
 * wire. That is not a style choice: one SABI worksheet per company is 210 KB and
 * Vercel caps a request body at 4.5 MB, so sending the file would start failing
 * at about twenty companies, which is a normal filter result in SABI. The server
 * action revalidates every figure, so the client is not trusted either way.
 *
 * SheetJS is a dynamic import so its ~900 KB stays out of the first load of a
 * screen that is mostly a table.
 *
 * `lib/arpa/sabi-xls.ts` is V1 code reused as is. It is the one hard part of this
 * feature (a SABI export is a visual report, not a table) and it has its own
 * tests. V1 is not edited, only imported.
 */
export default function ImportSabi() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<SabiImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onPick(file: File) {
    setMessage(null);
    setWarnings([]);
    setResult(null);

    let parsed: Awaited<ReturnType<typeof readFile>>;
    try {
      parsed = await readFile(file);
    } catch (error) {
      setMessage({
        ok: false,
        text: `No he podido leer el fichero: ${error instanceof Error ? error.message : 'error'}`,
      });
      return;
    }

    setWarnings(parsed.warnings);
    if (parsed.rows.length === 0) {
      setMessage({ ok: false, text: 'No he encontrado ninguna empresa en el fichero.' });
      return;
    }

    startTransition(async () => {
      // Only the fields the mapping reads. The parser also returns a CIF, a city
      // and a net-debt proxy, and `ios_companies` has no column for any of them:
      // sending them would be inventing fields in his schema.
      const res = await importSabiCompanies({
        rows: parsed.rows.map((r) => ({
          legal_name: r.legal_name,
          region: r.region,
          cnae: r.cnae,
          revenue: r.revenue,
          ebitda: r.ebitda,
          notes: r.notes,
        })),
      });
      setMessage({ ok: res.ok, text: res.message });
      setResult(res);
      if (res.created + res.updated > 0) router.refresh();
    });
  }

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-dashed border-strong bg-bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept=".xls,.xlsx,.xlsm"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so picking the same file twice fires onChange again, which is
            // what you do after fixing the export in SABI.
            event.target.value = '';
            if (file) void onPick(file);
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink-mute transition hover:border-brand hover:text-brand disabled:opacity-40"
        >
          {pending ? 'Importando...' : 'Importar export de SABI'}
        </button>
        <span className="text-[11px] text-ink-faint">
          .xls o .xlsx tal cual sale de SABI. Empareja por nombre, así que repetir
          el mismo fichero no duplica nada.
        </span>
        {message ? (
          <span className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
            {message.text}
          </span>
        ) : null}
      </div>

      {warnings.length > 0 ? (
        <ul className="space-y-0.5 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {result && result.rows.length > 0 ? (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                <th className="px-3 py-1.5">Empresa</th>
                <th className="px-3 py-1.5">Resultado</th>
                <th className="px-3 py-1.5">Arquetipo por CNAE</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.name} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5 text-ink">{r.name}</td>
                  <td className="px-3 py-1.5 text-ink-mute">
                    {r.status === 'created'
                      ? 'nueva'
                      : r.status === 'updated'
                        ? 'actualizada'
                        : 'sin cambios'}
                  </td>
                  {/* Empty when the CNAE is claimed by several archetypes, which
                      is normal: half his library shares 7120. A guess here would
                      file the company under a confident wrong archetype. */}
                  <td className="px-3 py-1.5 text-ink-faint">
                    {r.archetype ?? 'sin determinar, asígnalo a mano'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

async function readFile(file: File) {
  const { parseSabiWorkbook } = await import('@/lib/arpa/sabi-xls');
  return parseSabiWorkbook(await file.arrayBuffer());
}
