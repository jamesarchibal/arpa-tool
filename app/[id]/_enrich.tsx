'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { enrichCompany } from '../actions';
import { ENRICH_SOURCES, OWNERSHIP_TYPES } from '@/lib/arpa/lists';
import type { CompanyRecord } from '@/lib/arpa/db';

const field =
  'w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';

const OWNERSHIP_LABEL: Record<string, string> = {
  'Founder-owned': 'Fundador',
  'Family-owned': 'Familiar',
  'Private equity': 'Private equity',
  'Corporate subsidiary': 'Filial de grupo',
  Public: 'Cotizada',
  Unknown: 'Sin determinar',
};

/**
 * The ficha editor. Typed by hand today because there is no SABI API seat, but
 * it posts to the same `enrichCompany` action an integration would call, so the
 * manual and the automatic path cannot drift apart.
 */
export default function EnrichForm({
  company,
  projectId,
  taxonomy,
  owner,
}: {
  company: CompanyRecord;
  projectId: string;
  taxonomy: { id: number; subsector: string }[];
  owner: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());

    startTransition(async () => {
      const res = await enrichCompany({
        company_id: company.id,
        project_id: projectId,
        trade_name: raw.trade_name ? String(raw.trade_name) : null,
        cif: raw.cif ? String(raw.cif) : null,
        website: raw.website ? String(raw.website) : null,
        city: raw.city ? String(raw.city) : null,
        region: raw.region ? String(raw.region) : null,
        cnae: raw.cnae ? String(raw.cnae) : null,
        employees: raw.employees ? String(raw.employees) : null,
        founded_year: raw.founded_year ? String(raw.founded_year) : null,
        admin_since: raw.admin_since ? String(raw.admin_since) : null,
        taxonomy_id: raw.taxonomy_id ? String(raw.taxonomy_id) : null,
        ownership_type: raw.ownership_type ? String(raw.ownership_type) : null,
        enrich_source: String(raw.enrich_source || 'manual'),
        enriched_by: owner,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="cif">CIF</label>
          <input id="cif" name="cif" defaultValue={company.cif ?? ''} className={field} placeholder="B12345678" />
        </div>
        <div>
          <label className={label} htmlFor="trade_name">Nombre comercial</label>
          <input id="trade_name" name="trade_name" defaultValue={company.trade_name ?? ''} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="website">Web</label>
          <input id="website" name="website" defaultValue={company.website ?? ''} className={field} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={label} htmlFor="city">Ciudad</label>
          <input id="city" name="city" defaultValue={company.city ?? ''} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="region">Provincia</label>
          <input id="region" name="region" defaultValue={company.region ?? ''} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="cnae">CNAE</label>
          <input id="cnae" name="cnae" defaultValue={company.cnae ?? ''} className={field} placeholder="2561" />
        </div>
        <div>
          <label className={label} htmlFor="employees">Empleados</label>
          <input
            id="employees"
            name="employees"
            type="number"
            min={0}
            defaultValue={company.employees ?? ''}
            className={field}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={label} htmlFor="founded_year">Año fundación</label>
          <input
            id="founded_year"
            name="founded_year"
            type="number"
            min={1800}
            max={2100}
            defaultValue={company.founded_year ?? ''}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="admin_since">Administrador desde</label>
          <input
            id="admin_since"
            name="admin_since"
            type="number"
            min={1800}
            max={2100}
            defaultValue={company.admin_since ?? ''}
            className={field}
          />
          <p className="mt-0.5 text-[10px] text-ink-faint">Proxy gratuito de la edad del dueño.</p>
        </div>
        <div>
          <label className={label} htmlFor="ownership_type">Propiedad</label>
          <select
            id="ownership_type"
            name="ownership_type"
            defaultValue={company.ownership_type ?? 'Unknown'}
            className={field}
          >
            {OWNERSHIP_TYPES.map((o) => (
              <option key={o} value={o}>
                {OWNERSHIP_LABEL[o] ?? o}
              </option>
            ))}
          </select>
          <p className="mt-0.5 text-[10px] text-ink-faint">Pesa un 15% en el QSS.</p>
        </div>
        <div>
          <label className={label} htmlFor="taxonomy_id">Subsector</label>
          <select id="taxonomy_id" name="taxonomy_id" defaultValue={company.taxonomy_id ?? ''} className={field}>
            <option value="">Sin asignar</option>
            {taxonomy.map((t) => (
              <option key={t.id} value={t.id}>
                {t.subsector}
              </option>
            ))}
          </select>
          <p className="mt-0.5 text-[10px] text-ink-faint">Sin esto el encaje sectorial no puntúa.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <div className="w-44">
          <label className={label} htmlFor="enrich_source">Origen del dato</label>
          <select
            id="enrich_source"
            name="enrich_source"
            defaultValue={company.enrich_source ?? 'SABI'}
            className={field}
          >
            {ENRICH_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Guardar ficha'}
        </button>
        {saved ? <span className="text-xs text-emerald-600">Guardado</span> : null}
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </div>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Se registra de dónde viene el dato. Si la licencia de SABI no permite almacenarlo en un
        sistema propio, se puede localizar y borrar exactamente lo que vino de ahí. Las cifras
        (facturación, EBITDA, deuda) no están aquí: viven en el proyecto y se editan en Scoring.
      </p>
    </form>
  );
}
