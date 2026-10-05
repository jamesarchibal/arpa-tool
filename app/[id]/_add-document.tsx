'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { addDocument } from '../actions';
import { DOC_TYPES } from '@/lib/arpa/lists';

const field =
  'w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';

/** Spanish labels over the database's English values, which stay authoritative. */
const DOC_LABEL: Record<string, string> = {
  Teaser: 'Teaser',
  NDA: 'NDA',
  'Info memo': 'Info memo',
  'Annual accounts': 'Cuentas anuales',
  'XBRL deposit': 'Depósito XBRL',
  'Management accounts': 'Cuentas de gestión',
  Valuation: 'Valoración',
  LOI: 'LOI',
  Report: 'Informe',
  Other: 'Otro',
};

export default function AddDocumentForm({
  projectId,
  companyId,
  owner,
}: {
  projectId: string;
  companyId: string;
  owner: string;
}) {
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
      const res = await addDocument({
        project_id: projectId,
        // Annual accounts belong to the company and survive the deal, so they
        // are filed against both and stay visible if the deal is reopened.
        company_id: raw.doc_type === 'Annual accounts' ? companyId : null,
        title: String(raw.title ?? '').trim(),
        doc_type: String(raw.doc_type || 'Other'),
        external_url: String(raw.external_url ?? '').trim(),
        period: raw.period ? String(raw.period) : null,
        uploaded_by: owner,
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
        + Registrar documento
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border border-border bg-bg p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="doc_title">Título *</label>
          <input id="doc_title" name="title" required minLength={2} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="doc_type">Tipo</label>
          <select id="doc_type" name="doc_type" className={field} defaultValue="Other">
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOC_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="doc_url">Enlace *</label>
          <input
            id="doc_url"
            name="external_url"
            type="url"
            required
            className={field}
            placeholder="https://drive.google.com/…"
          />
        </div>
        <div>
          <label className={label} htmlFor="doc_period">Periodo</label>
          <input id="doc_period" name="period" className={field} placeholder="FY2025" />
        </div>
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
      </div>

      <p className="text-[11px] text-ink-faint">
        Se guarda el enlace, no el archivo. El original se queda donde el equipo ya lo edita y
        versiona, para no acabar con dos copias que se separan.
      </p>
    </form>
  );
}
