'use client';

import { useState, useTransition } from 'react';

import { setIosDocumentStatus, updateIosProject } from './actions';

/**
 * The two things you can do from the home screen without leaving it.
 *
 * Mi trabajo used to be a list of links: every row said what was wrong and the
 * only control was "go and look at the project". For the two cases that make up
 * most of the list, a document waiting for a yes or no and a next step whose
 * date has passed, that is three clicks and two page loads to type one word.
 *
 * What is deliberately NOT here is the gate decision. Advancing a stage needs a
 * written rationale and the checklist in front of you, so "Esperando decisión"
 * still sends you to the project. A one-click Advance on a list is exactly the
 * dropdown V2 exists to remove.
 */

const field =
  'rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';

/** Approve or reject one deliverable in place. */
export function DocDecision({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function set(doc_status: 'Approved' | 'Rejected') {
    start(async () => {
      const result = await setIosDocumentStatus({ id, doc_status });
      setMessage(result.ok ? null : result.message);
    });
  }

  return (
    <span className="ml-auto flex items-center gap-1.5">
      {message ? <span className="text-[11px] text-rose-700">{message}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => set('Approved')}
        className="rounded-md border border-emerald-600/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:border-emerald-600 disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => set('Rejected')}
        className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-ink-soft hover:border-strong disabled:opacity-50"
      >
        Rechazar
      </button>
    </span>
  );
}

/**
 * Rewrite an overdue next step and its date.
 *
 * Both fields together on purpose: an overdue step is either done, in which case
 * the text changes, or late, in which case the date does. Offering only a new
 * date would make postponing the cheapest action on the screen.
 */
export function NextStepForm({
  projectId,
  nextStep,
  nextStepDue,
}: {
  projectId: string;
  nextStep: string | null;
  nextStepDue: string | null;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save(form: FormData) {
    start(async () => {
      const result = await updateIosProject({
        id: projectId,
        next_step: String(form.get('next_step') ?? ''),
        next_step_due: String(form.get('next_step_due') ?? ''),
      });
      setMessage(result.ok ? 'Guardado' : result.message);
    });
  }

  return (
    <form action={save} className="mt-1.5 flex flex-wrap items-center gap-2">
      <input
        name="next_step"
        defaultValue={nextStep ?? ''}
        placeholder="Próximo paso"
        className={`${field} w-72`}
      />
      <input type="date" name="next_step_due" defaultValue={nextStepDue ?? ''} className={field} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-strong disabled:opacity-50"
      >
        Guardar
      </button>
      {message ? <span className="text-[11px] text-ink-faint">{message}</span> : null}
    </form>
  );
}
