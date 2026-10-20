import Link from 'next/link';

import {
  getProjectDetail,
  getProjects,
  getTaxonomyOptions,
  getThemes,
  projectTitle,
  type PipelineRow,
} from '@/lib/arpa/db';
import { FUNNEL_LANES } from '@/lib/arpa/lists';
import { ExportButton } from '../_export-button';
import { Gates, ScorePill } from '../_gates';
import NewLeadForm from '../_new-lead';
import StageSelect from '../_stage-select';
import TopNav from '../_topnav';
import Ficha from './_ficha';
import FilterMenu from './_filter-menu';
import FocusSelect from './_focus';
import Modal from './_modal';

export const dynamic = 'force-dynamic';

const m = (v: number | null) => (v === null || v === undefined ? null : `${Number(v).toFixed(1)} M€`);
const m2 = (v: number | null) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)} M€`);

/**
 * Three views over one set of rows.
 *
 * `tabla` is what used to be the Pipeline tab. It was never a different thing:
 * both screens read `arpa_pipeline`, both listed the same deals, and the only
 * real difference was that one showed the money columns (EV, equity, brecha)
 * and the other did not. Two tabs for that is how the same deal gets worked in
 * one place and looked at in another, with the filters not carrying over.
 */
type Params = { v?: string; theme?: string; industry?: string; stage?: string; ficha?: string };

const VIEWS = [
  { key: undefined, label: 'Tablero' },
  { key: 'tarjetas', label: 'Tarjetas' },
  { key: 'tabla', label: 'Tabla' },
] as const;

function DecisionBadge({ decision, veto }: { decision: string | null; veto: boolean | null }) {
  if (!decision) return <span className="text-ink-faint">—</span>;
  const bad = decision === 'Pass';
  const good =
    decision === 'Proceed' || decision === 'Continue' || decision === 'Build Investment Case';
  const tone = bad
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : good
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
      >
        {decision}
      </span>
      {veto ? (
        <span className="text-[10px] font-bold text-rose-600" title="Hay un kill criterion marcado">
          VETO
        </span>
      ) : null}
    </span>
  );
}

/** The money read of the pipeline. Computed over the FILTERED rows, so it
 *  answers "what is this slice worth" and not always "what is everything
 *  worth", which is what the old Pipeline tab did. */
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
      gap.length
        ? `${(gap.reduce((a, r) => a + Number(r.valuation_gap), 0) / gap.length).toFixed(2)} M€`
        : '—',
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

/** The current query with one key replaced, so a filter never drops the others. */
function href(params: Params, patch: Partial<Params>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (v) next.set(k, String(v));
  }
  const qs = next.toString();
  return qs ? `/proyectos?${qs}` : '/proyectos';
}

/** One filter's selection, read off the URL as a comma separated list. */
const picked = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function Card({
  row,
  themes,
  params,
}: {
  row: PipelineRow;
  themes: { id: number; name: string }[];
  params: Params;
}) {
  const ebitda = m(row.ebitda_ref);
  return (
    <article className="space-y-1.5 rounded-lg border border-border bg-bg-card p-2.5 shadow-sm transition hover:border-brand/40">
      <div className="flex items-start justify-between gap-2">
        {/* Opens the popup, not the full page. A card is read far more often
            than it is edited, and the question it has to answer ("what is this
            and what are its numbers") does not justify leaving the board. The
            popup itself links on to the full ficha. */}
        <Link
          href={href(params, { ficha: row.id })}
          scroll={false}
          className="text-sm font-semibold leading-tight text-ink hover:text-brand"
          title="Ver toda la información sin salir del tablero"
        >
          {projectTitle(row)}
        </Link>
        {row.has_veto ? (
          <span className="shrink-0 text-[10px] font-bold text-rose-600" title="Hay un kill criterion marcado">
            VETO
          </span>
        ) : null}
      </div>

      {/* A named project would otherwise hide which company it is about, which
          is the one thing somebody scanning the board needs to recognise. */}
      {row.project_name?.trim() ? (
        <div className="text-[11px] text-ink-mute">{row.legal_name}</div>
      ) : null}

      {/* A deal over several companies is the whole point of the many-to-many,
          so the card says so rather than showing only the primary name. */}
      {row.company_count > 1 ? (
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand">
          + {row.company_count - 1} empresa(s) más
        </div>
      ) : null}

      <div className="text-[11px] text-ink-mute">
        {row.subsector ?? <span className="text-ink-faint">sin clasificar</span>}
      </div>

      <FocusSelect
        projectId={row.id}
        themeId={row.theme_id}
        taxonomyId={row.taxonomy_id}
        themes={themes}
      />

      {/* The same control the pipeline table uses. A board you cannot move is a
          table with rounded corners, and the lane a card sits in is derived from
          the stage, so changing it here moves the card. */}
      <StageSelect id={row.id} stage={row.stage} />

      {/* The three gates, coloured, and not QSS alone: a deal that passed
          screening at 100 and then scored 40 on the memo is not a good deal,
          and a card showing only the 100 says the opposite. The VETO already
          rides in the title line, so it is not repeated here. */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <Gates
          qss={row.qss}
          om={row.om}
          pfr={row.pfr}
          qssCov={row.qss_cov}
          omCov={row.om_cov}
          pfrCov={row.pfr_cov}
          compact
        />
        {ebitda ? <span className="tabular-nums text-ink-faint">EBITDA {ebitda}</span> : null}
        {row.owner ? <span className="text-ink-faint">· {row.owner}</span> : null}
      </div>
    </article>
  );
}

export default async function ProyectosPage({ searchParams }: { searchParams: Params }) {
  const [view, allThemes, taxonomy, detail] = await Promise.all([
    getProjects(searchParams),
    getThemes(),
    getTaxonomyOptions(),
    // The open popup is a search param, so it is read on the server with the
    // board in the same pass. An id that no longer exists just renders no
    // popup, which is the right outcome for a stale shared link.
    searchParams.ficha ? getProjectDetail(searchParams.ficha) : null,
  ]);
  const v = VIEWS.some((o) => o.key === searchParams.v) ? searchParams.v : undefined;
  const pickable = allThemes.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const filtered = Boolean(searchParams.theme || searchParams.industry || searchParams.stage);

  // Best screen score first, unscored last, which is what the old Pipeline
  // table did. A SABI import lands hundreds of rows at once, so without this
  // the table is in whatever order the export happened to be in.
  const ranked =
    v === 'tabla'
      ? view.rows.slice().sort((a, b) => {
          if (a.qss === null && b.qss === null) return a.legal_name.localeCompare(b.legal_name, 'es');
          if (a.qss === null) return 1;
          if (b.qss === null) return -1;
          return Number(b.qss) - Number(a.qss);
        })
      : view.rows;

  return (
    <div className="space-y-6">
      <TopNav active="projects" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">🗂️ ARPA · Proyectos</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-mute">
            Un proyecto es una empresa (o varias), una{' '}
            <strong className="font-semibold text-ink-soft">temática</strong> y una{' '}
            <strong className="font-semibold text-ink-soft">industria</strong>. La empresa no se mueve;
            el proyecto sí. Tres vistas de las mismas operaciones: por donde están, por qué jugada son,
            y con los números del screening.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {VIEWS.map((o) => (
              <Link
                key={o.label}
                href={href(searchParams, { v: o.key })}
                className={`rounded px-3 py-1 text-xs transition ${
                  v === o.key ? 'bg-brand font-semibold text-white' : 'text-ink-mute hover:text-ink'
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>
          <NewLeadForm taxonomy={taxonomy} />
        </div>
      </div>

      {/* Three dropdowns side by side, each taking SEVERAL values. The three
          rows of chips they replaced grew with the data: twenty one subsectores
          is twenty one buttons, and the table started below the fold. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <FilterMenu
          label="Temática"
          param="theme"
          params={searchParams}
          selected={picked(searchParams.theme)}
          options={view.themes.map((t) => ({ value: String(t.id), label: t.name, count: t.count }))}
        />
        <FilterMenu
          label="Industria"
          param="industry"
          params={searchParams}
          selected={picked(searchParams.industry)}
          options={view.industries.map((i) => ({
            value: String(i.id),
            label: i.subsector,
            count: i.count,
          }))}
        />
        <FilterMenu
          label="Etapa"
          param="stage"
          params={searchParams}
          selected={picked(searchParams.stage)}
          options={view.stages.map((s) => ({ value: s.stage, label: s.stage, count: s.count }))}
        />
      </div>

      {v === 'tabla' ? <Summary rows={view.rows} /> : null}

      {/* Above whatever is below it, in all three views. The export writes out
          the rows you are looking at, so it belongs next to them and not up in
          the title block where it reads as a page-level action. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-ink-faint">
          {view.rows.length === view.total
            ? `${view.total} proyecto(s)`
            : `${view.rows.length} de ${view.total} proyecto(s)`}
        </span>
        <ExportButton kind="pipeline" />
      </div>

      {view.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-card px-6 py-12 text-center">
          <p className="text-sm text-ink-soft">
            {view.total === 0 ? 'Todavía no hay proyectos.' : 'Ningún proyecto con estos filtros.'}
          </p>
          {view.total === 0 ? (
            <p className="mx-auto mt-2 max-w-md text-xs text-ink-faint">
              Un proyecto nace en Originación, cuando una empresa importada pasa al pipeline.
            </p>
          ) : null}
        </div>
      ) : v === undefined ? (
        /* The board. Columns are the funnel's gates, not the eleven stages: most
           of the eleven would always be empty and six columns already scroll. */
        <div className="flex gap-3 overflow-x-auto pb-3">
          {FUNNEL_LANES.map((lane) => {
            const cards = view.rows.filter((r) => (lane.stages as readonly string[]).includes(r.stage));
            return (
              <section key={lane.key} className="w-[232px] shrink-0 rounded-lg bg-bg-elevated p-2">
                <header className="mb-2 flex items-baseline justify-between px-0.5">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
                    {lane.label}
                  </h2>
                  <span className="text-[11px] tabular-nums text-ink-faint">{cards.length}</span>
                </header>
                <div className="space-y-2">
                  {cards.map((r) => (
                    <Card key={r.id} row={r} themes={pickable} params={searchParams} />
                  ))}
                  {cards.length === 0 ? (
                    <p className="px-1 py-3 text-center text-[11px] text-ink-faint">vacío</p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : v === 'tarjetas' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {view.rows.map((r) => (
            <Card key={r.id} row={r} themes={pickable} params={searchParams} />
          ))}
        </div>
      ) : (
        <>
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
                {ranked.map((r) => (
                  <tr key={r.id} className="border-t border-border transition hover:bg-bg-elevated/60">
                    <td className="px-4 py-2.5">
                      {/* The popup, like the card, so a row and a card open the
                          same thing. The old Pipeline table went straight to the
                          full page, which is why the two tabs felt unrelated. */}
                      <Link
                        href={href(searchParams, { ficha: r.id })}
                        scroll={false}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {projectTitle(r)}
                      </Link>
                      <div className="text-[11px] text-ink-faint">
                        {[r.project_name?.trim() ? r.legal_name : null, r.code, r.region, r.ownership_type]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-soft">
                      {r.subsector ?? <span className="text-ink-faint">sin clasificar</span>}
                      {r.sector ? <div className="text-[11px] text-ink-faint">{r.sector}</div> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <StageSelect id={r.id} stage={r.stage} />
                    </td>
                    <td className="px-3 py-2.5">
                      <DecisionBadge decision={r.decision_status} veto={r.has_veto} />
                      {r.pass_reason ? (
                        <div className="mt-0.5 text-[11px] text-ink-mute">{r.pass_reason}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-ink">
                      {m2(r.ebitda_ref)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-ink">{m2(r.ev)}</td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                      <span className={Number(r.valuation_gap) > 0 ? 'text-amber-600' : 'text-ink'}>
                        {m2(r.valuation_gap)}
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

          <p className="text-[11px] leading-relaxed text-ink-faint">
            EV = EBITDA de referencia x Entry Multiple. Equity = EV - Deuda neta. Brecha = expectativa
            del vendedor - EV. El EBITDA de referencia es el normalizado si existe, y si no el último
            reportado. Una puerta marcada VETO se cierra por un kill criterion, no por la puntuación.
          </p>
        </>
      )}

      {filtered ? (
        <Link href="/proyectos" className="inline-block text-xs text-ink-faint hover:text-brand">
          limpiar filtros
        </Link>
      ) : null}

      {detail ? (
        <Modal closeTo={href(searchParams, { ficha: undefined })}>
          <Ficha detail={detail} themes={pickable} />
        </Modal>
      ) : null}
    </div>
  );
}
