'use client';

import { useMemo, useState } from 'react';

import {
  DEFAULT_MONITOR_AT,
  DEFAULT_PROCEED_AT,
  KILLS,
  TAXONOMY,
  criterionKey,
  scoreProject,
  type Concentration,
  type Confidence,
  type OwnershipType,
  type ScoringInput,
  type TaxonomyFit,
} from '@/lib/arpa/scoring';

const field =
  'w-full rounded border border-border bg-bg px-2 py-1.5 text-sm tabular-nums text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';
const card = 'rounded-lg border border-border bg-bg-card p-4';

const NUM_FIELDS = [
  'revenue_y1', 'revenue_y2', 'revenue_y3',
  'ebitda_y1', 'ebitda_y2', 'ebitda_y3',
  'ebitda_norm', 'capex', 'working_capital', 'net_debt',
  'recurring_pct', 'entry_multiple', 'seller_exp_ev',
] as const;

type NumField = (typeof NUM_FIELDS)[number];

const OWNERSHIP: OwnershipType[] = [
  'Founder-owned',
  'Family-owned',
  'Corporate subsidiary',
  'Private equity',
  'Public',
  'Unknown',
];

const pct = (v: number | null, dp = 1) => (v === null ? '—' : `${(v * 100).toFixed(dp)} %`);
const mn = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)} M€`);
const xx = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)}x`);

const EMPTY = Object.fromEntries(NUM_FIELDS.map((k) => [k, ''])) as Record<NumField, string>;

/**
 * Conservas del Segura, S.L., the worked example on ARPA's own published
 * calculator, figure for figure. It is here so the method can be checked
 * against a result they already know: QSS 88 Proceed, OM 68 Monitor,
 * PFR 71 Reprice, Overall 76, EV 9.10, equity 7.30, gap 2.40.
 *
 * The same numbers are pinned in `lib/arpa/scoring.test.ts`, so if this button
 * ever stops reproducing them the test will have said so first.
 */
const DEMO: Record<NumField, string> = {
  revenue_y1: '8.2', revenue_y2: '9.1', revenue_y3: '10.4',
  ebitda_y1: '0.95', ebitda_y2: '1.18', ebitda_y3: '1.46',
  ebitda_norm: '1.3', capex: '0.25', working_capital: '0.1', net_debt: '1.8',
  recurring_pct: '55', entry_multiple: '7', seller_exp_ev: '11.5',
};

function Verdict({ outcome, children }: { outcome: number; children: React.ReactNode }) {
  const tone =
    outcome === 0
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : outcome === 1
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : outcome === 2
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-border bg-bg-elevated text-ink-mute';
  return (
    <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {children}
    </span>
  );
}

/**
 * Their calculator, standing alone.
 *
 * Nothing here touches the database, by design. It is the one page that cannot
 * fail because of missing data, a bad import or a connection, so it is safe to
 * open in front of someone. The price is that nothing is saved either, which
 * the page says out loud rather than leaving to be discovered.
 */
