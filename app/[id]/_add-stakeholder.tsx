'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { addProjectStakeholder, unlinkStakeholder } from '../actions';
import { STAKEHOLDER_KINDS } from '@/lib/arpa/lists';

const field =
  'w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';

/** Create a person and attach them to this project without leaving the deal. */
export function AddStakeholderForm({ projectId, owner }: { projectId: string; owner: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());

    startTransition(async () => {
      const res = await addProjectStakeholder({
        project_id: projectId,
        full_name: String(raw.full_name ?? '').trim(),
        kind: String(raw.kind || 'Other'),
        role: raw.role ? String(raw.role) : null,
        org: raw.org ? String(raw.org) : null,
        email: raw.email ? String(raw.email) : null,
        phone: raw.phone ? String(raw.phone) : null,
        linkedin: null,
        city: null,
        notes: raw.notes ? String(raw.notes) : null,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      form.reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-border px-2.5 py-1 text-xs text-ink-soft transition hover:border-brand hover:text-ink"
      >
        + Añadir persona
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border border-border bg-bg p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="sh_name">Nombre *</label>
          <input id="sh_name" name="full_name" required minLength={2} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="sh_kind">Tipo</label>
          <select id="sh_kind" name="kind" className={field} defaultValue="Owner">
            {STAKEHOLDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="sh_role">Papel en esta operación</label>
          <input id="sh_role" name="role" className={field} placeholder="Vendedor, asesor del vendedor…" />
        </div>
        <div>
          <label className={label} htmlFor="sh_org">Organización</label>
          <input id="sh_org" name="org" className={field} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="sh_email">Email</label>
          <input id="sh_email" name="email" type="email" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="sh_phone">Teléfono</label>
          <input id="sh_phone" name="phone" className={field} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="sh_notes">Notas</label>
        <textarea id="sh_notes" name="notes" rows={2} className={field} />
      </div>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-mute transition hover:text-ink"
        >
          Cancelar
        </button>
        <span className="text-[10px] text-ink-faint">Se guarda como {owner}</span>
      </div>
    </form>
  );
}

/**
 * Detaches a person from this deal. It does NOT delete the person, because they
 * may well be on the next deal: the link is what is wrong, not the contact.
 */
export function UnlinkButton({ linkId, projectId }: { linkId: string; projectId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        title="Quita a esta persona de la operación. El contacto se mantiene en Contactos."
        onClick={() =>
          startTransition(async () => {
            const res = await unlinkStakeholder({ id: linkId, project_id: projectId });
            if (!res.ok) setError(res.message);
            else router.refresh();
          })
        }
        className="text-[10px] text-ink-faint transition hover:text-rose-600 disabled:opacity-40"
      >
        quitar
      </button>
      {error ? <span className="ml-1 text-[10px] text-rose-600">{error}</span> : null}
    </>
  );
}
