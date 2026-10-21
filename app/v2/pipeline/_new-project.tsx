'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createIosProject } from '../actions';

/**
 * A new deal. Always lands at Screening with a QSS at Not Started, because that
 * is the only door their funnel has, so the form has no stage field.
 */
export default function NewProject({
  theses,
  companies,
}: {
  theses: { id: string; code: string; name: string }[];
  companies: { id: string; name: string; subsector: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(form: FormData) {
    start(async () => {
      const result = await createIosProject({
        name: String(form.get('name') ?? ''),
        owner: String(form.get('owner') ?? ''),
        thesis_id: String(form.get('thesis_id') ?? '') || null,
        company_id: String(form.get('company_id') ?? '') || null,
        priority: (String(form.get('priority') ?? '') || null) as 'High' | null,
      });
      setMessage(result.message);
      if (result.ok && result.projectId) {
        setOpen(false);
        router.push(`/v2/pipeline/${result.projectId}`);
      }
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Nuevo proyecto
        </button>
        {message ? <span className="text-xs text-ink-faint">{message}</span> : null}
      </div>
    );
  }

  return (
    <form
      action={submit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-bg-card px-3 py-2.5"
    >
      <label className="flex flex-col gap-1 text-[11px] text-ink-mute">
        Nombre
        <input
          name="name"
          required
          minLength={2}
          autoFocus
          className="w-56 rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink-mute">
        Responsable
        <input
          name="owner"
          className="w-36 rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink-mute">
        Tesis principal
        <select
          name="thesis_id"
          className="w-64 rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        >
          <option value="">Sin tesis (el gate de Screening la exige)</option>
          {theses.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} · {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink-mute">
        Empresa de la long list
        <select
          name="company_id"
          className="w-56 rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        >
          <option value="">Ninguna</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.subsector ? ` · ${c.subsector}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-ink-mute">
        Prioridad
        <select
          name="priority"
          className="rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        >
          <option value="">—</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Creando…' : 'Crear en Screening'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md border border-border px-3 py-1.5 text-xs text-ink-mute hover:text-ink"
      >
        Cancelar
      </button>
      {message ? <span className="text-xs text-rose-600">{message}</span> : null}
    </form>
  );
}
