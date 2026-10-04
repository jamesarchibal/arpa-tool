'use client';

import { useMemo, useState, useTransition } from 'react';

import {
  DEFAULT_MONITOR_AT,
  DEFAULT_PROCEED_AT,
  KILLS,
  MODELS,
  criterionKey,
  scoreProject,
  type Concentration,
  type Confidence,
  type ScoringInput,
} from '@/lib/arpa/scoring';
import type { ProjectRecord } from '@/lib/arpa/db';

import { saveProject, saveScores } from '../actions';

const field =
  'w-full rounded border border-border bg-bg px-2 py-1.5 text-sm tabular-nums text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';
const card = 'rounded-lg border border-border bg-bg-card p-4';

const STAGES = [
  'Sourcing',
  'Screening',
  'Assessment',
  'Preliminary Financial Review',
  'Investment Case',
  'Closed',
] as const;

/** Numeric fields of arpa_projects, kept as strings so an empty box stays empty. */
const MONEY_FIELDS = [
  'revenue_y1', 'revenue_y2', 'revenue_y3',
  'ebitda_y1', 'ebitda_y2', 'ebitda_y3',
  'ebitda_norm', 'capex', 'working_capital', 'net_debt',
  'recurring_pct', 'entry_multiple', 'seller_exp_ev',
] as const;

type MoneyField = (typeof MONEY_FIELDS)[number];

interface Props {
  project: ProjectRecord;
  baseInput: ScoringInput;
  scoredByDefault: string;
  flaggedInitial: string[];
}

const pct = (v: number | null, dp = 1) => (v === null ? '—' : `${(v * 100).toFixed(dp)} %`);
const mn = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)} M€`);
const xx = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)}x`);

