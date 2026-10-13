'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { completeNextStep, logInteraction } from '../actions';
import type { AgendaItem } from '@/lib/arpa/db';

const field =
  'w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';

/**
 * The agenda: every open next step, soonest first.
 *
 * Ordered by due date and not by person on purpose. The question this answers is
 * "what do I owe today", which is a question about time. Who it is owed to is
 * shown on the line but does not drive the sort.
 */
export default function Agenda({
  items,
  people,
}: {
  items: AgendaItem[];
  people: { id: string; full_name: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const overdue = items.filter((i) => i.overdue).length;

  function done(id: string, projectId: string | null) {
    startTransition(async () => {
      const res = await completeNextStep({ id, project_id: projectId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());

    startTransition(async () => {
      const res = await logInteraction({
        kind: String(raw.kind || 'Note'),
        stakeholder_id: raw.stakeholder_id ? String(raw.stakeholder_id) : null,
        summary: raw.summary ? String(raw.summary) : null,
        next_step: String(raw.next_step ?? '').trim(),
        next_step_due: raw.next_step_due ? String(raw.next_step_due) : null,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-border bg-bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Agenda</h2>
          <p className="text-[11px] text-ink-mute">
            Siguientes pasos abiertos, lo más urgente arriba.
            {overdue > 0 ? ` ${overdue} vencido${overdue === 1 ? '' : 's'}.` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded border border-border px-3 py-1.5 text-xs text-ink-mute transition hover:bg-bg-elevated hover:text-ink"
        >
          {adding ? 'Cancelar' : '+ Apuntar un paso'}
        </button>
      </div>

      {adding ? (
        <form onSubmit={add} className="space-y-3 border-b border-border px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="ag_next_step">
                Siguiente paso *
              </label>
              <input
                id="ag_next_step"
                name="next_step"
                required
                className={field}
                placeholder="Llamar a Joan para pedir las cuentas de 2025"
              />
            </div>
            <div>
              <label className={label} htmlFor="ag_due">
                Para cuándo
              </label>
              <input id="ag_due" name="next_step_due" type="date" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="ag_person">
                Persona
              </label>
              <select id="ag_person" name="stakeholder_id" className={field} defaultValue="">
                <option value="">(ninguna)</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <input type="hidden" name="kind" value="Note" />
          <div>
            <label className={label} htmlFor="ag_summary">
              Contexto
            </label>
            <input
              id="ag_summary"
              name="summary"
              className={field}
              placeholder="De qué viene este paso"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            {pending ? 'Guardando…' : 'Apuntar'}
          </button>
        </form>
      ) : null}

      {error ? <p className="px-4 py-2 text-xs text-rose-600">{error}</p> : null}

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-mute">
          Nada pendiente. Los siguientes pasos salen de las interacciones, así que apunta uno al
          registrar una llamada o una reunión.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-3 px-4 py-2.5">
              <button
                type="button"
                onClick={() => done(i.id, i.project_id)}
                disabled={pending}
                title="Marcar como hecho"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border transition hover:border-brand hover:bg-brand-wash disabled:opacity-40"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink">{i.next_step}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                  {i.stakeholder_name ? <span className="text-ink-mute">{i.stakeholder_name}</span> : null}
                  {i.company_name ? <span>{i.company_name}</span> : null}
                  {i.summary ? <span className="truncate">{i.summary}</span> : null}
                </div>
              </div>
              <span
                className={`shrink-0 whitespace-nowrap text-[11px] tabular-nums ${
                  i.overdue ? 'font-semibold text-rose-600' : 'text-ink-mute'
                }`}
              >
                {i.next_step_due ?? 'sin fecha'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
