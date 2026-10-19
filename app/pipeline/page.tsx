import Link from 'next/link';

import { getPipeline, getTaxonomyOptions, type PipelineRow } from '@/lib/arpa/db';
import { STAGES } from '@/lib/arpa/lists';
import { ExportButton } from '../_export-button';
import { ScorePill } from '../_gates';
import NewLeadForm from './_new-lead';
import StageSelect from './_stage-select';
import TopNav from '../_topnav';

export const dynamic = 'force-dynamic';

const m = (v: number | null) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} M€`);

function DecisionBadge({ decision, veto }: { decision: string | null; veto: boolean | null }) {
  if (!decision) return <span className="text-ink-faint">—</span>;
  const bad = decision === 'Pass';
  const good = decision === 'Proceed' || decision === 'Continue' || decision === 'Build Investment Case';
  const tone = bad
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : good
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
        {decision}
      </span>
      {veto ? <span className="text-[10px] font-bold text-rose-600" title="Hay un kill criterion marcado">VETO</span> : null}
    </span>
  );
}

function Summary({ rows }: { rows: PipelineRow[] }) {
  const scored = rows.filter((r) => r.qss !== null);
  const live = rows.filter((r) => r.decision_status !== 'Pass' && r.stage !== 'Closed');
  const gap = rows.filter((r) => r.valuation_gap !== null);
  const totalEv = rows.reduce((a, r) => a + (Number(r.ev) || 0), 0);

  const stats: [string, string][] = [
    ['Proyectos', String(rows.length)],
    ['Vivos', String(live.length)],
    ['Puntuados', `${scored.length} de ${rows.length}`],
    ['EV agregado', `${totalEv.toFixed(1)} M€`],
    [
      'Brecha media',
      gap.length ? `${(gap.reduce((a, r) => a + Number(r.valuation_gap), 0) / gap.length).toFixed(2)} M€` : '—',
    ],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border bg-bg-card px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-ink-mute">{label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</div>
        </div>
      ))}
    </div>
  );
}

export default async function ArpaPage({ searchParams }: { searchParams: { stage?: string } }) {
  const [rows, taxonomy] = await Promise.all([getPipeline(), getTaxonomyOptions()]);
  const stageFilter = searchParams.stage;

  // Best screen score first, unscored last. A SABI import lands hundreds of
  // rows in Sourcing at once, so without this the list is in whatever order the
  // export happened to be in and the point of scoring it is lost.
  const visible = (stageFilter ? rows.filter((r) => r.stage === stageFilter) : rows)
    .slice()
    .sort((a, b) => {
      if (a.qss === null && b.qss === null) return a.legal_name.localeCompare(b.legal_name, 'es');
      if (a.qss === null) return 1;
      if (b.qss === null) return -1;
      return Number(b.qss) - Number(a.qss);
    });

  return (
    <div className="space-y-6">
      <TopNav active="pipeline" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">🧮 ARPA · Pipeline</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-mute">
            Screening sobre el blueprint de ARPA Partners: 16 criterios, tres puertas (QSS, OM, PFR) y
            los 13 kill criteria. Escala 0-100. Puntúa Marc; cada puntuación queda firmada y con fecha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton kind="pipeline" />
          <NewLeadForm taxonomy={taxonomy} />
        </div>
      </div>

      <Summary rows={rows} />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/pipeline"
          className={`rounded-md border px-3 py-1 text-xs transition ${
            !stageFilter
              ? 'border-brand bg-brand-wash font-semibold text-brand'
              : 'border-border text-ink-mute hover:bg-bg-elevated hover:text-ink'
          }`}
        >
          Todas ({rows.length})
        </Link>
        {STAGES.map((s) => {
          const n = rows.filter((r) => r.stage === s).length;
          if (n === 0) return null;
          return (
            <Link
              key={s}
              href={`/pipeline?stage=${encodeURIComponent(s)}`}
              className={`rounded-md border px-3 py-1 text-xs transition ${
                stageFilter === s
                  ? 'border-brand bg-brand-wash font-semibold text-brand'
                  : 'border-border text-ink-mute hover:bg-bg-elevated hover:text-ink'
              }`}
            >
              {s} ({n})
            </Link>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-card px-6 py-12 text-center">
          <p className="text-sm text-ink-soft">
            {rows.length === 0 ? 'Todavía no hay proyectos.' : 'Ningún proyecto en esta etapa.'}
          </p>
          {rows.length === 0 ? (
            <p className="mx-auto mt-2 max-w-md text-xs text-ink-faint">
              Añade una empresa con el botón de arriba. Hace falta el nombre; todo lo demás se puede
              rellenar después y el scoring dirá qué falta.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-bg-elevated text-left text-[11px] uppercase tracking-wider text-ink-mute">
              <tr>
                <th className="px-4 py-2.5 font-medium">Empresa</th>
                <th className="px-3 py-2.5 font-medium">Sector</th>
                <th className="px-3 py-2.5 font-medium">Etapa</th>
                <th className="px-3 py-2.5 font-medium">Decisión</th>
                <th className="px-3 py-2.5 text-right font-medium">EBITDA ref.</th>
                <th className="px-3 py-2.5 text-right font-medium">EV</th>
                <th className="px-3 py-2.5 text-right font-medium">Brecha</th>
                <th className="px-3 py-2.5 font-medium">Puertas</th>
                <th className="px-3 py-2.5 font-medium">Dueño</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-border transition hover:bg-bg-elevated/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/${r.id}`} className="font-medium text-ink hover:text-brand">
                      {r.legal_name}
                    </Link>
                    <div className="text-[11px] text-ink-faint">
                      {[r.code, r.region, r.ownership_type].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">
                    {r.subsector ?? <span className="text-ink-faint">sin clasificar</span>}
                    {r.sector ? <div className="text-[11px] text-ink-faint">{r.sector}</div> : null}
                  </td>
                  <td className="px-3 py-2.5"><StageSelect id={r.id} stage={r.stage} /></td>
                  <td className="px-3 py-2.5">
                    <DecisionBadge decision={r.decision_status} veto={r.has_veto} />
                    {r.pass_reason ? (
                      <div className="mt-0.5 text-[11px] text-ink-mute">{r.pass_reason}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-ink">{m(r.ebitda_ref)}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-ink">{m(r.ev)}</td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                    <span className={Number(r.valuation_gap) > 0 ? 'text-amber-600' : 'text-ink'}>
                      {m(r.valuation_gap)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <ScorePill value={r.qss} label="QSS" cov={r.qss_cov} />
                      <ScorePill value={r.om} label="OM" cov={r.om_cov} />
                      <ScorePill value={r.pfr} label="PFR" cov={r.pfr_cov} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-soft">{r.owner ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        EV = EBITDA de referencia x Entry Multiple. Equity = EV - Deuda neta. Brecha = expectativa del
        vendedor - EV. El EBITDA de referencia es el normalizado si existe, y si no el último
        reportado. Una puerta marcada VETO se cierra por un kill criterion, no por la puntuación.
      </p>
    </div>
  );
}