export default function Workbench({ project, baseInput, scoredByDefault, flaggedInitial }: Props) {
  // ── editable project data ───────────────────────────────────────────────────
  const [money, setMoney] = useState<Record<MoneyField, string>>(() => {
    const out = {} as Record<MoneyField, string>;
    for (const k of MONEY_FIELDS) {
      const v = project[k];
      out[k] = v === null || v === undefined ? '' : String(v);
    }
    return out;
  });
  const [conc, setConc] = useState<Concentration | ''>(project.customer_conc ?? '');
  const [motiv, setMotiv] = useState<string>(project.seller_motiv === null ? '' : String(project.seller_motiv));
  const [confidence, setConfidence] = useState<Confidence | ''>(project.data_confidence ?? '');
  const [src, setSrc] = useState(project.financials_src ?? '');
  const [stage, setStage] = useState(project.stage);
  const [owner, setOwner] = useState(project.owner ?? '');

  // ── scoring controls ────────────────────────────────────────────────────────
  const [manual, setManual] = useState<Record<string, number | null>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<string[]>(flaggedInitial);
  const [proceedAt, setProceedAt] = useState(DEFAULT_PROCEED_AT);
  const [monitorAt, setMonitorAt] = useState(DEFAULT_MONITOR_AT);
  const [blockOnSuggested, setBlockOnSuggested] = useState(false);
  const [scoredBy, setScoredBy] = useState(scoredByDefault);
  const [note, setNote] = useState('');

  const [savingData, startData] = useTransition();
  const [savingScore, startScore] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const n = (s: string): number | null => {
    if (s.trim() === '') return null;
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };

  // Recompute on every keystroke from the same engine the server uses, so what
  // is on screen is always what would be saved.
  const input: ScoringInput = useMemo(
    () => ({
      ...baseInput,
      revenue: [n(money.revenue_y1), n(money.revenue_y2), n(money.revenue_y3)],
      ebitda: [n(money.ebitda_y1), n(money.ebitda_y2), n(money.ebitda_y3)],
      ebitdaNorm: n(money.ebitda_norm),
      capex: n(money.capex),
      workingCapital: n(money.working_capital),
      netDebt: n(money.net_debt),
      recurringPct: n(money.recurring_pct),
      entryMultiple: n(money.entry_multiple),
      sellerExpEv: n(money.seller_exp_ev),
      customerConc: conc === '' ? null : conc,
      sellerMotiv: n(motiv),
      dataConfidence: confidence === '' ? null : confidence,
    }),
    [baseInput, money, conc, motiv, confidence],
  );

  const result = useMemo(
    () => scoreProject(input, { manual, weights, flagged, proceedAt, monitorAt, blockOnSuggested }),
    [input, manual, weights, flagged, proceedAt, monitorAt, blockOnSuggested],
  );

  const d = result.metrics;
  const suggestedIds = new Set(result.suggestedKills.map((k) => k.id));

  function onSaveData() {
    setMsg(null);
    startData(async () => {
      const res = await saveProject({
        id: project.id,
        stage,
        owner: owner || null,
        financials_src: src || null,
        customer_conc: conc === '' ? null : conc,
        seller_motiv: motiv === '' ? null : Number(motiv),
        data_confidence: confidence === '' ? null : confidence,
        ...Object.fromEntries(MONEY_FIELDS.map((k) => [k, money[k] === '' ? null : money[k]])),
      });
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  function onSaveScore() {
    setMsg(null);
    startScore(async () => {
      const res = await saveScores({
        projectId: project.id,
        scoredBy,
        note: note || null,
        proceedAt,
        monitorAt,
        blockOnSuggested,
        manual,
        weights,
        flagged,
      });
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  const dirtyData =
    MONEY_FIELDS.some((k) => (project[k] === null ? '' : String(project[k])) !== money[k]) ||
    (project.customer_conc ?? '') !== conc ||
    (project.seller_motiv === null ? '' : String(project.seller_motiv)) !== motiv ||
    (project.data_confidence ?? '') !== confidence ||
    (project.financials_src ?? '') !== src ||
    project.stage !== stage ||
    (project.owner ?? '') !== owner;

  return (
    <div className="space-y-5">
      {msg ? (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            msg.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      {/* ── verdicts, always visible ───────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-4">
        {result.models.map((m) => {
          const tone =
            m.outcome === 0
              ? 'border-emerald-200 text-emerald-700'
              : m.outcome === 1
                ? 'border-amber-200 text-amber-700'
                : m.outcome === 2
                  ? 'border-rose-200 text-rose-700'
                  : 'border-border text-ink-mute';
          return (
            <div key={m.id} className={`${card} space-y-2`}>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-wider text-ink-mute">{m.name}</span>
                <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{m.verdict}</span>
              </div>
              <div className="text-3xl font-bold tabular-nums text-ink">
                {m.score0to100 ?? '—'}
                <span className="ml-1 text-sm font-normal text-ink-faint">/ 100</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-bg">
                <div
                  className={
                    m.outcome === 0 ? 'h-full bg-emerald-500' : m.outcome === 1 ? 'h-full bg-amber-500' : 'h-full bg-rose-500'
                  }
                  style={{ width: `${m.score0to100 ?? 0}%` }}
                />
              </div>
              {m.vetoed ? (
                <p className="text-[11px] font-semibold text-rose-600">
                  VETO · {m.vetoes.length} kill criteri{m.vetoes.length === 1 ? 'on' : 'a'}
                </p>
              ) : null}
              <p className="text-[11px] leading-snug text-ink-faint">
                Cobertura {Math.round(m.coverage * 100)} % del peso. {m.question}
              </p>
            </div>
          );
        })}

        <div className={`${card} space-y-2`}>
          <span className="text-[11px] uppercase tracking-wider text-ink-mute">Overall Project Score</span>
          <div className="text-3xl font-bold tabular-nums text-ink">
            {result.overall0to100 ?? '—'}
            <span className="ml-1 text-sm font-normal text-ink-faint">/ 100</span>
          </div>
          <p className="text-[11px] text-ink-soft">
            {result.stage} · {result.decision}
          </p>
          <p className="text-[11px] leading-snug text-ink-faint">
            Media simple de las puertas puntuadas. El blueprint no da los pesos entre modelos.
          </p>
        </div>
      </div>

      {/* ── derived metrics ───────────────────────────────────────────────── */}
      <div className={card}>
        <h3 className="mb-3 text-sm font-semibold text-ink">Métricas derivadas</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {([
            ['EBITDA de referencia', mn(d.ebitdaRef)],
            ['Margen EBITDA', pct(d.ebitdaMargin)],
            ['CAGR ingresos (2a)', pct(d.revenueCagr)],
            ['Brecha normalización', pct(d.normalisationGap)],
            ['Conversión de caja', pct(d.cashConversion, 0)],
            ['Deuda neta / EBITDA', xx(d.leverage)],
            ['Enterprise Value', mn(d.enterpriseValue)],
            ['Equity Value', mn(d.equityValue)],
            ['Valuation Gap', mn(d.valuationGapM)],
            ['Múltiplo pedido', xx(d.askMultiple)],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k}>
              <div className="text-[11px] text-ink-mute">{k}</div>
              <div className={`text-sm font-semibold tabular-nums ${v === '—' ? 'text-ink-faint' : 'text-ink'}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── data entry ────────────────────────────────────────────────────── */}
      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Datos del proyecto</h3>
          <span className="text-[11px] text-ink-faint">Todo en millones de euros</span>
        </div>

        <div className="space-y-4">
          <div>
            <div className={label}>Ingresos · tres ejercicios, del más antiguo al más reciente</div>
            <div className="grid grid-cols-3 gap-2">
              {(['revenue_y1', 'revenue_y2', 'revenue_y3'] as MoneyField[]).map((k, i) => (
                <input
                  key={k}
                  aria-label={`Ingresos año ${i + 1}`}
                  className={field}
                  value={money[k]}
                  onChange={(e) => setMoney({ ...money, [k]: e.target.value })}
                  placeholder={`Año ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <div>
            <div className={label}>EBITDA reportado · mismos tres ejercicios</div>
            <div className="grid grid-cols-3 gap-2">
              {(['ebitda_y1', 'ebitda_y2', 'ebitda_y3'] as MoneyField[]).map((k, i) => (
                <input
                  key={k}
                  aria-label={`EBITDA año ${i + 1}`}
                  className={field}
                  value={money[k]}
                  onChange={(e) => setMoney({ ...money, [k]: e.target.value })}
                  placeholder={`Año ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['ebitda_norm', 'EBITDA normalizado'],
              ['capex', 'Capex'],
              ['working_capital', 'Circulante'],
              ['net_debt', 'Deuda neta'],
            ] as [MoneyField, string][]).map(([k, lab]) => (
              <div key={k}>
                <label className={label} htmlFor={k}>{lab}</label>
                <input id={k} className={field} value={money[k]} onChange={(e) => setMoney({ ...money, [k]: e.target.value })} />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={label} htmlFor="recurring_pct">Ingreso recurrente %</label>
              <input id="recurring_pct" className={field} value={money.recurring_pct} onChange={(e) => setMoney({ ...money, recurring_pct: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="conc">Concentración de cliente</label>
              <select id="conc" className={field} value={conc} onChange={(e) => setConc(e.target.value as Concentration | '')}>
                <option value="">Sin determinar</option>
                <option value="low">Baja</option>
                <option value="mid">Media</option>
                <option value="high">Alta</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="motiv">Motivación del vendedor</label>
              <select id="motiv" className={field} value={motiv} onChange={(e) => setMotiv(e.target.value)}>
                <option value="">Sin determinar</option>
                {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="confidence">Confidence</label>
              <select id="confidence" className={field} value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence | '')}>
                <option value="">Sin determinar</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={label} htmlFor="entry_multiple">Entry Multiple</label>
              <input id="entry_multiple" className={field} value={money.entry_multiple} onChange={(e) => setMoney({ ...money, entry_multiple: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="seller_exp_ev">Expectativa del vendedor (EV)</label>
              <input id="seller_exp_ev" className={field} value={money.seller_exp_ev} onChange={(e) => setMoney({ ...money, seller_exp_ev: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="stage">Etapa</label>
              <select id="stage" className={field} value={stage} onChange={(e) => setStage(e.target.value)}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="owner">Responsable</label>
              <input id="owner" className={field} value={owner} onChange={(e) => setOwner(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="src">Fuente de los datos financieros</label>
            <input id="src" className={field} value={src} onChange={(e) => setSrc(e.target.value)} placeholder="Depósito XBRL del Registro Mercantil, FY2025" />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSaveData}
              disabled={savingData || !dirtyData}
              className="rounded bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-40"
            >
              {savingData ? 'Guardando…' : 'Guardar datos'}
            </button>
            {dirtyData ? <span className="text-[11px] text-amber-600">Hay cambios sin guardar</span> : null}
          </div>
        </div>
      </div>

      {/* ── criteria ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {result.models.map((m) => {
          const weightOff = Math.abs(m.weightSum - 100) > 0.5;
          return (
            <div key={m.id} className={card}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{m.name}</h3>
                <span className="text-[11px] text-ink-faint">Etapa: {m.stage}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="text-left text-[10px] uppercase tracking-wider text-ink-faint">
                    <tr>
                      <th className="pb-2 font-medium">Criterio</th>
                      <th className="w-20 pb-2 text-right font-medium">Peso %</th>
                      <th className="w-24 pb-2 text-center font-medium">Auto</th>
                      <th className="w-28 pb-2 font-medium">Puntuación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.criteria.map((c) => (
                      <tr key={c.key} className="border-t border-border/60">
                        <td className="py-2 pr-3">
                          <div className="text-[13px] text-ink">{c.name}</div>
                          <div className="text-[11px] leading-snug text-ink-faint">{c.detail}</div>
                        </td>
                        <td className="py-2">
                          <input
                            aria-label={`Peso de ${c.name}`}
                            className={`${field} text-right`}
                            value={weights[c.key] ?? c.weight}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setWeights({ ...weights, [c.key]: Number.isFinite(v) ? v : 0 });
                            }}
                          />
                        </td>
                        <td className="py-2 text-center">
                          {c.autoScore !== null ? (
                            <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-ink-soft">
                              {c.autoScore}
                            </span>
                          ) : c.usedDefault ? (
                            <span className="text-[10px] uppercase text-amber-600" title="Nadie lo ha valorado; se usa 3 como provisional">
                              provisional
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase text-ink-faint">sin dato</span>
                          )}
                        </td>
                        <td className="py-2">
                          <select
                            aria-label={`Puntuación de ${c.name}`}
                            className={field}
                            value={manual[c.key] ?? ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setManual({ ...manual, [c.key]: v === '' ? null : Number(v) });
                            }}
                          >
                            <option value="">{c.autoScore !== null ? 'Auto' : 'Sin valorar'}</option>
                            {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={`mt-2 flex justify-between border-t border-border pt-2 text-[11px] ${weightOff ? 'text-rose-600' : 'text-ink-faint'}`}>
                <span>Suma de pesos</span>
                <strong className="tabular-nums">{m.weightSum.toFixed(0)} %</strong>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── kill criteria ─────────────────────────────────────────────────── */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-ink">Kill criteria</h3>
        <p className="mb-3 mt-1 text-[11px] leading-relaxed text-ink-mute">
          Literales de la hoja Funnel_Stages. Marcar una casilla veta esa etapa por encima de la
          puntuación. &ldquo;Sugerido&rdquo; quiere decir que los datos ya apuntan a ese criterio, pero sigue
          haciendo falta marcarlo a mano.
        </p>

        {Object.entries(
          KILLS.reduce<Record<string, typeof KILLS>>((acc, k) => {
            (acc[k.stage] ??= []).push(k);
            return acc;
          }, {}),
        ).map(([stageName, items]) => (
          <div key={stageName} className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-faint">{stageName}</div>
            {items.map((k) => {
              const on = flagged.includes(k.id);
              return (
                <div key={k.id} className="flex items-start gap-3 border-t border-border/60 py-2">
                  <input
                    id={k.id}
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setFlagged(e.target.checked ? [...flagged, k.id] : flagged.filter((x) => x !== k.id))
                    }
                    className="mt-0.5 h-4 w-4 accent-rose-500"
                  />
                  <label htmlFor={k.id} className="flex-1 cursor-pointer text-[13px] leading-snug text-ink">
                    {k.text}
                  </label>
                  {suggestedIds.has(k.id) && !on ? (
                    <span className="whitespace-nowrap rounded border border-amber-200 px-1.5 py-0.5 text-[10px] uppercase text-amber-600">
                      sugerido
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}

        <label className="mt-4 flex items-center gap-2 text-[12px] text-ink-soft">
          <input
            type="checkbox"
            checked={blockOnSuggested}
            onChange={(e) => setBlockOnSuggested(e.target.checked)}
            className="h-4 w-4 accent-rose-500"
          />
          Tratar los sugeridos como veto
        </label>
      </div>

      {/* ── flags ─────────────────────────────────────────────────────────── */}
      {(result.weakPoints.length > 0 || result.gaps.length > 0 || result.passReasonMissing) ? (
        <div className={card}>
          <h3 className="mb-2 text-sm font-semibold text-ink">Avisos</h3>
          <ul className="space-y-1.5 text-[12px]">
            {result.passReasonMissing ? (
              <li className="text-amber-600">
                Este deal cae por un motivo que la lista Pass / Lost Reason no sabe expresar
                {result.passReasonSource ? ` (${result.passReasonSource})` : ''}. Falta un valor en su
                lista de siete.
              </li>
            ) : null}
            {result.passReason ? (
              <li className="text-ink">
                Pass / Lost Reason propuesto: <strong>{result.passReason}</strong>
                {result.passReasonSource ? <span className="text-ink-faint"> · {result.passReasonSource}</span> : null}
              </li>
            ) : null}
            {result.weakPoints.slice(0, 4).map((w) => (
              <li key={`${w.model}-${w.name}`} className="text-ink-soft">
                Punto débil: {w.model} · {w.name} = {w.score} (peso {w.weight} %)
              </li>
            ))}
            {result.gaps.length > 0 ? (
              <li className="text-amber-600">
                Faltan datos para {result.gaps.length} criterio(s): {result.gaps.slice(0, 4).join('; ')}
                {result.gaps.length > 4 ? '…' : ''}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* ── save ──────────────────────────────────────────────────────────── */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-ink">Firmar la puntuación</h3>
        <p className="mb-3 mt-1 text-[11px] leading-relaxed text-ink-mute">
          Se guarda una fila por puerta, con quién y cuándo. No se sobreescribe nada: la puntuación
          anterior queda en el historial. El servidor recalcula desde los datos guardados, así que
          conviene guardar los datos antes de firmar.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="scoredBy">Puntúa</label>
            <input id="scoredBy" className={field} value={scoredBy} onChange={(e) => setScoredBy(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="proceedAt">Proceder a partir de</label>
            <input
              id="proceedAt"
              type="number"
              min={0}
              max={100}
              className={field}
              value={proceedAt}
              onChange={(e) => setProceedAt(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={label} htmlFor="monitorAt">Monitorizar a partir de</label>
            <input
              id="monitorAt"
              type="number"
              min={0}
              max={100}
              className={field}
              value={monitorAt}
              onChange={(e) => setMonitorAt(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className={label} htmlFor="note">Nota</label>
          <textarea
            id="note"
            rows={2}
            className={field}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Por qué esta puntuación, qué falta por confirmar"
          />
        </div>

        {proceedAt <= monitorAt ? (
          <p className="mt-2 text-[11px] text-rose-600">
            El umbral de Proceder tiene que estar por encima del de Monitorizar.
          </p>
        ) : null}

        {dirtyData ? (
          <p className="mt-2 text-[11px] text-amber-600">
            Hay datos sin guardar. El servidor puntuará con los datos guardados, no con los de pantalla.
          </p>
        ) : null}

        <button
          type="button"
          onClick={onSaveScore}
          disabled={savingScore || !scoredBy.trim() || proceedAt <= monitorAt}
          className="mt-3 rounded bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-40"
        >
          {savingScore ? 'Guardando…' : 'Guardar puntuación'}
        </button>
      </div>
    </div>
  );
}
