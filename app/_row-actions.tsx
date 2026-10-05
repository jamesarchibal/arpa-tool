'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { promoteOrigination, setOriginationStatus } from './actions';

const btn = 'rounded border px-2 py-0.5 text-[11px] transition disabled:opacity-40';

export default function RowActions({
  regKey,
  status,
  projectId,
}: {
  regKey: string;
  status: string;
  projectId: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

  if (projectId) {
    return (
      <Link href={`/${projectId}`} className="text-[11px] text-brand hover:underline">
        ver proyecto
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setOriginationStatus({ reg_key: regKey, status: status === 'shortlisted' ? 'new' : 'shortlisted' }))}
          className={`${btn} ${
            status === 'shortlisted'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-border text-ink-mute hover:text-ink'
          }`}
        >
          {status === 'shortlisted' ? 'en lista' : 'lista'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setOriginationStatus({ reg_key: regKey, status: status === 'discarded' ? 'new' : 'discarded' }))}
          className={`${btn} ${
            status === 'discarded'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-border text-ink-mute hover:text-ink'
          }`}
        >
          {status === 'discarded' ? 'descartada' : 'descartar'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => promoteOrigination({ reg_key: regKey }))}
          className={`${btn} border-emerald-200 bg-emerald-50 text-emerald-700`}
          title="Crea la empresa y su proyecto en el pipeline"
        >
          al pipeline
        </button>
      </div>
      {error ? <span className="text-[10px] text-rose-600">{error}</span> : null}
    </div>
  );
}
