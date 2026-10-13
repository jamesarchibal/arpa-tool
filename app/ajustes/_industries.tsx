'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { IndustryRow } from '@/lib/arpa/db';
import { saveIndustry } from '../actions';

const field =
  'w-full rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';
const label = 'mb-0.5 block text-[10px] uppercase tracking-wider text-ink-mute';
const th = 'px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-mute';

const LEVELS = [
  ['H', 'Alta'],
  ['M', 'Media'],
  ['L', 'Baja'],
] as const;

const LEVEL_LABEL: Record<string, string> = { H: 'alta', M: 'media', L: 'baja' };

function Pre({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-[11px] text-ink-faint">—</span>;
  }
  const tone =
    value >= 80
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value >= 60
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-border bg-bg-elevated text-ink-soft';
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}>
      {value}
    </span>
  );
}

/**
 * The industry taxonomy: industry > category > subsector, plus what ARPA knows
 * about each one.
 *
 * The pre-score is the column that matters. It is ARPA's interest in a subsector
 * BEFORE any company is attached, which is what makes proactive origination
 * possible: pick the subsector first, then go and find the names. The CNAE codes
 * find it in SABI and the keywords find it on the web.
 */
export default function Industries({ industries }: { industries: IndustryRow[] }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const needle = q.trim().toLowerCase();
  const rows = needle
    ? industries.filter((i) =>
        [i.sector, i.category, i.subsector].some((v) => v.toLowerCase().includes(needle)),
      )
    : industries;

  function onSubmit(e: React.FormEvent<HTMLFormElement>, row: IndustryRow | null) {
    e.preventDefault();
    setError(null);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    startTransition(async () => {
      const res = await saveIndustry({
        id: row?.id ?? null,
        sector: String(raw.sector ?? '').trim(),
        category: String(raw.category ?? '').trim(),
        subsector: String(raw.subsector ?? '').trim(),
        growth: raw.growth ? String(raw.growth) : null,
        fragmentation: raw.fragmentation ? String(raw.fragmentation) : null,
        consolidation: raw.consolidation ? String(raw.consolidation) : null,
        pre_score: raw.pre_score === '' ? null : Number(raw.pre_score),
        margin_typical_pct: raw.margin_typical_pct === '' ? null : String(raw.margin_typical_pct),
        cnae_codes: raw.cnae_codes ? String(raw.cnae_codes) : null,
        keywords: raw.keywords ? String(raw.keywords) : null,
        notes: raw.notes ? String(raw.notes) : null,
        active: raw.active === 'on',
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function Form({ row }: { row: IndustryRow | null }) {
    return (
      <form onSubmit={(e) => onSubmit(e, row)} className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className={label}>Industria</label>
            <input name="sector" required defaultValue={row?.sector ?? ''} className={field} placeholder="Electrical Equipment" />
          </div>
          <div>
            <label className={label}>Categoría</label>
            <input name="category" required defaultValue={row?.category ?? ''} className={field} placeholder="Electrical Components" />
          </div>
          <div>
            <label className={label}>Subsector</label>
            <input name="subsector" required defaultValue={row?.subsector ?? ''} className={field} placeholder="Fabricantes de mecanismos eléctricos" />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-5">
          {([
            ['growth', 'Crecimiento', row?.growth],
            ['fragmentation', 'Fragmentación', row?.fragmentation],
            ['consolidation', 'Consolidación', row?.consolidation],
          ] as const).map(([name, text, value]) => (
            <div key={name}>
              <label className={label}>{text}</label>
              <select name={name} defaultValue={value ?? ''} className={field}>
                <option value="">—</option>
                {LEVELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className={label}>Pre-score 0-100</label>
            <input
              name="pre_score"
              type="number"
              min={0}
              max={100}
              defaultValue={row?.pre_score ?? ''}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Margen típico %</label>
            <input
              name="margin_typical_pct"
              inputMode="decimal"
              defaultValue={row?.margin_typical_pct ?? ''}
              className={field}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={label}>Códigos CNAE</label>
            <input
              name="cnae_codes"
              defaultValue={(row?.cnae_codes ?? []).join(', ')}
              placeholder="2712, 2733"
              className={field}
            />
          </div>
          <div>
            <label className={label}>Palabras clave</label>
            <input
              name="keywords"
              defaultValue={(row?.keywords ?? []).join(', ')}
              placeholder="aparamenta, material eléctrico"
              className={field}
            />
          </div>
        </div>

        <div>
          <label className={label}>Notas</label>
          <textarea name="notes" rows={2} defaultValue={row?.notes ?? ''} className={field} />
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <input type="checkbox" name="active" defaultChecked={row?.active ?? true} />
          Activo
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded border border-border px-3 py-1 text-xs text-ink-mute hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Industrias</h2>
          <p className="mt-1 max-w-2xl text-xs text-ink-mute">
            Industria, categoría y subsector, con vuestro pre-score de interés, el margen típico, los
            CNAE que lo encuentran en SABI y las palabras clave que lo encuentran en internet.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar subsector"
          className="w-48 rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        />
      </div>

      {/* Said out loud, because a number nobody typed looks like a number
          somebody decided. */}
      <p className="rounded border border-border bg-bg-elevated px-3 py-2 text-[11px] text-ink-mute">
        Los pre-scores de los 20 subsectores del blueprint son <strong className="font-semibold">provisionales</strong>:
        salen de los valores de crecimiento, fragmentación y consolidación que ya estaban en la tabla
        (alta 100, media 60, baja 20, promedio de los tres). Son un punto de partida para poder
        ordenar. El que escribáis vosotros manda.
      </p>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="bg-bg-elevated">
            <tr>
              <th className={th}>Subsector</th>
              <th className={th}>Pre-score</th>
              <th className={th}>Margen</th>
              <th className={th}>Mercado</th>
              <th className={th}>CNAE</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) =>
              editing === i.id ? (
                <tr key={i.id} className="border-t border-border bg-bg">
                  <td colSpan={6} className="p-2.5">
                    <Form row={i} />
                  </td>
                </tr>
              ) : (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-ink">{i.subsector}</span>
                      {i.is_example ? (
                        <span
                          className="rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700"
                          title="Puesto por nosotros para la demo. Edítalo y pasa a ser vuestro."
                        >
                          ejemplo
                        </span>
                      ) : null}
                      {!i.active ? (
                        <span className="text-[10px] uppercase tracking-wider text-ink-faint">off</span>
                      ) : null}
                    </div>
                    <div className="text-[10px] text-ink-faint">
                      {i.sector} · {i.category}
                    </div>
                  </td>
                  <td className="px-2.5 py-2"><Pre value={i.pre_score} /></td>
                  <td className="px-2.5 py-2 tabular-nums text-ink-soft">
                    {i.margin_typical_pct === null ? '—' : `${i.margin_typical_pct}%`}
                  </td>
                  <td className="px-2.5 py-2 text-[10px] text-ink-mute">
                    crec. {LEVEL_LABEL[i.growth ?? ''] ?? '—'} · frag.{' '}
                    {LEVEL_LABEL[i.fragmentation ?? ''] ?? '—'} · cons.{' '}
                    {LEVEL_LABEL[i.consolidation ?? ''] ?? '—'}
                  </td>
                  <td className="px-2.5 py-2 font-mono text-[10px] text-ink-faint">
                    {(i.cnae_codes ?? []).join(' ') || '—'}
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(i.id)}
                      className="text-[11px] text-brand hover:underline"
                    >
                      editar
                    </button>
                  </td>
                </tr>
              ),
            )}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ink-mute">
                  Ningún subsector con esa búsqueda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editing === 'new' ? (
        <div className="rounded border border-brand/40 bg-bg p-2.5">
          <Form row={null} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="text-xs font-semibold text-brand hover:underline"
        >
          + Nuevo subsector
        </button>
      )}
    </section>
  );
}
