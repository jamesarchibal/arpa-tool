'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { promoteOrigination, setOriginationStatus } from './actions';
import SabiButton from './_sabi-button';

const btn = 'rounded border px-2 py-0.5 text-[11px] transition disabled:opacity-40';

export default function RowActions({
  regKey,
  status,
  projectId,
  legalName,
  hoja,
  province,
  sabiUrl,
}: {
  regKey: string;
  status: string;
  projectId: string | null;
  legalName: string;
  hoja: string | null;
  province: string;
  sabiUrl: string;
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

  // Already promoted. SABI stays available, because the financials usually get
  // checked after the project exists, not before.
  if (projectId) {
    return (
      <div className="flex items-center gap-2">
        <Link href={`/${projectId}`} className="text-[11px] text-brand hover:underline">
          ver proyecto
        </Link>
        <SabiButton legalName={legalName} hoja={hoja} province={province} sabiUrl={sabiUrl} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-1">
        <SabiButton legalName={legalName} hoja={hoja} province={province} sabiUrl={sabiUrl} />
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
