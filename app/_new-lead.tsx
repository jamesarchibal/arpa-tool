'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createLead } from './actions';

interface TaxonomyOption {
  id: number;
  sector: string;
  category: string;
  subsector: string;
}

const OWNERSHIP = [
  'Founder-owned',
  'Family-owned',
  'Private equity',
  'Corporate subsidiary',
  'Public',
  'Unknown',
] as const;

const field = 'w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';

export default function NewLeadForm({ taxonomy }: { taxonomy: TaxonomyOption[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // group the 20 subsectors under "Sector · Category", as in the blueprint
  const groups = taxonomy.reduce<Record<string, TaxonomyOption[]>>((acc, t) => {
    const key = `${t.sector} · ${t.category}`;
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries());

    const payload = {
      name: raw.name ? String(raw.name).trim() : null,
      legal_name: String(raw.legal_name ?? '').trim(),
      cif: raw.cif ? String(raw.cif).trim().toUpperCase() : null,
      country: String(raw.country || 'ES').toUpperCase(),
      region: raw.region ? String(raw.region) : null,
      taxonomy_id: raw.taxonomy_id ? Number(raw.taxonomy_id) : null,
      taxonomy_fit: String(raw.taxonomy_fit || 'in'),
      ownership_type: raw.ownership_type ? String(raw.ownership_type) : null,
      admin_since: raw.admin_since ? Number(raw.admin_since) : null,
      owner: raw.owner ? String(raw.owner) : null,
      source: raw.source ? String(raw.source) : null,
    };

    startTransition(async () => {
      const res = await createLead(payload);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOpen(false);
      if (res.projectId) router.push(`/${res.projectId}`);
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
      >
        + Nuevo proyecto
      </button>
    );
  }

  return (
    <div className="w-full max-w-xl rounded-lg border border-border bg-bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Nuevo proyecto</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-mute hover:text-ink">
          Cancelar
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className={label} htmlFor="name">Nombre del proyecto</label>
          <input id="name" name="name" maxLength={240} className={field} placeholder="Proyecto Segura" />
          <p className="mt-1 text-[11px] text-ink-faint">
            Opcional. Si lo dejas vacío el proyecto se llama como la empresa.
          </p>
        </div>

        <div>
          <label className={label} htmlFor="legal_name">Razón social *</label>
          <input id="legal_name" name="legal_name" required minLength={2} className={field} placeholder="Conservas del Segura, S.L." />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={label} htmlFor="cif">CIF</label>
            <input id="cif" name="cif" className={field} placeholder="B73000001" />
          </div>
          <div>
            <label className={label} htmlFor="country">País</label>
            <input id="country" name="country" defaultValue="ES" maxLength={2} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="region">Provincia</label>
            <input id="region" name="region" className={field} placeholder="Murcia" />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="taxonomy_id">Subsector (Industry_Taxonomy)</label>
          <select id="taxonomy_id" name="taxonomy_id" className={field} defaultValue="">
            <option value="">Sin clasificar</option>
            {Object.entries(groups).map(([g, items]) => (
              <optgroup key={g} label={g}>
                {items.map((t) => (
                  <option key={t.id} value={t.id}>{t.subsector}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="taxonomy_fit">Encaje de mandato</label>
            <select id="taxonomy_fit" name="taxonomy_fit" className={field} defaultValue="in">
              <option value="in">Dentro de la taxonomía</option>
              <option value="adjacent">Adyacente</option>
              <option value="out">Fuera</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ownership_type">Ownership Type</label>
            <select id="ownership_type" name="ownership_type" className={field} defaultValue="">
              <option value="">Sin determinar</option>
              {OWNERSHIP.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={label} htmlFor="admin_since">Administrador desde</label>
            <input id="admin_since" name="admin_since" type="number" min={1900} max={2100} className={field} placeholder="1989" />
          </div>
          <div>
            <label className={label} htmlFor="owner">Responsable</label>
            <input id="owner" name="owner" className={field} placeholder="Marc" />
          </div>
          <div>
            <label className={label} htmlFor="source">Origen</label>
            <input id="source" name="source" className={field} placeholder="Contacto directo" />
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-ink-faint">
          &ldquo;Administrador desde&rdquo; es el año del primer nombramiento. Es el sustituto gratuito de la edad
          del propietario y la señal de sucesión más útil que hay. Sale del BORME.
        </p>

        {error ? <p className="text-xs text-rose-600">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? 'Creando…' : 'Crear y abrir'}
        </button>
      </form>
    </div>
  );
}
