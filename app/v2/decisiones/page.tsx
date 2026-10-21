import Link from 'next/link';

import { getIosDecisions } from '@/lib/ios/db';
import { STAGE_LABEL } from '@/lib/ios/lists';
import ExportCsv from '../_export-button';
import { Pill, Stat } from '../_ui';

export const dynamic = 'force-dynamic';

/**
 * The decision log, newest first, Blocked rows included.
 *
 * This is the screen that makes the gate worth having. Every stage change in V2
 * is one row here with a rationale attached, and every refused attempt is a row
 * too: the funnel can be read backwards.
 */
const dt = (v: string) =>
  new Date(v).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default async function DecisionesPage() {
  const decisions = await getIosDecisions();
  const blocked = decisions.filter((d) => d.status === 'Blocked').length;
  const advances = decisions.filter(
    (d) => d.decision_type === 'Advance' && d.status === 'Approved',
  ).length;

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Decisiones" value={String(decisions.length)} hint="las 200 últimas" />
        <Stat label="Avances" value={String(advances)} hint="etapas movidas" />
        <Stat label="Bloqueadas" value={String(blocked)} hint="intento con gate cerrado" />
      </div>

      {/* The file carries up to 1000 rows and the list 200, so it is labelled as
          the whole log and not as "what you are seeing". */}
      <div className="mb-4 flex justify-end">
        <ExportCsv kind="decisiones" label="CSV del histórico" />
      </div>

      {decisions.length === 0 ? (
        <p className="rounded-lg border border-border bg-bg-card px-4 py-8 text-center text-sm text-ink-faint">
          Todavía no hay decisiones. La primera aparecerá al registrar un gate en Pipeline.
        </p>
      ) : (
        <ul className="space-y-2">
          {decisions.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border border-border bg-bg-card px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <Pill tone={d.status === 'Blocked' ? 'bad' : 'good'}>{d.status}</Pill>
                <Link
                  href={`/v2/pipeline/${d.project_id}?tab=decisiones`}
                  className="text-sm font-semibold text-ink transition hover:text-brand"
                >
                  {d.project_name}
                </Link>
                <span className="text-sm text-ink-soft">{d.decision}</span>
                <span className="text-xs text-ink-faint">
                  {d.decision_type} · gate {STAGE_LABEL[d.gate]}
                </span>
                <span className="ml-auto font-mono text-[11px] text-ink-faint">
                  {dt(d.decided_at)}
                  {d.decided_by ? ` · ${d.decided_by}` : ''}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{d.rationale}</p>
              {d.blocked_reason ? (
                <p className="mt-1 text-xs text-rose-700">Faltaba: {d.blocked_reason}</p>
              ) : null}
              {d.stage_after && d.stage_after !== d.stage_before ? (
                <p className="mt-1 text-xs text-ink-faint">
                  {d.stage_before} → {d.stage_after}
                </p>
              ) : null}
              {d.pass_lost_reason ? (
                <p className="mt-1 text-xs text-ink-mute">
                  Motivo: {d.pass_lost_reason}
                  {d.decisive_evidence ? ` · ${d.decisive_evidence}` : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
