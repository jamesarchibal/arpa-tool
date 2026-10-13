'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { STAKEHOLDER_KINDS } from '@/lib/arpa/lists';
import { createInboundDeal } from './actions';

const field = 'w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';

/** The kinds that actually send infomemos, first. The rest are still reachable. */
const SENDER_KINDS = ['Intermediary', 'Banker', 'Broker', 'Advisor', 'Lawyer', 'Accountant'] as const;

export default function InboundForm({
  themes,
  industries,
}: {
  themes: { id: number; name: string }[];
  industries: { id: number; sector: string; category: string; subsector: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const groups = industries.reduce<Record<string, typeof industries>>((acc, t) => {
    const key = `${t.sector} · ${t.category}`;
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  const others = STAKEHOLDER_KINDS.filter(
    (k) => !(SENDER_KINDS as readonly string[]).includes(k),
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());

    startTransition(async () => {
      const res = await createInboundDeal({
        legal_name: String(raw.legal_name ?? '').trim(),
        cif: raw.cif ? String(raw.cif) : null,
        region: raw.region ? String(raw.region) : null,
        taxonomy_id: raw.taxonomy_id ? Number(raw.taxonomy_id) : null,
        theme_id: raw.theme_id ? Number(raw.theme_id) : null,
        sender_name: String(raw.sender_name ?? '').trim(),
        sender_org: raw.sender_org ? String(raw.sender_org) : null,
        sender_email: raw.sender_email ? String(raw.sender_email) : null,
        sender_kind: raw.sender_kind ? String(raw.sender_kind) : 'Intermediary',
        doc_title: String(raw.doc_title ?? '').trim(),
        received_on: raw.received_on ? String(raw.received_on) : null,
        note: raw.note ? String(raw.note) : null,
        owner: raw.owner ? String(raw.owner) : null,
      });

      if (!res.ok) {
        setError(res.message);
        return;
      }
      if (res.projectId) router.push(`/${res.projectId}`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-bg-card p-5">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Llega un infomemo</h2>
        <p className="max-w-2xl text-xs leading-relaxed text-ink-mute">
          Un asesor manda una empresa. Este formulario escribe de una vez la empresa, el proyecto en
          Screening, quién lo mandó, el documento y la fecha en que llegó. El remitente se guarda en
          Contactos, así que la próxima vez que mande algo ya está ahí.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="legal_name">
            Razón social *
          </label>
          <input
            id="legal_name"
            name="legal_name"
            required
            minLength={2}
            className={field}
            placeholder="Conservas del Segura, S.L."
          />
        </div>
        <div>
          <label className={label} htmlFor="cif">
            CIF
          </label>
          <input id="cif" name="cif" className={field} placeholder="B73000001" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="region">
            Provincia
          </label>
          <input id="region" name="region" className={field} placeholder="Murcia" />
        </div>
        <div>
          <label className={label} htmlFor="theme_id">
            Temática
          </label>
          <select id="theme_id" name="theme_id" defaultValue="" className={field}>
            <option value="">Por decidir</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="taxonomy_id">
            Industria
          </label>
          <select id="taxonomy_id" name="taxonomy_id" defaultValue="" className={field}>
            <option value="">Sin clasificar</option>
            {Object.entries(groups).map(([g, items]) => (
              <optgroup key={g} label={g}>
                {items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.subsector}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={label} htmlFor="sender_name">
            Lo manda *
          </label>
          <input
            id="sender_name"
            name="sender_name"
            required
            minLength={2}
            className={field}
            placeholder="Josep Verdegí"
          />
        </div>
        <div>
          <label className={label} htmlFor="sender_org">
            Firma
          </label>
          <input id="sender_org" name="sender_org" className={field} placeholder="Verdegí Corporate Finance" />
        </div>
        <div>
          <label className={label} htmlFor="sender_email">
            Email
          </label>
          <input id="sender_email" name="sender_email" type="email" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="sender_kind">
            Qué es
          </label>
          <select id="sender_kind" name="sender_kind" defaultValue="Intermediary" className={field}>
            {SENDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
            <optgroup label="Otros">
              {others.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="doc_title">
            Documento *
          </label>
          <input
            id="doc_title"
            name="doc_title"
            required
            minLength={2}
            className={field}
            placeholder="Infomemo Conservas del Segura.pdf"
          />
        </div>
        <div>
          <label className={label} htmlFor="received_on">
            Llegó el
          </label>
          <input id="received_on" name="received_on" type="date" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="owner">
            Responsable
          </label>
          <input id="owner" name="owner" className={field} placeholder="Marc" />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="note">
          Qué dijo
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          className={field}
          placeholder="Nos lo pasa en exclusiva dos semanas. Pide una respuesta antes de fin de mes."
        />
      </div>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        El documento se guarda como nombre de archivo, no como enlace: el fichero sigue en su correo
        o en SharePoint, y un enlace que no podemos resolver sería un enlace roto en pantalla.
      </p>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? 'Registrando…' : 'Registrar y abrir el deal'}
      </button>
    </form>
  );
}
