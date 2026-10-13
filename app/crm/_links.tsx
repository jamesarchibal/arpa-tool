'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { StakeholderLink } from '@/lib/arpa/db';
import { linkStakeholder, unlinkStakeholder } from '../actions';

export interface LinkTarget {
  company_id: string;
  project_id: string | null;
  legal_name: string;
  /** The project's stage, or null when the company has no project at all. */
  stage: string | null;
}

const btn = 'rounded border px-2 py-0.5 text-[11px] transition disabled:opacity-40';

export default function Links({
  stakeholderId,
  links,
  targets,
}: {
  stakeholderId: string;
  links: StakeholderLink[];
  targets: LinkTarget[];
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; message: string }>, done?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.message);
        return;
      }
      done?.();
      router.refresh();
    });
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const target = targets.find((t) => t.company_id === String(raw.company_id));
    if (!target) {
      setError('Elige una empresa');
      return;
    }
    run(
      () =>
        linkStakeholder({
          stakeholder_id: stakeholderId,
          company_id: target.company_id,
          // Link to the project too when the company has one, so the contact
          // shows up on the deal page and not only on the company.
          project_id: target.project_id,
          role: raw.role ? String(raw.role) : null,
        }),
      () => setAdding(false),
    );
  }

  return (
    <div className="space-y-1">
      {links.length === 0 && !adding ? (
        <span className="text-[11px] text-ink-faint">sin vincular</span>
      ) : null}

      {links.map((l) => (
        <div key={l.id} className="flex items-center gap-1.5">
          {l.project_id_for_link ? (
            <Link href={`/${l.project_id_for_link}`} className="text-[11px] text-brand hover:underline">
              {l.company_name ?? 'proyecto'}
            </Link>
          ) : (
            <span className="text-[11px] text-ink-soft">{l.company_name ?? '—'}</span>
          )}
          {l.role ? <span className="text-[10px] text-ink-mute">({l.role})</span> : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unlinkStakeholder({ id: l.id }))}
            className="text-[10px] text-ink-faint hover:text-rose-600 disabled:opacity-40"
            title="Quitar el vínculo"
          >
            ×
          </button>
        </div>
      ))}

      {adding ? (
        <form onSubmit={onAdd} className="flex flex-wrap items-center gap-1">
          <select
            name="company_id"
            defaultValue=""
            required
            className="max-w-[180px] rounded border border-border bg-bg px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-brand"
          >
            <option value="">Empresa…</option>
            {targets.map((t) => (
              <option key={t.company_id} value={t.company_id}>{t.legal_name}</option>
            ))}
          </select>
          <input
            name="role"
            placeholder="Rol"
            className="w-[88px] rounded border border-border bg-bg px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-brand"
          />
          <button type="submit" disabled={pending} className={`${btn} border-emerald-200 bg-emerald-50 text-emerald-700`}>
            vincular
          </button>
          <button type="button" onClick={() => setAdding(false)} className={`${btn} border-border text-ink-mute`}>
            cancelar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[10px] text-ink-mute hover:text-brand"
        >
          + vincular
        </button>
      )}

      {error ? <span className="block text-[10px] text-rose-600">{error}</span> : null}
    </div>
  );
}
