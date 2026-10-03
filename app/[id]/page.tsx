import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProjectDetail } from '@/lib/arpa/db';
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

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-bg-card p-4">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function ArpaProjectPage({ params }: { params: { id: string } }) {
  const detail = await getProjectDetail(params.id);
  if (!detail) notFound();

  const { project, company, taxonomy, scores, killFlags, stakeholders, interactions, scoringInput } = detail;
  const flaggedInitial = killFlags.filter((f) => f.flagged).map((f) => f.kill_id);

  const header = [
    company.cif,
    [company.city, company.region, company.country].filter(Boolean).join(', '),
    company.employees ? `${company.employees} empleados` : null,
    company.founded_year ? `fundada ${company.founded_year}` : null,
    company.admin_since ? `administrador desde ${company.admin_since}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-zinc-500 transition hover:text-zinc-300">
          ← Pipeline
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{company.legal_name}</h1>
            <p className="mt-1 text-xs text-zinc-500">{header.join(' · ') || 'Sin datos de ficha'}</p>
            {taxonomy ? (
              <p className="mt-1 text-xs text-zinc-400">
                {taxonomy.sector} · {taxonomy.category} · {taxonomy.subsector}
                <span className="ml-2 text-zinc-600">
                  crecimiento {taxonomy.growth} · fragmentación {taxonomy.fragmentation} · consolidación{' '}
                  {taxonomy.consolidation}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-500">Sin subsector asignado: el encaje sectorial no se puede puntuar.</p>
            )}
          </div>
          <div className="text-right text-xs text-zinc-500">
            {project.code ? <div className="font-mono text-zinc-400">{project.code}</div> : null}
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

      <Workbench
        project={project}
        baseInput={scoringInput}
        scoredByDefault={project.owner ?? 'Marc'}
        flaggedInitial={flaggedInitial}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Historial de puntuaciones"
          hint="Cada guardado añade una fila por puerta. No se sobrescribe nada."
        >
          {scores.length === 0 ? (
            <p className="text-xs text-zinc-600">Todavía sin puntuar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
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
                      <td className="py-1.5 text-zinc-400">{MODEL_NAME[s.model] ?? s.model}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-white">
                        {s.total_0_100 ?? '—'}
                      </td>
                      <td className="py-1.5">
                        <span className={s.vetoed ? 'font-semibold text-rose-400' : 'text-zinc-400'}>
                          {s.verdict}
                          {s.vetoed ? ' (veto)' : ''}
                        </span>
                      </td>
                      <td className="py-1.5 text-zinc-400">{s.scored_by}</td>
                      <td className="py-1.5 text-zinc-600">{dt(s.scored_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Personas" hint="Contactos de la empresa y de este proyecto.">
          {stakeholders.length === 0 ? (
            <p className="text-xs text-zinc-600">Sin contactos registrados.</p>
          ) : (
            <ul className="space-y-2">
              {stakeholders.map((s) => (
                <li key={s.link_id} className="rounded border border-border bg-bg px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-white">
                      {s.full_name}
                      {s.is_primary ? <span className="ml-2 text-[10px] font-bold text-brand">PRINCIPAL</span> : null}
                    </span>
                    <span className="text-[11px] text-zinc-600">{s.kind}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {[s.role, s.org].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {s.email || s.phone ? (
                    <div className="mt-0.5 text-[11px] text-zinc-400">
                      {[s.email, s.phone].filter(Boolean).join(' · ')}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Interacciones" hint="Últimas 30, de más reciente a más antigua.">
        {interactions.length === 0 ? (
          <p className="text-xs text-zinc-600">Sin interacciones registradas.</p>
        ) : (
          <ul className="space-y-2">
            {interactions.map((r) => (
              <li key={r.id} className="rounded border border-border bg-bg px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs text-zinc-400">
                    <span className="text-white">{r.kind}</span>
                    {r.direction ? ` · ${r.direction}` : ''}
                    {r.stakeholder_name ? ` · ${r.stakeholder_name}` : ''}
                  </span>
                  <span className="text-[11px] text-zinc-600">
                    {dt(r.happened_at)}
                    {r.logged_by ? ` · ${r.logged_by}` : ''}
                  </span>
                </div>
                {r.summary ? <p className="mt-1 text-xs leading-relaxed text-zinc-300">{r.summary}</p> : null}
                {r.next_step ? (
                  <p className="mt-1 text-[11px] text-amber-400">
                    Siguiente paso: {r.next_step}
                    {r.next_step_due ? ` (${d(r.next_step_due)})` : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {company.notes ? (
        <Panel title="Notas">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{company.notes}</p>
        </Panel>
      ) : null}
    </div>
  );
}
