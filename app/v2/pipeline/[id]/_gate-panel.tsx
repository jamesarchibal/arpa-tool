'use client';

import { useState, useTransition } from 'react';

import type { GateCheck } from '@/lib/ios/gates';
import {
  CLOSING_STATUS,
  DECISION_TYPE,
  FULL_DD_STATUS,
  LOI_STATUS,
  PASS_LOST_REASONS,
  type GateDecision,
  type Stage,
} from '@/lib/ios/lists';
import { recordGateDecision, updateIosProject } from '../../actions';

/**
 * The gate: what it needs, and the decision.
 *
 * Two forms, in the order the work happens. The left one edits the things the
 * gate reads (the next step, the LOI and DD and closing statuses, the thesis).
 * The right one records the decision. The checklist between them is
 * `gateReady().checks` painted as-is, so the reason a gate is shut is never a
 * guess.
 *
 * There is no stage control anywhere on this screen. That is the whole point of
 * V2: the stage shown in the header is an output.
 */
export default function GatePanel({
  project,
  checks,
  ready,
  allowed,
  theses,
}: {
  project: {
    id: string;
    stage: Stage;
    next_step: string | null;
    next_step_due: string | null;
    loi_status: string;
    full_dd_status: string;
    closing_status: string;
    open_required_dd_items: number;
    thesis_id: string | null;
    owner: string | null;
  };
  checks: GateCheck[];
  ready: boolean;
  allowed: readonly GateDecision[];
  theses: { id: string; code: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [decision, setDecision] = useState<GateDecision | ''>('');

  // Stop and Lost decisions write the reason onto the project, so the reason
  // picker only appears when it is going to be used.
  const needsReason =
    decision !== '' && ['Stop', 'Lost'].includes(DECISION_TYPE[decision]);

  function saveFacts(form: FormData) {
    start(async () => {
      const result = await updateIosProject({
        id: project.id,
        owner: String(form.get('owner') ?? ''),
        thesis_id: String(form.get('thesis_id') ?? '') || null,
        next_step: String(form.get('next_step') ?? ''),
        next_step_due: String(form.get('next_step_due') ?? ''),
        loi_status: String(form.get('loi_status') ?? ''),
        full_dd_status: String(form.get('full_dd_status') ?? ''),
        closing_status: String(form.get('closing_status') ?? ''),
        open_required_dd_items: String(form.get('open_required_dd_items') ?? '0'),
      });
      setMessage(result.message);
    });
  }

  function decide(form: FormData) {
    start(async () => {
      const result = await recordGateDecision({
        project_id: project.id,
        gate: project.stage,
        decision: String(form.get('decision') ?? ''),
        rationale: String(form.get('rationale') ?? ''),
        decided_by: String(form.get('decided_by') ?? ''),
        pass_lost_reason: String(form.get('pass_lost_reason') ?? '') || null,
        decisive_evidence: String(form.get('decisive_evidence') ?? ''),
      });
      setMessage(result.message);
      if (result.ok) setDecision('');
    });
  }

  const field =
    'rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';
  const label = 'flex flex-col gap-1 text-[11px] text-ink-mute';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Qué pide este gate</h2>
          <span
            className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
              ready
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {ready ? 'Abierto' : 'Cerrado'}
          </span>
        </header>

        <ul className="divide-y divide-border">
          {checks.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className={c.ok ? 'text-emerald-600' : 'text-rose-600'}>
                {c.ok ? '✓' : '✗'}
              </span>
              <span className={c.ok ? 'text-ink-mute' : 'font-medium text-ink'}>{c.label}</span>
            </li>
          ))}
        </ul>

        <form action={saveFacts} className="grid grid-cols-2 gap-2 border-t border-border px-4 py-3">
          <label className={`${label} col-span-2`}>
            Próximo paso
            <input name="next_step" defaultValue={project.next_step ?? ''} className={field} />
          </label>
          <label className={label}>
            Fecha límite
            <input
              type="date"
              name="next_step_due"
              defaultValue={project.next_step_due ?? ''}
              className={field}
            />
          </label>
          <label className={label}>
            Responsable
            <input name="owner" defaultValue={project.owner ?? ''} className={field} />
          </label>
          <label className={`${label} col-span-2`}>
            Tesis principal
            <select name="thesis_id" defaultValue={project.thesis_id ?? ''} className={field}>
              <option value="">Sin tesis</option>
              {theses.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Estado LOI
            <select name="loi_status" defaultValue={project.loi_status} className={field}>
              {LOI_STATUS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Estado DD
            <select name="full_dd_status" defaultValue={project.full_dd_status} className={field}>
              {FULL_DD_STATUS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Estado de cierre
            <select name="closing_status" defaultValue={project.closing_status} className={field}>
              {CLOSING_STATUS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {/* Hand-typed because the DD Tracker is out of V2's scope. A visible
              stump: the Full DD gate will not open until this is 0. */}
          <label className={label}>
            Puntos DD abiertos
            <input
              type="number"
              min={0}
              name="open_required_dd_items"
              defaultValue={project.open_required_dd_items}
              className={field}
            />
          </label>
          <div className="col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-strong disabled:opacity-50"
            >
              Guardar datos del gate
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-bg-card">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Registrar decisión</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            {allowed.length === 0
              ? 'La cartera no tiene gate de salida.'
              : 'Un intento de avanzar con el gate cerrado se guarda como Blocked, no se descarta.'}
          </p>
        </header>

        {allowed.length === 0 ? null : (
          <form action={decide} className="space-y-3 px-4 py-3">
            <label className={label}>
              Decisión
              <select
                name="decision"
                required
                value={decision}
                onChange={(e) => setDecision(e.target.value as GateDecision)}
                className={field}
              >
                <option value="">Elegir…</option>
                {allowed.map((d) => (
                  <option key={d} value={d}>
                    {d} ({DECISION_TYPE[d]})
                  </option>
                ))}
              </select>
            </label>

            <label className={label}>
              Justificación (obligatoria)
              <textarea
                name="rationale"
                required
                minLength={10}
                rows={3}
                className={field}
                placeholder="Por qué, con el dato que lo decide"
              />
            </label>

            <label className={label}>
              Quién decide
              <input name="decided_by" className={field} />
            </label>

            {needsReason ? (
              <>
                <label className={label}>
                  Motivo de descarte
                  <select name="pass_lost_reason" required className={field}>
                    <option value="">Elegir…</option>
                    {PASS_LOST_REASONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className={label}>
                  Evidencia decisiva
                  <input name="decisive_evidence" className={field} />
                </label>
              </>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? 'Registrando…' : 'Registrar'}
            </button>
          </form>
        )}

        {message ? (
          <p className="border-t border-border px-4 py-2 text-xs text-ink-soft">{message}</p>
        ) : null}
      </section>
    </div>
  );
}
