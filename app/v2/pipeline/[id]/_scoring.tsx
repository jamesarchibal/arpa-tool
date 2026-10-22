'use client';

import { useMemo, useState, useTransition } from 'react';

import {
  KILL_CRITERIA,
  MONITOR_AT,
  PROCEED_AT,
  SCORING_MODELS,
  criterionKey,
  scoreProject,
  type Ratings,
} from '@/lib/ios/scoring';
import { saveIosScore } from '../../actions';
import { DASH, Pill } from '../../_ui';

/**
 * The scorecard: his sixteen criteria across three gates, rated 1-5.
 *
 * The score recomputes in the browser as you click, using the same pure function
 * the server uses, so the number you decide on is the number that gets stored.
 * Nothing here writes the stage or the status. A 40 on QSS does not close the
 * gate, because his `Gate Ready?` formula reads document statuses and never the
 * score. What a bad score does is make the next Advance hard to write down.
 *
 * A criterion with no rating stays empty rather than defaulting to 3. His rule is
 * that a gate score is blank until every criterion carries a value, and a
 * placeholder would turn "nobody has looked" into a verdict.
 */
const TONE = (outcome: number) =>
  outcome === 0 ? 'good' : outcome === 1 ? 'warn' : outcome === 2 ? 'bad' : 'neutral';

export default function Scoring({
  projectId,
  ratings: initialRatings,
  kills: initialKills,
  notes,
  scoredBy,
  updatedAt,
}: {
  projectId: string;
  ratings: Ratings;
  kills: string[];
  notes: string | null;
  scoredBy: string | null;
  updatedAt: string;
}) {
  const [ratings, setRatings] = useState<Ratings>(initialRatings);
  const [kills, setKills] = useState<string[]>(initialKills);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const result = useMemo(() => scoreProject(ratings, kills), [ratings, kills]);

  const dirty =
    JSON.stringify(ratings) !== JSON.stringify(initialRatings) ||
    JSON.stringify([...kills].sort()) !== JSON.stringify([...initialKills].sort());

  function setRating(key: string, value: number) {
    setRatings((prev) => {
      // Clicking the rating a criterion already has clears it, so a mis-click is
      // undoable without reloading. There is no other way back to unrated.
      const next = { ...prev };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function save(form: FormData) {
    start(async () => {
      const r = await saveIosScore({
        project_id: projectId,
        ratings,
        kills,
        notes: String(form.get('notes') ?? ''),
        scored_by: String(form.get('scored_by') ?? ''),
      });
      setMessage(r.message);
    });
  }

  const field =
    'rounded border border-border bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand';

  return (
    <form action={save} className="space-y-4">
      <section className="rounded-lg border border-border bg-bg-card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Puntuación de las puertas</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              Dieciséis criterios, 1 a 5, con los pesos de ARPA. Una puerta no da
              nota hasta que todos sus criterios están puntuados. Proceed a partir
              de {PROCEED_AT}, Monitor a partir de {MONITOR_AT}.
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              Global
            </div>
            <div className="text-2xl font-semibold text-ink">{result.overall ?? DASH}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {result.models.map((m) => (
            <Pill key={m.id} tone={TONE(m.outcome)} title={m.question}>
              {m.name} {m.score ?? DASH} · {m.verdict}
            </Pill>
          ))}
        </div>

        {result.suggestedReason ? (
          <p className="mt-2 text-xs text-rose-700">
            Motivo propuesto si se descarta: <strong>{result.suggestedReason}</strong> (
            {result.suggestedReasonSource}). Se propone, no se escribe: el motivo
            real se elige al registrar la decisión.
          </p>
        ) : null}
      </section>

      {SCORING_MODELS.map((M) => {
        const r = result.models.find((m) => m.id === M.id)!;
        return (
          <section key={M.id} className="rounded-lg border border-border bg-bg-card">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  {M.name} <span className="font-normal text-ink-faint">· {M.stage}</span>
                </h3>
                <p className="mt-0.5 text-xs text-ink-faint">{M.question}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.complete ? null : (
                  <span className="text-[11px] text-ink-faint">
                    faltan {r.missing.length} de {M.criteria.length}
                  </span>
                )}
                <Pill tone={TONE(r.outcome)}>
                  {r.score ?? DASH} · {r.verdict}
                </Pill>
              </div>
            </header>

            <ul className="divide-y divide-border">
              {r.criteria.map((c) => (
                <li
                  key={c.key}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-ink">
                      {c.name}{' '}
                      <span className="font-mono text-[10px] text-ink-faint">{c.weight}%</span>
                    </div>
                    <div className="text-[11px] text-ink-faint">{c.detail}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(c.key, n)}
                        aria-pressed={c.rating === n}
                        title={c.rating === n ? 'Clic otra vez para dejarlo sin puntuar' : undefined}
                        className={`h-7 w-7 rounded border text-xs font-semibold transition ${
                          c.rating === n
                            ? 'border-brand bg-brand text-white'
                            : 'border-border text-ink-mute hover:border-strong hover:text-ink'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-border px-4 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                Criterios de descarte
              </p>
              <div className="mt-1.5 space-y-1">
                {KILL_CRITERIA.filter((k) => k.model === M.id).map((k) => (
                  <label key={k.id} className="flex items-start gap-2 text-xs text-ink-soft">
                    <input
                      type="checkbox"
                      checked={kills.includes(k.id)}
                      onChange={(e) =>
                        setKills((prev) =>
                          e.target.checked ? [...prev, k.id] : prev.filter((x) => x !== k.id),
                        )
                      }
                      className="mt-0.5"
                    />
                    <span>{k.text}</span>
                  </label>
                ))}
              </div>
              {r.vetoed ? (
                <p className="mt-1.5 text-[11px] text-rose-700">
                  Vetada. Un criterio de descarte marcado deja la puerta en Pass sea
                  cual sea la nota.
                </p>
              ) : null}
            </div>
          </section>
        );
      })}

      <section className="rounded-lg border border-border bg-bg-card px-4 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <input
            name="scored_by"
            defaultValue={scoredBy ?? ''}
            placeholder="Quién puntúa"
            className={`${field} w-44`}
          />
          <input
            name="notes"
            defaultValue={notes ?? ''}
            placeholder="Notas de la puntuación"
            className={`${field} flex-1`}
          />
          <button
            type="submit"
            disabled={pending || !dirty}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Guardando…' : dirty ? 'Guardar' : 'Sin cambios'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          {updatedAt
            ? `Última puntuación ${new Date(updatedAt).toLocaleString('es-ES')}`
            : 'Nunca puntuado.'}{' '}
          La nota no mueve la etapa: eso sigue siendo el gate.
        </p>
        {message ? <p className="mt-1 text-xs text-ink-soft">{message}</p> : null}
      </section>
    </form>
  );
}
