'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { STAKEHOLDER_KINDS, createStakeholder } from '../actions';

const field = 'w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';

export default function NewStakeholderForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());

    startTransition(async () => {
      const res = await createStakeholder({
        full_name: String(raw.full_name ?? '').trim(),
        kind: String(raw.kind || 'Other'),
        org: raw.org ? String(raw.org) : null,
        email: raw.email ? String(raw.email) : null,
        phone: raw.phone ? String(raw.phone) : null,
        linkedin: raw.linkedin ? String(raw.linkedin) : null,
        city: raw.city ? String(raw.city) : null,
        notes: raw.notes ? String(raw.notes) : null,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
      >
        + Nuevo contacto
      </button>
    );
  }

  return (
    <div className="w-full max-w-xl rounded-lg border border-border bg-bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Nuevo contacto</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-mute hover:text-ink">
          Cancelar
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="full_name">Nombre *</label>
            <input id="full_name" name="full_name" required minLength={2} className={field} placeholder="Joan Riera" />
          </div>
          <div>
            <label className={label} htmlFor="kind">Tipo</label>
            <select id="kind" name="kind" className={field} defaultValue="Owner">
              {STAKEHOLDER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="org">Organización</label>
            <input id="org" name="org" className={field} placeholder="Riera Advisors" />
          </div>
          <div>
            <label className={label} htmlFor="city">Ciudad</label>
            <input id="city" name="city" className={field} placeholder="Barcelona" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={label} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="phone">Teléfono</label>
            <input id="phone" name="phone" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="linkedin">LinkedIn</label>
            <input id="linkedin" name="linkedin" className={field} />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="notes">Notas</label>
          <textarea id="notes" name="notes" rows={2} className={field} />
        </div>

        {error ? <p className="text-xs text-rose-600">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  );
}
