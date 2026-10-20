'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { setStage } from './actions';
import { STAGES } from '@/lib/arpa/lists';

/**
 * Moves one opportunity between stages straight from the list.
 *
 * A <select> and not drag-and-drop. Marc asked to be able to move things
 * himself, and there are eleven stages: a board wide enough for eleven columns
 * does not fit a laptop, and dragging is the one interaction that does not work
 * on the phone he will actually read this on.
 */
export default function StageSelect({ id, stage }: { id: string; stage: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const i = STAGES.indexOf(stage as (typeof STAGES)[number]);

  return (
    <div className="flex flex-col items-start gap-0.5">
      <select
        aria-label="Etapa"
        value={stage}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          setError(null);
          startTransition(async () => {
            const res = await setStage({ id, stage: next });
            if (!res.ok) setError(res.message);
            else router.refresh();
          });
        }}
        className="max-w-[190px] rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-ink-soft transition hover:text-ink disabled:opacity-40"
      >
        {STAGES.map((s, n) => (
          <option key={s} value={s}>
            {n + 1}. {s}
          </option>
        ))}
      </select>
      {i < 0 ? (
        <span className="text-[10px] text-amber-600">etapa fuera de lista</span>
      ) : null}
      {error ? <span className="text-[10px] text-rose-600">{error}</span> : null}
    </div>
  );
}
