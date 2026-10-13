'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { logInteraction, updateStakeholder } from '../actions';
import { INTERACTION_KINDS } from '@/lib/arpa/lists';
import type { StakeholderRow } from '@/lib/arpa/db';

const field =
  'w-full rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';
const label = 'mb-1 block text-[11px] uppercase tracking-wider text-ink-mute';

/** Marc's three questions only make sense for the people who write cheques. */
const INVESTOR_KINDS = new Set(['Investor', 'LP', 'Co-investor', 'Lender']);

const ticket = (min: number | null, max: number | null) => {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min}-${max} M€`;
  return min !== null ? `desde ${min} M€` : `hasta ${max} M€`;
};

/**
 * The per-person detail, folded away until asked for.
 *
 * It is one panel with both the profile and the log form rather than a separate
 * page per person, because the thing that actually gets skipped is writing down
 * the call, and a page transition is enough friction to skip it.
 */
export default function PersonPanel({ person }: { person: StakeholderRow }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isInvestor = INVESTOR_KINDS.has(person.kind);
  const t = ticket(person.ticket_min, person.ticket_max);

  function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());

    startTransition(async () => {
      const res = await updateStakeholder({
        id: person.id,
        invest_thesis: raw.invest_thesis ? String(raw.invest_thesis) : null,
        sectors_in: raw.sectors_in ? String(raw.sectors_in) : null,
        sectors_out: raw.sectors_out ? String(raw.sectors_out) : null,
        ticket_min: raw.ticket_min ? String(raw.ticket_min) : null,
        ticket_max: raw.ticket_max ? String(raw.ticket_max) : null,
        notes: raw.notes ? String(raw.notes) : null,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setSaved('Guardado');
      router.refresh();
    });
  }

  function log(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());

    startTransition(async () => {
      const res = await logInteraction({
        kind: String(raw.kind || 'Note'),
        stakeholder_id: person.id,
        happened_at: raw.happened_at ? String(raw.happened_at) : null,
        summary: raw.summary ? String(raw.summary) : null,
        next_step: raw.next_step ? String(raw.next_step) : null,
        next_step_due: raw.next_step_due ? String(raw.next_step_due) : null,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      form.reset();
      setSaved('Registrado');
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-border px-2 py-1 text-[11px] text-ink-mute transition hover:bg-bg-elevated hover:text-ink"
        >
          Ficha
        </button>
        {/* The summary stays visible when folded, because "can this investor
            fund a 4 M€ cheque" is the question asked while scanning the list. */}
        {t ? <div className="text-[11px] tabular-nums text-ink-soft">{t}</div> : null}
        {person.sectors_in ? (
          <div className="max-w-[16rem] truncate text-[11px] text-ink-faint" title={person.sectors_in}>
            {person.sectors_in}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full min-w-[22rem] max-w-2xl space-y-4 rounded-lg border border-border bg-bg-elevated p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink">{person.full_name}</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-ink-mute hover:text-ink">
          Cerrar
        </button>
      </div>

      <form onSubmit={saveProfile} className="space-y-2.5">
        {isInvestor ? (
          <>
            <div>
              <label className={label} htmlFor={`thesis_${person.id}`}>
                Tesis de inversión
              </label>
              <textarea
                id={`thesis_${person.id}`}
                name="invest_thesis"
                rows={2}
                defaultValue={person.invest_thesis ?? ''}
                className={field}
                placeholder="Mayorías en industrial catalán con EBITDA recurrente"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={label} htmlFor={`in_${person.id}`}>
                  Invierte en
                </label>
                <input
                  id={`in_${person.id}`}
                  name="sectors_in"
                  defaultValue={person.sectors_in ?? ''}
                  className={field}
                  placeholder="industrial, packaging, servicios B2B"
                />
              </div>
              <div>
                <label className={label} htmlFor={`out_${person.id}`}>
                  No invierte en
                </label>
                <input
                  id={`out_${person.id}`}
                  name="sectors_out"
                  defaultValue={person.sectors_out ?? ''}
                  className={field}
                  placeholder="inmobiliario, retail"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={label} htmlFor={`tmin_${person.id}`}>
                  Ticket mínimo (M€)
                </label>
                <input
                  id={`tmin_${person.id}`}
                  name="ticket_min"
                  inputMode="decimal"
                  defaultValue={person.ticket_min ?? ''}
                  className={field}
                />
              </div>
              <div>
                <label className={label} htmlFor={`tmax_${person.id}`}>
                  Ticket máximo (M€)
                </label>
                <input
                  id={`tmax_${person.id}`}
                  name="ticket_max"
                  inputMode="decimal"
                  defaultValue={person.ticket_max ?? ''}
                  className={field}
                />
              </div>
            </div>
          </>
        ) : (
          // The profile fields are hidden rather than absent, so switching the
          // person's type later does not lose anything already written.
          <>
            <input type="hidden" name="invest_thesis" value={person.invest_thesis ?? ''} />
            <input type="hidden" name="sectors_in" value={person.sectors_in ?? ''} />
            <input type="hidden" name="sectors_out" value={person.sectors_out ?? ''} />
            <input type="hidden" name="ticket_min" value={person.ticket_min ?? ''} />
            <input type="hidden" name="ticket_max" value={person.ticket_max ?? ''} />
          </>
        )}

        <div>
          <label className={label} htmlFor={`notes_${person.id}`}>
            Notas
          </label>
          <textarea
            id={`notes_${person.id}`}
            name="notes"
            rows={2}
            defaultValue={person.notes ?? ''}
            className={field}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-bg-card disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Guardar ficha'}
        </button>
      </form>

      <form onSubmit={log} className="space-y-2.5 border-t border-border pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
          Registrar contacto
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={label} htmlFor={`kind_${person.id}`}>
              Tipo
            </label>
            <select id={`kind_${person.id}`} name="kind" className={field} defaultValue="Call">
              {INTERACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`when_${person.id}`}>
              Cuándo
            </label>
            <input id={`when_${person.id}`} name="happened_at" type="date" className={field} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor={`sum_${person.id}`}>
            Resumen
          </label>
          <input id={`sum_${person.id}`} name="summary" className={field} placeholder="De qué se habló" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={label} htmlFor={`ns_${person.id}`}>
              Siguiente paso
            </label>
            <input id={`ns_${person.id}`} name="next_step" className={field} />
          </div>
          <div>
            <label className={label} htmlFor={`nsd_${person.id}`}>
              Para cuándo
            </label>
            <input id={`nsd_${person.id}`} name="next_step_due" type="date" className={field} />
          </div>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Registrar'}
        </button>
      </form>

      {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
      {saved ? <p className="text-[11px] text-emerald-700">{saved}</p> : null}
    </div>
  );
}