export default function Calculator() {
  const [num, setNum] = useState<Record<NumField, string>>(EMPTY);
  const [subsector, setSubsector] = useState('');
  const [fit, setFit] = useState<TaxonomyFit>('in');
  const [country, setCountry] = useState('ES');
  const [ownership, setOwnership] = useState<OwnershipType>('Family-owned');
  const [conc, setConc] = useState<Concentration | ''>('');
  const [motiv, setMotiv] = useState('');
  const [confidence, setConfidence] = useState<Confidence | ''>('');

  const [manual, setManual] = useState<Record<string, number | null>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [proceedAt, setProceedAt] = useState(DEFAULT_PROCEED_AT);
  const [monitorAt, setMonitorAt] = useState(DEFAULT_MONITOR_AT);

  const n = (s: string): number | null => {
    if (s.trim() === '') return null;
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };

  const set = (k: NumField) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setNum((p) => ({ ...p, [k]: e.target.value }));

  const taxonomy = useMemo(
    () => TAXONOMY.find((t) => t.subsector === subsector) ?? null,
    [subsector],
  );

  const input: ScoringInput = useMemo(
    () => ({
      country,
      ownershipType: ownership,
      taxonomyFit: fit,
      taxonomy,
      revenue: [n(num.revenue_y1), n(num.revenue_y2), n(num.revenue_y3)],
      ebitda: [n(num.ebitda_y1), n(num.ebitda_y2), n(num.ebitda_y3)],
      ebitdaNorm: n(num.ebitda_norm),
      capex: n(num.capex),
      workingCapital: n(num.working_capital),
      netDebt: n(num.net_debt),
      recurringPct: n(num.recurring_pct),
      customerConc: conc === '' ? null : conc,
      sellerMotiv: n(motiv),
      dataConfidence: confidence === '' ? null : confidence,
      entryMultiple: n(num.entry_multiple),
      sellerExpEv: n(num.seller_exp_ev),
    }),
    [country, ownership, taxonomy, fit, num, conc, motiv, confidence],
  );

  const result = useMemo(
    () => scoreProject(input, { manual, flagged, proceedAt, monitorAt }),
    [input, manual, flagged, proceedAt, monitorAt],
  );

  const d = result.metrics;
  const suggested = new Set(result.suggestedKills.map((k) => k.id));

  function loadDemo() {
    setNum(DEMO);
    setSubsector('Fruit / vegetable processing');
    setFit('in');
    setCountry('ES');
    setOwnership('Family-owned');
    setConc('mid');
    setMotiv('4');
    setConfidence('Medium');
    setManual({});
    setFlagged([]);
  }

  function reset() {
    setNum(EMPTY);
    setSubsector('');
    setFit('in');
    setConc('');
    setMotiv('');
    setConfidence('');
    setManual({});
    setFlagged([]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={loadDemo}
          className="rounded border border-border px-3 py-1.5 text-xs text-ink-mute transition hover:bg-bg-elevated hover:text-ink"
        >
          Cargar el ejemplo de Conservas del Segura
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded border border-border px-3 py-1.5 text-xs text-ink-mute transition hover:bg-bg-elevated hover:text-ink"
        >
          Limpiar
        </button>
        <span className="text-[11px] text-ink-faint">
          Nada de esta pantalla se guarda. Para guardar una puntuación, hazla desde la ficha de la
          empresa en el pipeline.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ── inputs ─────────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className={card}>
            <h2 className="mb-3 text-sm font-semibold text-ink">La empresa</h2>
            <div className="space-y-3">
              <div>
                <label className={label} htmlFor="sub">Subsector (Industry Taxonomy)</label>
                <select
                  id="sub"
                  className={field}
                  value={subsector}
                  onChange={(e) => setSubsector(e.target.value)}
                >
                  <option value="">(sin subsector)</option>
                  {TAXONOMY.map((t) => (
                    <option key={t.subsector} value={t.subsector}>
                      {t.sector} · {t.subsector}
                    </option>
                  ))}
                </select>
                {taxonomy ? (
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Growth {taxonomy.growth} · Fragmentación {taxonomy.fragmentation} ·
                    Consolidación {taxonomy.consolidation}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label} htmlFor="fit">Encaje</label>
                  <select
                    id="fit"
                    className={field}
                    value={fit}
                    onChange={(e) => setFit(e.target.value as TaxonomyFit)}
                  >
                    <option value="in">dentro</option>
                    <option value="adjacent">adyacente</option>
                    <option value="out">fuera</option>
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="country">País</label>
                  <select
                    id="country"
                    className={field}
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    <option value="ES">España</option>
                    <option value="PT">Portugal</option>
                    <option value="OT">otro</option>
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="own">Propiedad</label>
                  <select
                    id="own"
                    className={field}
                    value={ownership}
                    onChange={(e) => setOwnership(e.target.value as OwnershipType)}
                  >
                    {OWNERSHIP.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="mb-1 text-sm font-semibold text-ink">Las cifras</h2>
            <p className="mb-3 text-[11px] text-ink-faint">
              Millones de euros. El año más reciente es Y3. Una casilla vacía es un dato que no
              existe, no un cero.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {(['revenue_y1', 'revenue_y2', 'revenue_y3'] as const).map((k, i) => (
                  <div key={k}>
                    <label className={label} htmlFor={k}>Ingresos Y{i + 1}</label>
                    <input id={k} className={field} inputMode="decimal" value={num[k]} onChange={set(k)} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['ebitda_y1', 'ebitda_y2', 'ebitda_y3'] as const).map((k, i) => (
                  <div key={k}>
                    <label className={label} htmlFor={k}>EBITDA Y{i + 1}</label>
                    <input id={k} className={field} inputMode="decimal" value={num[k]} onChange={set(k)} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label} htmlFor="ebitda_norm">EBITDA normalizado</label>
                  <input id="ebitda_norm" className={field} inputMode="decimal" value={num.ebitda_norm} onChange={set('ebitda_norm')} />
                </div>
                <div>
                  <label className={label} htmlFor="capex">Capex</label>
                  <input id="capex" className={field} inputMode="decimal" value={num.capex} onChange={set('capex')} />
                </div>
                <div>
                  <label className={label} htmlFor="working_capital">Circulante</label>
                  <input id="working_capital" className={field} inputMode="decimal" value={num.working_capital} onChange={set('working_capital')} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label} htmlFor="net_debt">Deuda neta</label>
                  <input id="net_debt" className={field} inputMode="decimal" value={num.net_debt} onChange={set('net_debt')} />
                </div>
                <div>
                  <label className={label} htmlFor="entry_multiple">Múltiplo de entrada</label>
                  <input id="entry_multiple" className={field} inputMode="decimal" value={num.entry_multiple} onChange={set('entry_multiple')} />
                </div>
                <div>
                  <label className={label} htmlFor="seller_exp_ev">EV que pide el vendedor</label>
                  <input id="seller_exp_ev" className={field} inputMode="decimal" value={num.seller_exp_ev} onChange={set('seller_exp_ev')} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className={label} htmlFor="recurring_pct">% recurrente</label>
                  <input id="recurring_pct" className={field} inputMode="decimal" value={num.recurring_pct} onChange={set('recurring_pct')} />
                </div>
                <div>
                  <label className={label} htmlFor="conc">Concentración</label>
                  <select id="conc" className={field} value={conc} onChange={(e) => setConc(e.target.value as Concentration | '')}>
                    <option value="">—</option>
                    <option value="low">baja</option>
                    <option value="mid">media</option>
                    <option value="high">alta</option>
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="motiv">Motivación 1-5</label>
                  <select id="motiv" className={field} value={motiv} onChange={(e) => setMotiv(e.target.value)}>
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="confidence">Confianza</label>
                  <select id="confidence" className={field} value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence | '')}>
                    <option value="">—</option>
                    <option value="Low">baja</option>
                    <option value="Medium">media</option>
                    <option value="High">alta</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="mb-1 text-sm font-semibold text-ink">Kill criteria</h2>
            <p className="mb-3 text-[11px] text-ink-faint">
              Marcado por una persona, veta la operación. Lo que los datos sugieren sale señalado
              pero no veta por sí solo.
            </p>
            <ul className="space-y-1.5">
              {KILLS.map((k) => (
                <li key={k.id} className="flex items-start gap-2">
                  <input
                    id={`kill_${k.id}`}
                    type="checkbox"
                    checked={flagged.includes(k.id)}
                    onChange={(e) =>
                      setFlagged((p) => (e.target.checked ? [...p, k.id] : p.filter((x) => x !== k.id)))
                    }
                    className="mt-0.5"
                  />
                  <label htmlFor={`kill_${k.id}`} className="text-xs text-ink-soft">
                    {k.text}
                    {suggested.has(k.id) ? (
                      <span className="ml-1.5 rounded border border-amber-200 bg-amber-50 px-1 text-[10px] font-semibold text-amber-700">
                        los datos lo sugieren
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── results ────────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-mute">Overall</div>
                <div className="text-3xl font-bold tabular-nums text-ink">
                  {result.overall0to100 ?? '—'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-ink-mute">Hasta dónde llega</div>
                <div className="text-sm font-semibold text-ink">{result.stage}</div>
                <div className="text-xs text-ink-mute">{result.decision}</div>
              </div>
            </div>
            {result.passReason ? (
              <p className="mt-2 text-xs text-rose-600">
                Motivo: {result.passReason}
                {result.passReasonSource ? ` (${result.passReasonSource})` : ''}
              </p>
            ) : null}
            {result.flaggedKills.length > 0 ? (
              <p className="mt-2 text-xs text-rose-600">
                Vetado: {result.flaggedKills.map((k) => k.text).join('; ')}
              </p>
            ) : null}
            <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <label className="text-[11px] uppercase tracking-wider text-ink-mute" htmlFor="pa">
                  Proceed ≥
                </label>
                <input
                  id="pa"
                  type="number"
                  value={proceedAt}
                  onChange={(e) => setProceedAt(Number(e.target.value))}
                  className="w-16 rounded border border-border bg-bg px-2 py-1 text-xs tabular-nums text-ink"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] uppercase tracking-wider text-ink-mute" htmlFor="ma">
                  Monitor ≥
                </label>
                <input
                  id="ma"
                  type="number"
                  value={monitorAt}
                  onChange={(e) => setMonitorAt(Number(e.target.value))}
                  className="w-16 rounded border border-border bg-bg px-2 py-1 text-xs tabular-nums text-ink"
                />
              </div>
            </div>
          </div>

          <div className={card}>
            <h2 className="mb-3 text-sm font-semibold text-ink">Métricas</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
              {[
                ['CAGR ingresos', pct(d.revenueCagr)],
                ['Margen EBITDA', pct(d.ebitdaMargin)],
                ['EBITDA de referencia', mn(d.ebitdaRef)],
                ['Gap de normalización', pct(d.normalisationGap)],
                ['Conversión de caja', pct(d.cashConversion)],
                ['Apalancamiento', xx(d.leverage)],
                ['Enterprise value', mn(d.enterpriseValue)],
                ['Equity value', mn(d.equityValue)],
                ['Gap de valoración', mn(d.valuationGapM)],
                ['Múltiplo que pide', xx(d.askMultiple)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-border py-1">
                  <dt className="text-ink-mute">{k}</dt>
                  <dd className="tabular-nums text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {result.models.map((m) => (
            <div key={m.id} className={card}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">
                  {m.name} <span className="font-normal text-ink-mute">· {m.stage}</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tabular-nums text-ink">
                    {m.score0to100 ?? '—'}
                  </span>
                  <span className="text-[11px] tabular-nums text-ink-faint">
                    {m.score1to5 === null ? '' : `${m.score1to5.toFixed(2)}/5`}
                  </span>
                  <Verdict outcome={m.outcome}>{m.verdict}</Verdict>
                </div>
              </div>
              <p className="mb-2 text-[11px] text-ink-faint">
                {m.question} · cobertura {Math.round(m.coverage * 100)} %
                {m.vetoed ? ' · VETADO' : ''}
              </p>
              <table className="w-full text-xs">
                <tbody>
                  {m.criteria.map((c) => {
                    const key = criterionKey(m.id, c.id);
                    return (
                      <tr key={key} className="border-t border-border">
                        <td className="py-1.5 pr-2 text-ink-soft" title={c.detail}>
                          {c.name}
                          {c.usedDefault ? (
                            <span className="ml-1 text-[10px] text-amber-700">provisional</span>
                          ) : null}
                        </td>
                        <td className="w-10 py-1.5 text-right tabular-nums text-ink-faint">
                          {c.weight}
                        </td>
                        <td className="w-12 py-1.5 text-right tabular-nums text-ink-mute">
                          {c.autoScore === null ? '—' : c.autoScore.toFixed(1)}
                        </td>
                        <td className="w-20 py-1.5 pl-2">
                          <select
                            value={manual[key] ?? ''}
                            onChange={(e) =>
                              setManual((p) => ({
                                ...p,
                                [key]: e.target.value === '' ? null : Number(e.target.value),
                              }))
                            }
                            className="w-full rounded border border-border bg-bg px-1 py-0.5 text-[11px] tabular-nums text-ink"
                            title="Puntuación manual, sustituye a la del dato"
                          >
                            <option value="">auto</option>
                            {[1, 2, 3, 4, 5].map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          {result.gaps.length > 0 ? (
            <div className={card}>
              <h2 className="mb-2 text-sm font-semibold text-ink">Qué falta por saber</h2>
              <p className="text-xs leading-relaxed text-ink-mute">{result.gaps.join(' · ')}</p>
              <p className="mt-2 text-[11px] text-ink-faint">
                Un dato que falta baja la cobertura, no la nota. La puntuación se calcula solo sobre
                los criterios que sí tienen dato detrás.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
