import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getIosLongList, getIosProjectDetail, getIosTheses } from '@/lib/ios/db';
import { gateReady } from '@/lib/ios/gates';
import { GATE_ALLOWED, STAGES, STAGE_LABEL } from '@/lib/ios/lists';
import { DASH, Pill } from '../../_ui';
import { scoreProject } from '@/lib/ios/scoring';
import Documents from './_documents';
import GatePanel from './_gate-panel';
import AddPerimeter from './_perimeter';
import Scoring from './_scoring';

export const dynamic = 'force-dynamic';

/**
 * One project, everything about it.
 *
 * The stage is printed as text. There is no control on this page that writes it,
 * and the gate panel is the only way it ever changes. The strip of nine stages at
 * the top is a position indicator, not a set of buttons.
 */
const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'puntuacion', label: 'Puntuación' },
  { key: 'tesis', label: 'Tesis' },
  { key: 'perimetro', label: 'Perímetro' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'decisiones', label: 'Decisiones' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const STATUS_TONE: Record<string, string> = {
  Active: 'good',
  Monitor: 'warn',
  Paused: 'warn',
  Passed: 'bad',
  'Closed Lost': 'bad',
  'Closed Won': 'brand',
};

/** Keyed by `ModelResult.outcome`: -1 none, 0 proceed, 1 monitor, 2 pass. */
const SCORE_TONE: Record<number, string> = {
  [-1]: 'neutral',
  0: 'good',
  1: 'warn',
  2: 'bad',
};

const DOC_TONE: Record<string, string> = {
  Approved: 'good',
  'In Review': 'warn',
  Drafting: 'neutral',
  'Not Started': 'neutral',
  Rejected: 'bad',
  Superseded: 'neutral',
};

const d = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : DASH;

const dt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : DASH;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-52 shrink-0 text-xs text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export default async function IosProjectPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const detail = await getIosProjectDetail(params.id);
  if (!detail) notFound();

  const { project, facts, documents, perimeter, decisions, scorecard } = detail;
  const readiness = gateReady(facts);
  const score = scoreProject(scorecard.ratings, scorecard.kills);
  const tab: TabKey = TABS.find((t) => t.key === searchParams?.tab)?.key ?? 'resumen';

  // Only the tab on screen pays for its list: 140 theses and 258 companies are
  // two extra round trips nobody needs on the Documentos tab.
  const theses = tab === 'resumen' || tab === 'tesis' ? await getIosTheses() : [];
  const companies = tab === 'perimetro' ? await getIosLongList() : [];

  const stageIndex = STAGES.indexOf(project.stage);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/v2/pipeline" className="text-xs text-ink-mute transition hover:text-ink">
          ← Pipeline
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">{project.name}</h1>
            <p className="mt-1 text-xs text-ink-mute">
              {STAGE_LABEL[project.stage]} · {project.stage_status} · desde{' '}
              {d(project.stage_entered_at)} · {project.owner ?? 'sin responsable'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={STATUS_TONE[project.project_status] ?? 'neutral'}>
              {project.project_status}
            </Pill>
            {score.furthest ? (
              <Pill
                tone={SCORE_TONE[score.furthest.outcome]}
                title={`${score.furthest.name} · ${score.furthest.question}`}
              >
                {score.furthest.name} {score.furthest.score ?? DASH} · {score.furthest.verdict}
              </Pill>
            ) : null}
            <Pill tone={readiness.ready ? 'good' : 'bad'}>
              {readiness.ready ? 'Gate abierto' : 'Gate cerrado'}
            </Pill>
          </div>
        </div>
      </div>

      {/* Nine stages as a position indicator. Not clickable, by design. */}
      <ol className="flex flex-wrap gap-1">
        {STAGES.map((s, i) => (
          <li
            key={s}
            title={STAGE_LABEL[s]}
            className={`rounded border px-2 py-1 text-[11px] ${
              i === stageIndex
                ? 'border-brand bg-brand-wash font-semibold text-brand'
                : i < stageIndex
                  ? 'border-border bg-bg-elevated text-ink-mute'
                  : 'border-border text-ink-faint'
            }`}
          >
            {STAGE_LABEL[s]}
          </li>
        ))}
      </ol>

      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/v2/pipeline/${project.id}?tab=${t.key}`}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key
                ? 'border-brand bg-brand-wash text-brand'
                : 'border-border text-ink-mute hover:border-strong hover:text-ink'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'resumen' ? (
        <GatePanel
          project={project}
          checks={readiness.checks}
          ready={readiness.ready}
          allowed={GATE_ALLOWED[project.stage]}
          theses={theses.map((t) => ({ id: t.id, code: t.code, name: t.name }))}
        />
      ) : null}

      {tab === 'puntuacion' ? (
        <Scoring
          projectId={project.id}
          ratings={scorecard.ratings}
          kills={scorecard.kills}
          notes={scorecard.notes}
          scoredBy={scorecard.scored_by}
          updatedAt={scorecard.updated_at}
        />
      ) : null}

      {tab === 'tesis' ? (
        <section className="rounded-lg border border-border bg-bg-card px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Tesis y encaje</h2>
          {(() => {
            const thesis = theses.find((t) => t.id === project.thesis_id);
            if (!thesis) {
              return (
                <p className="mt-2 text-sm text-ink-faint">
                  Sin tesis enlazada. El gate de Screening la exige, y se elige en Resumen.
                </p>
              );
            }
            return (
              <dl className="mt-2">
                <Row label="Tesis">
                  {thesis.code} · {thesis.name}
                </Row>
                <Row label="Ámbito">{thesis.scope}</Row>
                <Row label="Driver estructural">{thesis.structural_driver ?? DASH}</Row>
                <Row label="Estrategia principal">{thesis.primary_strategy ?? DASH}</Row>
                <Row label="EBITDA objetivo">{thesis.target_ebitda_eur_m ?? DASH}</Row>
                <Row label="Ventas objetivo">{thesis.target_revenue_eur_m ?? DASH}</Row>
                <Row label="Perfil ideal">{thesis.ideal_target_profile ?? DASH}</Row>
                <Row label="Riesgos de cribado">{thesis.key_screening_risks ?? DASH}</Row>
                <Row label="Subsectores">
                  {thesis.subsectors.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {thesis.subsectors.map((s) => (
                        <Pill key={s}>{s}</Pill>
                      ))}
                    </span>
                  ) : (
                    'Cross-sector, sin subsector asignado'
                  )}
                </Row>
                <Row label="Palancas de valor">
                  {thesis.value_creation_levers.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {thesis.value_creation_levers.map((l) => (
                        <Pill key={l}>{l}</Pill>
                      ))}
                    </span>
                  ) : (
                    DASH
                  )}
                </Row>
              </dl>
            );
          })()}
        </section>
      ) : null}

      {tab === 'perimetro' ? (
        <section className="rounded-lg border border-border bg-bg-card">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Perímetro</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Las empresas del proyecto. Un build-up tiene plataforma y add-ons.
            </p>
          </header>
          <div className="border-b border-border px-4 py-3">
            <AddPerimeter
              projectId={project.id}
              companies={companies.map((c) => ({
                id: c.id,
                name: c.name,
                subsector: c.subsector,
              }))}
            />
          </div>
          {perimeter.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-faint">
              Ninguna empresa en el perímetro.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                  <th className="px-4 py-2">Empresa</th>
                  <th className="px-4 py-2">Papel</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2">Subsector</th>
                  <th className="px-4 py-2">Provincia</th>
                  <th className="px-4 py-2 text-right">Ventas est.</th>
                </tr>
              </thead>
              <tbody>
                {perimeter.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">{p.company_name}</td>
                    <td className="px-4 py-2 text-xs text-ink-mute">{p.role}</td>
                    <td className="px-4 py-2 text-xs text-ink-mute">{p.inclusion_status}</td>
                    <td className="px-4 py-2 text-xs text-ink-mute">{p.subsector ?? DASH}</td>
                    <td className="px-4 py-2 text-xs text-ink-mute">{p.province ?? DASH}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-ink">
                      {p.revenue_estimate_eur_m === null
                        ? DASH
                        : `${Number(p.revenue_estimate_eur_m).toFixed(1)} M€`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === 'documentos' ? (
        <Documents projectId={project.id} documents={documents} />
      ) : null}

      {tab === 'decisiones' ? (
        <section className="rounded-lg border border-border bg-bg-card">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Historial de decisiones</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Incluye los intentos bloqueados: un avance rechazado también es historia.
            </p>
          </header>
          {decisions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-faint">
              Ninguna decisión registrada.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {decisions.map((dec) => (
                <li key={dec.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Pill tone={dec.status === 'Blocked' ? 'bad' : 'good'}>{dec.status}</Pill>
                    <span className="text-sm font-semibold text-ink">{dec.decision}</span>
                    <span className="text-xs text-ink-faint">
                      {dec.decision_type} · gate {STAGE_LABEL[dec.gate]}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-ink-faint">
                      {dt(dec.decided_at)}
                      {dec.decided_by ? ` · ${dec.decided_by}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{dec.rationale}</p>
                  {dec.blocked_reason ? (
                    <p className="mt-1 text-xs text-rose-700">Faltaba: {dec.blocked_reason}</p>
                  ) : null}
                  {dec.stage_after && dec.stage_after !== dec.stage_before ? (
                    <p className="mt-1 text-xs text-ink-faint">
                      {dec.stage_before} → {dec.stage_after}
                    </p>
                  ) : null}
                  {dec.pass_lost_reason ? (
                    <p className="mt-1 text-xs text-ink-mute">
                      Motivo: {dec.pass_lost_reason}
                      {dec.decisive_evidence ? ` · ${dec.decisive_evidence}` : ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* The deliverables, visible on every tab: a closed gate is almost always a
          document that is not Approved yet. */}
      {tab === 'documentos' ? null : (
        <section className="rounded-lg border border-border bg-bg-card px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Entregables</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {documents.length === 0 ? (
              <span className="text-sm text-ink-faint">Ninguno.</span>
            ) : (
              documents.map((doc) => (
                <Pill key={doc.id} tone={DOC_TONE[doc.doc_status] ?? 'neutral'}>
                  {doc.doc_type} v{doc.version} · {doc.doc_status}
                </Pill>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
