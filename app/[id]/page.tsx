import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProjectDetail } from '@/lib/arpa/db';
import AddDocumentForm from './_add-document';
import { AddStakeholderForm, UnlinkButton } from './_add-stakeholder';
import EnrichForm from './_enrich';
import Workbench from './_workbench';

export const dynamic = 'force-dynamic';

const dt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const d = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const MODEL_NAME: Record<string, string> = {
  qss: 'QSS · Screening',
  om: 'OM · Assessment',
  pfr: 'PFR · Financial Review',
};

/**
 * Tabs, in the order the work actually happens: fill the ficha, then judge it,
 * then record who is involved, then park the paperwork. Scoring is no longer
 * the first thing on screen, which was Marc's objection to the old layout.
 */
const TABS = [
  { key: 'datos', label: 'Datos' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'personas', label: 'Personas' },
  { key: 'docs', label: 'Documentos' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function Panel({ title, hint, children, action }: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {hint ? <p className="mt-0.5 text-[11px] text-ink-mute">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function ArpaProjectPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const detail = await getProjectDetail(params.id);
  if (!detail) notFound();

  const {
    project,
    company,
    taxonomy,
    taxonomyList,
    scores,
    killFlags,
    stakeholders,
    interactions,
    documents,
    scoringInput,
  } = detail;
  const flaggedInitial = killFlags.filter((f) => f.flagged).map((f) => f.kill_id);
  const owner = project.owner ?? 'Marc';

  const requested = searchParams?.tab;
  const tab: TabKey = (TABS.find((t) => t.key === requested)?.key ?? 'datos') as TabKey;

  const header = [
    company.cif,
    [company.city, company.region, company.country].filter(Boolean).join(', '),
    company.employees ? `${company.employees} empleados` : null,
    company.founded_year ? `fundada ${company.founded_year}` : null,
    company.admin_since ? `administrador desde ${company.admin_since}` : null,
  ].filter(Boolean);

  const counts: Record<TabKey, number | null> = {
    datos: null,
    scoring: scores.length,
    personas: stakeholders.length,
    docs: documents.length,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/pipeline" className="text-xs text-ink-mute transition hover:text-ink">
          ← Pipeline
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">{company.legal_name}</h1>
            <p className="mt-1 text-xs text-ink-mute">{header.join(' · ') || 'Sin datos de ficha'}</p>
            {taxonomy ? (
              <p className="mt-1 text-xs text-ink-soft">
                {taxonomy.sector} · {taxonomy.category} · {taxonomy.subsector}
                <span className="ml-2 text-ink-faint">
                  crecimiento {taxonomy.growth} · fragmentación {taxonomy.fragmentation} · consolidación{' '}
                  {taxonomy.consolidation}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-600">
                Sin subsector asignado: el encaje sectorial no se puede puntuar. Asígnalo en Datos.
              </p>
            )}
          </div>
          <div className="text-right text-xs text-ink-mute">
            {project.code ? <div className="font-mono text-ink-soft">{project.code}</div> : null}
            <div>{project.stage}</div>
            <div>Actualizado {dt(project.updated_at)}</div>
            {company.website ? (
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer noopener"
                className="text-brand hover:underline"
              >
                {company.website.replace(/^https?:\/\//, '')}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/${params.id}?tab=${t.key}`}
              scroll={false}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
                on
                  ? 'border-brand font-semibold text-ink'
                  : 'border-transparent text-ink-mute hover:text-ink'
              }`}
            >
              {t.label}
              {counts[t.key] ? (
                <span className="ml-1.5 text-[11px] text-ink-faint">{counts[t.key]}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {tab === 'datos' ? (
        <div className="space-y-4">
          <Panel
            title="Ficha de la empresa"
            hint="Lo que SABI contesta y el BORME no. A mano hoy, por la misma vía que usará la API."
          >
            <EnrichForm
              company={company}
              projectId={params.id}
              taxonomy={taxonomyList}
              owner={owner}
            />
          </Panel>

          {company.enrich_source ? (
            <p className="text-[11px] text-ink-faint">
              Ficha completada desde <span className="text-ink-soft">{company.enrich_source}</span>
              {company.enriched_by ? ` por ${company.enriched_by}` : ''}
              {company.enriched_at ? ` · ${dt(company.enriched_at)}` : ''}
            </p>
          ) : null}

          {company.notes ? (
            <Panel title="Notas">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink">{company.notes}</p>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {tab === 'scoring' ? (
        <div className="space-y-4">
          <Workbench
            project={project}
            baseInput={scoringInput}
            scoredByDefault={owner}
            flaggedInitial={flaggedInitial}
          />

          <Panel
            title="Historial de puntuaciones"
            hint="Cada guardado añade una fila por puerta. No se sobrescribe nada."
          >
            {scores.length === 0 ? (
              <p className="text-xs text-ink-faint">Todavía sin puntuar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-ink-mute">
                    <tr>
                      <th className="pb-2 font-medium">Puerta</th>
                      <th className="pb-2 text-right font-medium">0-100</th>
                      <th className="pb-2 font-medium">Veredicto</th>
                      <th className="pb-2 font-medium">Firmado por</th>
                      <th className="pb-2 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((s) => (
                      <tr key={s.id} className="border-t border-border">
                        <td className="py-1.5 text-ink-soft">{MODEL_NAME[s.model] ?? s.model}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums text-ink">
                          {s.total_0_100 ?? '—'}
                        </td>
                        <td className="py-1.5">
                          <span className={s.vetoed ? 'font-semibold text-rose-600' : 'text-ink-soft'}>
                            {s.verdict}
                            {s.vetoed ? ' (veto)' : ''}
                          </span>
                        </td>
                        <td className="py-1.5 text-ink-soft">{s.scored_by}</td>
                        <td className="py-1.5 text-ink-faint">{dt(s.scored_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === 'personas' ? (
        <div className="space-y-4">
          <Panel
            title="Personas"
            hint="Dueños, asesores y bancos de esta operación. Se guardan en Contactos, así que reaparecen en la siguiente."
            action={<AddStakeholderForm projectId={params.id} owner={owner} />}
          >
            {stakeholders.length === 0 ? (
              <p className="text-xs text-ink-faint">Sin contactos registrados.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {stakeholders.map((s) => (
                  <li key={s.link_id} className="rounded border border-border bg-bg px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-ink">
                        {/* The hint above claims these people live in Contactos.
                            The name links there so that claim is checkable in
                            one click instead of taken on trust. */}
                        <Link
                          href={`/crm?q=${encodeURIComponent(s.full_name)}`}
                          className="hover:text-brand hover:underline"
                          title="Ver la ficha en Contactos"
                        >
                          {s.full_name}
                        </Link>
                        {s.is_primary ? (
                          <span className="ml-2 text-[10px] font-bold text-brand">PRINCIPAL</span>
                        ) : null}
                      </span>
                      <span className="text-[11px] text-ink-faint">{s.kind}</span>
                    </div>
                    <div className="text-[11px] text-ink-mute">
                      {[s.role, s.org].filter(Boolean).join(' · ') || '—'}
                    </div>
                    {s.email || s.phone ? (
                      <div className="mt-0.5 text-[11px] text-ink-soft">
                        {[s.email, s.phone].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                    <div className="mt-1">
                      <UnlinkButton linkId={s.link_id} projectId={params.id} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Interacciones" hint="Últimas 30, de más reciente a más antigua.">
            {interactions.length === 0 ? (
              <p className="text-xs text-ink-faint">Sin interacciones registradas.</p>
            ) : (
              <ul className="space-y-2">
                {interactions.map((r) => (
                  <li key={r.id} className="rounded border border-border bg-bg px-3 py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-xs text-ink-soft">
                        <span className="text-ink">{r.kind}</span>
                        {r.direction ? ` · ${r.direction}` : ''}
                        {r.stakeholder_name ? ` · ${r.stakeholder_name}` : ''}
                      </span>
                      <span className="text-[11px] text-ink-faint">
                        {dt(r.happened_at)}
                        {r.logged_by ? ` · ${r.logged_by}` : ''}
                      </span>
                    </div>
                    {r.summary ? <p className="mt-1 text-xs leading-relaxed text-ink">{r.summary}</p> : null}
                    {r.next_step ? (
                      <p className="mt-1 text-[11px] text-amber-600">
                        Siguiente paso: {r.next_step}
                        {r.next_step_due ? ` (${d(r.next_step_due)})` : ''}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === 'docs' ? (
        <Panel
          title="Documentos"
          hint="Enlaces al original, no copias. Las cuentas anuales se archivan también en la empresa."
          action={<AddDocumentForm projectId={params.id} companyId={company.id} owner={owner} />}
        >
          {documents.length === 0 ? (
            <p className="text-xs text-ink-faint">Sin documentos registrados.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-border bg-bg px-3 py-2"
                >
                  <span className="text-sm text-ink">
                    {doc.external_url ? (
                      <a
                        href={doc.external_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-brand hover:underline"
                      >
                        {doc.title}
                      </a>
                    ) : (
                      doc.title
                    )}
                    <span className="ml-2 text-[11px] text-ink-faint">
                      {doc.doc_type}
                      {doc.period ? ` · ${doc.period}` : ''}
                    </span>
                  </span>
                  <span className="text-[11px] text-ink-faint">
                    {d(doc.created_at)}
                    {doc.uploaded_by ? ` · ${doc.uploaded_by}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
