import Link from 'next/link';

import { getProjects, getThemes, type PipelineRow } from '@/lib/arpa/db';
import { FUNNEL_LANES } from '@/lib/arpa/lists';
import TopNav from '../_topnav';
import StageSelect from '../pipeline/_stage-select';
import FocusSelect from './_focus';

export const dynamic = 'force-dynamic';

const m = (v: number | null) => (v === null || v === undefined ? null : `${Number(v).toFixed(1)} M€`);

type Params = { v?: string; theme?: string; industry?: string; stage?: string };

/** The current query with one key replaced, so a filter never drops the others. */
function href(params: Params, patch: Partial<Params>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (v) next.set(k, String(v));
  }
  const qs = next.toString();
  return qs ? `/proyectos?${qs}` : '/proyectos';
}

function Chip({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      className={`rounded-md border px-2.5 py-1 text-xs transition ${
        active
          ? 'border-brand bg-brand-wash font-semibold text-brand'
          : 'border-border text-ink-mute hover:bg-bg-elevated hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}

function Card({
  row,
  themes,
}: {
  row: PipelineRow;
  themes: { id: number; name: string }[];
}) {
  const ebitda = m(row.ebitda_ref);
  return (
    <article className="space-y-1.5 rounded-lg border border-border bg-bg-card p-2.5 shadow-sm transition hover:border-brand/40">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/${row.id}`} className="text-sm font-semibold leading-tight text-ink hover:text-brand">
          {row.legal_name}
        </Link>
        {row.has_veto ? (
          <span className="shrink-0 text-[10px] font-bold text-rose-600" title="Hay un kill criterion marcado">
            VETO
          </span>
        ) : null}
      </div>

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

      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {row.qss !== null ? (
          <span className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-semibold tabular-nums text-ink-soft">
            QSS {row.qss}
          </span>
        ) : (
          <span className="rounded border border-dashed border-border px-1.5 py-0.5 text-ink-faint">
            sin puntuar
          </span>
        )}
        {ebitda ? <span className="tabular-nums text-ink-faint">EBITDA {ebitda}</span> : null}
        {row.owner ? <span className="text-ink-faint">· {row.owner}</span> : null}
      </div>
    </article>
  );
}

export default async function ProyectosPage({ searchParams }: { searchParams: Params }) {
  const [view, allThemes] = await Promise.all([getProjects(searchParams), getThemes()]);
  const board = searchParams.v !== 'tarjetas';
  const pickable = allThemes.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const filtered = Boolean(searchParams.theme || searchParams.industry || searchParams.stage);

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
            el proyecto sí. Mismas operaciones que en Pipeline, vistas por donde están y por qué jugada
            son.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Link
            href={href(searchParams, { v: undefined })}
            className={`rounded px-3 py-1 text-xs transition ${
              board ? 'bg-brand font-semibold text-white' : 'text-ink-mute hover:text-ink'
            }`}
          >
            Tablero
          </Link>
          <Link
            href={href(searchParams, { v: 'tarjetas' })}
            className={`rounded px-3 py-1 text-xs transition ${
              !board ? 'bg-brand font-semibold text-white' : 'text-ink-mute hover:text-ink'
            }`}
          >
            Tarjetas
          </Link>
        </div>
      </div>

      {view.unthemed > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <strong className="font-semibold">{view.unthemed}</strong> de {view.total} proyecto(s) no
          tienen temática. El desplegable de cada tarjeta la asigna.
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 text-[11px] uppercase tracking-wider text-ink-faint">Temática</span>
          <Chip to={href(searchParams, { theme: undefined })} active={!searchParams.theme}>
            Todas
          </Chip>
          {view.themes.map((t) => (
            <Chip
              key={t.id}
              to={href(searchParams, { theme: String(t.id) })}
              active={searchParams.theme === String(t.id)}
            >
              {t.name} {t.count}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 text-[11px] uppercase tracking-wider text-ink-faint">Industria</span>
          <Chip to={href(searchParams, { industry: undefined })} active={!searchParams.industry}>
            Todas
          </Chip>
          {view.industries.map((i) => (
            <Chip
              key={i.id}
              to={href(searchParams, { industry: String(i.id) })}
              active={searchParams.industry === String(i.id)}
            >
              {i.subsector} {i.count}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 text-[11px] uppercase tracking-wider text-ink-faint">Etapa</span>
          <Chip to={href(searchParams, { stage: undefined })} active={!searchParams.stage}>
            Todas
          </Chip>
          {view.stages.map((s) => (
            <Chip
              key={s.stage}
              to={href(searchParams, { stage: s.stage })}
              active={searchParams.stage === s.stage}
            >
              {s.stage} {s.count}
            </Chip>
          ))}
        </div>
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
      ) : board ? (
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
                  {cards.map((r) => <Card key={r.id} row={r} themes={pickable} />)}
                  {cards.length === 0 ? (
                    <p className="px-1 py-3 text-center text-[11px] text-ink-faint">vacío</p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {view.rows.map((r) => <Card key={r.id} row={r} themes={pickable} />)}
        </div>
      )}

      {filtered ? (
        <Link href="/proyectos" className="inline-block text-xs text-ink-faint hover:text-brand">
          limpiar filtros
        </Link>
      ) : null}
    </div>
  );
}
