'use client';

import { useState, useTransition } from 'react';

import type { IosThesis } from '@/lib/ios/db';
import { PRIMARY_STRATEGIES, PRIORITY, THESIS_SCOPES, THESIS_STATUS } from '@/lib/ios/lists';
import { saveIosThesis } from '../actions';

/**
 * Edit one thesis, folded away until asked for.
 *
 * A thesis is the most alive row in their library: it is proposed, validated,
 * prioritised and eventually retired, and all four of those are a person's
 * judgement, not a fact from a spreadsheet. Seeding it from their Excel and then
 * making it read-only froze the judgement at the day the file was sent.
 *
 * The code is not a field. It is the natural key `scripts/ios-seed.ts` matches
 * on, so renaming it here would make the next load insert a second copy instead
 * of updating this one. The subsectors are not a field either: that N:N is
 * rebuilt from their `Industries` column on every seeding run, so an edit here
 * would be silently undone, which is worse than not offering it.
 */
export default function ThesisEditor({ thesis }: { thesis: IosThesis }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save(form: FormData) {
    const text = (k: string) => String(form.get(k) ?? '');
    start(async () => {
      const result = await saveIosThesis({
        id: thesis.id,
        name: text('name'),
        scope: text('scope'),
        status: text('status'),
        priority: text('priority'),
        primary_strategy: text('primary_strategy'),
        category: text('category'),
        structural_driver: text('structural_driver'),
        description: text('description'),
        value_creation_levers: text('value_creation_levers'),
        ideal_target_profile: text('ideal_target_profile'),
        key_screening_risks: text('key_screening_risks'),
        mandate_fit: text('mandate_fit'),
        geographic_focus: text('geographic_focus'),
        target_ebitda_eur_m: text('target_ebitda_eur_m'),
        target_revenue_eur_m: text('target_revenue_eur_m'),
        evidence_status: text('evidence_status'),
      });
      setMessage(result.message);
      if (result.ok) setOpen(false);
    });
  }

  const field =
    'rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';

  if (!open) {
    return (
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-ink-soft hover:border-strong"
        >
          Editar
        </button>
        {message ? <span className="text-[11px] text-ink-faint">{message}</span> : null}
      </div>
    );
  }

  return (
    <form action={save} className="mt-3 space-y-3 border-t border-border pt-3">
      <label className="block">
        <span className="block text-[11px] text-ink-faint">Nombre</span>
        <input name="name" defaultValue={thesis.name} className={`${field} mt-0.5 w-full`} />
      </label>

      <div className="grid gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="block text-[11px] text-ink-faint">Ámbito</span>
          <select name="scope" defaultValue={thesis.scope} className={`${field} mt-0.5 w-full`}>
            {THESIS_SCOPES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] text-ink-faint">Estado</span>
          <select name="status" defaultValue={thesis.status} className={`${field} mt-0.5 w-full`}>
            {THESIS_STATUS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] text-ink-faint">Prioridad</span>
          <select
            name="priority"
            defaultValue={thesis.priority ?? ''}
            className={`${field} mt-0.5 w-full`}
          >
            <option value="">sin prioridad</option>
            {PRIORITY.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] text-ink-faint">Estrategia principal</span>
          <select
            name="primary_strategy"
            defaultValue={thesis.primary_strategy ?? ''}
            className={`${field} mt-0.5 w-full`}
          >
            <option value="">sin estrategia</option>
            {PRIMARY_STRATEGIES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="block text-[11px] text-ink-faint">Driver estructural</span>
          <textarea
            name="structural_driver"
            rows={2}
            defaultValue={thesis.structural_driver ?? ''}
            className={`${field} mt-0.5 w-full`}
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-ink-faint">Descripción</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={thesis.description ?? ''}
            className={`${field} mt-0.5 w-full`}
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-ink-faint">
            Palancas de creación de valor, una por línea
          </span>
          <textarea
            name="value_creation_levers"
            rows={3}
            defaultValue={thesis.value_creation_levers.join('\n')}
            className={`${field} mt-0.5 w-full`}
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-ink-faint">Perfil objetivo ideal</span>
          <textarea
            name="ideal_target_profile"
            rows={3}
            defaultValue={thesis.ideal_target_profile ?? ''}
            className={`${field} mt-0.5 w-full`}
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-ink-faint">Riesgos de cribado</span>
          <textarea
            name="key_screening_risks"
            rows={2}
            defaultValue={thesis.key_screening_risks ?? ''}
            className={`${field} mt-0.5 w-full`}
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-ink-faint">Evidencia</span>
          <textarea
            name="evidence_status"
            rows={2}
            defaultValue={thesis.evidence_status ?? ''}
            className={`${field} mt-0.5 w-full`}
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {(
          [
            ['category', 'Categoría', thesis.category],
            ['mandate_fit', 'Encaje con el mandato', thesis.mandate_fit],
            ['geographic_focus', 'Foco geográfico', thesis.geographic_focus],
            ['target_ebitda_eur_m', 'EBITDA objetivo M€', thesis.target_ebitda_eur_m],
            ['target_revenue_eur_m', 'Ventas objetivo M€', thesis.target_revenue_eur_m],
          ] as const
        ).map(([name, label, value]) => (
          <label key={name} className="block">
            <span className="block text-[11px] text-ink-faint">{label}</span>
            <input
              name={name}
              defaultValue={value ?? ''}
              className={`${field} mt-0.5 w-full`}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-strong"
        >
          Cancelar
        </button>
        <span className="text-[11px] text-ink-faint">
          El código y los subsectores no se editan: se recargan desde su Excel.
        </span>
        {message ? <span className="text-[11px] text-rose-700">{message}</span> : null}
      </div>
    </form>
  );
}
