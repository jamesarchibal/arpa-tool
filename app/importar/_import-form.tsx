'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { importBatch } from '../actions';
import type { IntakeResult } from '@/lib/arpa/intake';

const EXAMPLE = `{
  "units": "eur",
  "label": "CNAE 17.x Cataluña",
  "rows": [
    {
      "legal_name": "VALENT PLANT SL",
      "cif": "B43473370",
      "city": "Torredembarra",
      "region": "Tarragona",
      "cnae": "0130",
      "employees": 42,
      "founded_year": 1996,
      "ownership_type": "Family-owned",
      "revenue": [2895457.07, 3669539.37, 3926156.92],
      "ebitda": [542800.48, 808999.57, 889924.91]
    }
  ]
}`;

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

export default function ImportForm() {
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setMessage(null);
    setResult(null);

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      setMessage({
        ok: false,
        text: `Eso no es JSON válido: ${error instanceof Error ? error.message : 'error'}`,
      });
      return;
    }

    startTransition(async () => {
      const res = await importBatch(payload);
      setMessage({ ok: res.ok, text: res.message });
      setResult(res.result ?? null);
      if (res.result && res.result.created + res.result.updated > 0) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        spellCheck={false}
        placeholder={EXAMPLE}
        className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 font-mono text-[12px] leading-relaxed text-ink placeholder:text-ink-faint"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || text.trim() === ''}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {pending ? 'Importando...' : 'Importar y puntuar'}
        </button>
        <button
          type="button"
          onClick={() => setText(EXAMPLE)}
          className="rounded-md border border-border px-3 py-2 text-xs text-ink-mute transition hover:bg-bg-elevated hover:text-ink"
        >
          Rellenar con el ejemplo
        </button>
        {message ? (
          <span className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
            {message.text}
          </span>
        ) : null}
      </div>

      {result ? (
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
                      <span className="text-rose-600" title={r.reason}>
                        rechazada
                      </span>
                    ) : (
                      <span className="text-ink-soft">{r.status === 'created' ? 'nueva' : 'actualizada'}</span>
                    )}
                    {r.reason ? <div className="text-[11px] text-rose-600">{r.reason}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-ink">{r.qss ?? '—'}</td>
                  <td className="px-3 py-2"><Verdict v={r.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
