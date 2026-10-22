import Link from 'next/link';

import {
  getIosLongList,
  getIosProjects,
  getIosScorecards,
  getIosTheses,
} from '@/lib/ios/db';
import { STAGES, STAGE_LABEL } from '@/lib/ios/lists';
import { scoreProject } from '@/lib/ios/scoring';
import ExportCsv from '../_export-button';
import { DASH, Pill } from '../_ui';
import NewProject from './_new-project';

export const dynamic = 'force-dynamic';

/**
 * The board over ARPA's nine stages.
 *
 * The cards are links and nothing else. No drag and drop and no stage dropdown:
 * moving a deal happens at its gate, in the workspace, with a reason typed in.
 * A board you can drag is a board where the funnel numbers mean nothing, which is
 * the exact complaint their IOS document opens with.
 */
const STATUS_TONE: Record<string, string> = {
  Active: 'good',
  Monitor: 'warn',
  Paused: 'warn',
  Passed: 'bad',
  'Closed Lost': 'bad',
  'Closed Won': 'brand',
};

/**
 * Keyed by `ModelResult.outcome`. The card shows the furthest gate a human has
 * finished, not the stage's own gate: a project sitting in Assessment with its
 * QSS at 92 and its OM half filled in should read 92, because that is the last
 * thing anybody actually decided.
 */
const SCORE_TONE: Record<number, string> = {
  [-1]: 'neutral',
  0: 'good',
  1: 'warn',
  2: 'bad',
};

export default async function PipelinePage() {
  const [projects, theses, companies, scorecards] = await Promise.all([
    getIosProjects(),
    getIosTheses(),
    getIosLongList(),
    getIosScorecards(),
  ]);

  const live = projects.filter(
    (p) => !['Passed', 'Closed Lost'].includes(p.project_status),
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          {projects.length} proyecto{projects.length === 1 ? '' : 's'} · {live.length} vivo
          {live.length === 1 ? '' : 's'} · la etapa solo cambia en el gate
        </p>
        <div className="flex items-center gap-2">
          <ExportCsv kind="pipeline" label="CSV del pipeline" />
          <NewProject
            theses={theses.map((t) => ({ id: t.id, code: t.code, name: t.name }))}
            companies={companies.map((c) => ({
              id: c.id,
              name: c.name,
              subsector: c.subsector,
            }))}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-3">
        {STAGES.map((stage) => {
          const rows = projects.filter((p) => p.stage === stage);
          return (
            <section key={stage} className="rounded-lg border border-border bg-bg-card">
              <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
                <h2 className="text-xs font-semibold text-ink">{STAGE_LABEL[stage]}</h2>
                <span className="font-mono text-[10px] text-ink-faint">{rows.length}</span>
              </header>
              <div className="space-y-2 p-2">
                {rows.map((p) => {
                  const card = scorecards.get(p.id);
                  const gate = card
                    ? scoreProject(card.ratings, card.kills).furthest
                    : null;
                  return (
                  <Link
                    key={p.id}
                    href={`/v2/pipeline/${p.id}`}
                    className="block rounded border border-border bg-bg px-2.5 py-2 transition hover:border-strong"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{p.name}</span>
                      <Pill tone={STATUS_TONE[p.project_status] ?? 'neutral'}>
                        {p.project_status}
                      </Pill>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-faint">
                      {gate ? (
                        <Pill
                          tone={SCORE_TONE[gate.outcome]}
                          title={`${gate.name} · ${gate.verdict}`}
                        >
                          {gate.name.replace(' Score', '')} {gate.score ?? DASH}
                        </Pill>
                      ) : (
                        <span className="text-ink-faint">sin puntuar</span>
                      )}
                      <span>
                        {p.thesis_code ?? 'sin tesis'} · {p.owner ?? 'sin responsable'}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-ink-mute">
                      {p.next_step ? `Próximo: ${p.next_step}` : `Próximo paso ${DASH}`}
                    </div>
                  </Link>
                  );
                })}
                {rows.length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-ink-faint">Vacía</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
