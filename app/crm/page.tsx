import Link from 'next/link';

import { getAgenda, getLinkTargets, getStakeholders } from '@/lib/arpa/db';
import { ExportButton } from '../_export-button';
import TopNav from '../_topnav';
import Agenda from './_agenda';
import Links from './_links';
import NewStakeholderForm from './_new-stakeholder';
import PersonPanel from './_person-panel';

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  Owner: 'propietario',
  'Family member': 'familia',
  Management: 'directivo',
  Advisor: 'asesor',
  Banker: 'banquero',
  Broker: 'broker',
  Lawyer: 'abogado',
  Accountant: 'asesor fiscal',
  Lender: 'financiador',
  Investor: 'inversor',
  LP: 'LP',
  'Co-investor': 'co-inversor',
  Intermediary: 'intermediario',
  Other: 'otro',
};

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-mute';
const td = 'px-3 py-2 align-top';

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-1 text-xs transition ${
        active
          ? 'border-brand bg-brand-wash font-semibold text-brand'
          : 'border-border text-ink-mute hover:bg-bg-elevated hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}

const day = (v: string | null) => (v ? v.slice(0, 10) : null);

export default async function CrmPage({
  searchParams,
}: {
  searchParams: { kind?: string; q?: string };
}) {
  const [view, targets, agenda] = await Promise.all([
    getStakeholders({ kind: searchParams.kind, q: searchParams.q }),
    getLinkTargets(),
    getAgenda(),
  ]);

  // The agenda's person picker must offer EVERYONE, not the filtered list, or a
  // search in the box above silently narrows who a step can be assigned to.
  // Only pay for the second read when a filter is actually on.
  const filtered = Boolean(searchParams.kind || searchParams.q);
  const everyone = filtered ? (await getStakeholders()).rows : view.rows;

  const chipHref = (kind: string | null) => {
    const next = new URLSearchParams();
    if (kind) next.set('kind', kind);
    if (searchParams.q) next.set('q', searchParams.q);
    const qs = next.toString();
    return qs ? `/crm?${qs}` : '/crm';
  };

  return (
    <div className="space-y-6">
      <TopNav active="crm" />

      <div>
        <h1 className="text-2xl font-bold text-ink">📇 ARPA · Contactos</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-mute">
          Las personas, no las empresas. Un banquero o un abogado aparece en varias operaciones, así
          que la persona se guarda una sola vez y el <strong className="font-semibold text-ink-soft">vínculo</strong>
          {' '}es el que lleva el rol en esa operación concreta. Desde aquí se ve con quién hay relación
          antes de empezar a llamar.
        </p>
      </div>

      <Agenda items={agenda} people={everyone.map((p) => ({ id: p.id, full_name: p.full_name }))} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* No `action`: a GET form posts to the current URL, which keeps the
            basePath. A literal "/crm" would bypass it and 404. */}
        <form method="get" className="flex items-center gap-2">
          {searchParams.kind ? <input type="hidden" name="kind" value={searchParams.kind} /> : null}
          <input
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Nombre u organización"
            className="w-56 rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
          <button type="submit" className="rounded border border-border px-3 py-1.5 text-xs text-ink-mute hover:text-ink">
            Buscar
          </button>
          {searchParams.q ? (
            <Link href={searchParams.kind ? `/crm?kind=${encodeURIComponent(searchParams.kind)}` : '/crm'} className="text-xs text-ink-faint hover:text-ink">
              limpiar
            </Link>
          ) : null}
        </form>
        <div className="flex items-center gap-2">
          {/* The route reads the type filter as `tipo`, because `kind` already
              names the export itself. */}
          <ExportButton kind="contactos" params={{ tipo: searchParams.kind, q: searchParams.q }} />
          <NewStakeholderForm />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-[11px] uppercase tracking-wider text-ink-faint">Tipo</span>
        <Chip href={chipHref(null)} active={!searchParams.kind}>
          Todos
        </Chip>
        {view.kinds.map((k) => (
          <Chip key={k.kind} href={chipHref(k.kind)} active={searchParams.kind === k.kind}>
            {KIND_LABELS[k.kind] ?? k.kind} {k.count}
          </Chip>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-border bg-bg-elevated">
            <tr>
              <th className={th}>Persona</th>
              <th className={th}>Tipo</th>
              <th className={th}>Contacto</th>
              <th className={th}>Operaciones</th>
              <th className={th}>Último contacto</th>
              <th className={th}>Ficha</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className={td}>
                  <div className="font-medium text-ink">{r.full_name}</div>
                  {r.org ? <div className="text-[11px] text-ink-mute">{r.org}</div> : null}
                  {r.city ? <div className="text-[11px] text-ink-faint">{r.city}</div> : null}
                </td>
                <td className={td}>
                  <span className="whitespace-nowrap rounded border border-border bg-bg-elevated px-2 py-0.5 text-[11px] text-ink-soft">
                    {KIND_LABELS[r.kind] ?? r.kind}
                  </span>
                </td>
                <td className={`${td} text-[11px] text-ink-soft`}>
                  {r.email ? <div>{r.email}</div> : null}
                  {r.phone ? <div className="tabular-nums">{r.phone}</div> : null}
                  {r.linkedin ? (
                    <a href={r.linkedin} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      LinkedIn
                    </a>
                  ) : null}
                  {!r.email && !r.phone && !r.linkedin ? <span className="text-ink-faint">—</span> : null}
                </td>
                <td className={td}>
                  <Links stakeholderId={r.id} links={r.links} targets={targets} />
                </td>
                <td className={`${td} text-[11px] text-ink-soft`}>
                  {r.interaction_count === 0 ? (
                    <span className="text-ink-faint">nunca</span>
                  ) : (
                    <>
                      <div className="tabular-nums">{day(r.last_interaction_at)}</div>
                      <div className="text-ink-faint">{r.interaction_count} interacción{r.interaction_count === 1 ? '' : 'es'}</div>
                    </>
                  )}
                </td>
                <td className={td}>
                  <PersonPanel person={r} />
                </td>
              </tr>
            ))}
            {view.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-ink-mute">
                  {searchParams.q || searchParams.kind
                    ? 'Ningún contacto con ese filtro.'
                    : 'Todavía no hay contactos. Empieza por el propietario de una empresa del pipeline.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
