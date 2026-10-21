import Link from 'next/link';

import {
  getAllGateFacts,
  getIosDocumentsByStatus,
  getIosProjects,
} from '@/lib/ios/db';
import { gateReady } from '@/lib/ios/gates';
import { STAGE_LABEL } from '@/lib/ios/lists';
import { DASH, Empty, Panel, Pill, Stat } from './_ui';

export const dynamic = 'force-dynamic';

/**
 * Mi trabajo: the three questions the team opens the tool to answer.
 *
 * Which gates are open and waiting for somebody to decide, which documents are
 * sitting in review, and which next steps have gone past their date. All three
 * are derived: nothing on this screen is a field anyone maintains.
 */
const LIVE = ['Active', 'Monitor', 'Paused'];

const today = () => new Date().toISOString().slice(0, 10);

export default async function MiTrabajoPage() {
  const [projects, facts, inReview] = await Promise.all([
    getIosProjects(),
    getAllGateFacts(),
    getIosDocumentsByStatus('In Review'),
  ]);

  const factsById = new Map(facts.map((f) => [f.project_id, f]));
  const live = projects.filter((p) => LIVE.includes(p.project_status));

  const ready = live.filter((p) => {
    const f = factsById.get(p.id);
    return f ? gateReady(f).ready && p.stage !== 'Portfolio' : false;
  });

  const blocked = live.filter((p) => {
    const f = factsById.get(p.id);
    if (!f || p.stage === 'Portfolio') return false;
    return !gateReady(f).ready;
  });

  const now = today();
  const overdue = live.filter((p) => p.next_step_due !== null && p.next_step_due < now);

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vivos" value={String(live.length)} hint="Active, Monitor o Paused" />
        <Stat label="Gate abierto" value={String(ready.length)} hint="esperando decisión" />
        <Stat label="En revisión" value={String(inReview.length)} hint="documentos In Review" />
        <Stat label="Vencidos" value={String(overdue.length)} hint="próximo paso fuera de fecha" />
      </div>

      <Panel
        title="Esperando decisión"
        hint="El gate está abierto: alguien tiene que registrar la decisión para que la etapa se mueva."
      >
        {ready.length === 0 ? (
          <Empty>Ningún gate abierto ahora mismo.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {ready.map((p) => (
              <li key={p.id} className="py-2">
                <Link
                  href={`/v2/pipeline/${p.id}`}
                  className="flex flex-wrap items-baseline gap-2 transition hover:text-brand"
                >
                  <span className="text-sm font-medium text-ink">{p.name}</span>
                  <Pill tone="good">{STAGE_LABEL[p.stage]}</Pill>
                  <span className="text-xs text-ink-faint">{p.owner ?? 'sin responsable'}</span>
                  <span className="ml-auto truncate text-xs text-ink-mute">
                    {p.next_step ?? DASH}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Documentos en revisión" hint="Aprobar uno abre el gate de su etapa.">
        {inReview.length === 0 ? (
          <Empty>Ningún documento en revisión.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {inReview.map((doc) => (
              <li key={doc.id} className="py-2">
                <Link
                  href={`/v2/pipeline/${doc.project_id}?tab=documentos`}
                  className="flex flex-wrap items-baseline gap-2 transition hover:text-brand"
                >
                  <span className="text-sm font-medium text-ink">{doc.project_name}</span>
                  <Pill tone="warn">
                    {doc.doc_type} v{doc.version}
                  </Pill>
                  <span className="text-xs text-ink-faint">{doc.title ?? DASH}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Próximos pasos vencidos" hint="Fecha pasada y el paso sigue abierto.">
        {overdue.length === 0 ? (
          <Empty>Nada vencido.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {overdue.map((p) => (
              <li key={p.id} className="py-2">
                <Link
                  href={`/v2/pipeline/${p.id}`}
                  className="flex flex-wrap items-baseline gap-2 transition hover:text-brand"
                >
                  <span className="text-sm font-medium text-ink">{p.name}</span>
                  <Pill tone="bad">{p.next_step_due}</Pill>
                  <span className="truncate text-xs text-ink-mute">{p.next_step ?? DASH}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Gate cerrado"
        hint="Lo que falta está en la columna de la derecha. Es la lista de trabajo real."
      >
        {blocked.length === 0 ? (
          <Empty>Ningún proyecto bloqueado.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {blocked.map((p) => {
              const f = factsById.get(p.id);
              const missing = f
                ? gateReady(f)
                    .checks.filter((c) => !c.ok)
                    .map((c) => c.label)
                : [];
              return (
                <li key={p.id} className="py-2">
                  <Link
                    href={`/v2/pipeline/${p.id}`}
                    className="flex flex-wrap items-baseline gap-2 transition hover:text-brand"
                  >
                    <span className="text-sm font-medium text-ink">{p.name}</span>
                    <Pill>{STAGE_LABEL[p.stage]}</Pill>
                    <span className="ml-auto text-xs text-rose-700">{missing.join(' · ')}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
