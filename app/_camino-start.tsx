'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { startFromCamino } from './actions';

/**
 * Opens a deal on a company the camino found, carrying the camino's own
 * temática and subsector into the project.
 */
export default function CaminoStart({
  companyId,
  themeId,
  taxonomyId,
}: {
  companyId: string;
  themeId: number;
  taxonomyId: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await startFromCamino({
              company_id: companyId,
              theme_id: themeId,
              taxonomy_id: taxonomyId,
            });
            if (!res.ok) {
              setError(res.message);
              return;
            }
            if (res.projectId) router.push(`/${res.projectId}`);
            else router.refresh();
          });
        }}
        className="whitespace-nowrap rounded border border-brand bg-brand-wash px-2 py-0.5 text-[11px] font-semibold text-brand transition hover:bg-brand hover:text-white disabled:opacity-40"
      >
        {pending ? 'Abriendo…' : 'Abrir proyecto'}
      </button>
      {error ? <p className="mt-1 text-[10px] text-rose-600">{error}</p> : null}
    </div>
  );
}
