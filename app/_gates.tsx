import {
  DEFAULT_MONITOR_AT,
  DEFAULT_PROCEED_AT,
  MIN_COVERAGE_FOR_VERDICT,
} from '@/lib/arpa/scoring';

/**
 * ARPA's three gates, as they look on every screen that lists deals.
 *
 * One component and not three copies, because the colour IS the judgement: a
 * green 84 on one screen and an uncoloured 84 on the next would read as two
 * different scores. The thresholds come from the scoring engine's own
 * constants, so moving the bar moves it everywhere at once.
 *
 * A pill carries COVERAGE as well as the score. A gate is renormalised over the
 * weight that had data behind it, so 90/100 off 30% of the weight and 90/100 off
 * all of it are the same number and nowhere near the same claim. Thin scores
 * stay grey and say how thin they are.
 */

const dash = '—';

export function ScorePill({
  value,
  label,
  cov,
}: {
  value: number | null;
  label: string;
  /** Share of the gate's weight that had a score, 0-100. */
  cov?: number | null;
}) {
  if (value === null || value === undefined) {
    return (
      <span
        className="inline-flex min-w-[46px] items-center justify-center rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-ink-faint"
        title={`${label}: esta puerta no se ha puntuado`}
      >
        {label} {dash}
      </span>
    );
  }

  const verdict =
    value >= DEFAULT_PROCEED_AT ? 'Adelante' : value >= DEFAULT_MONITOR_AT ? 'Vigilar' : 'Descartar';

  // Grey, not green, when too little of the gate was answered. The score is
  // still shown: hiding it would lose the only number there is. What it must
  // not do is borrow the authority of a full assessment.
  const thin = cov !== null && cov !== undefined && cov < MIN_COVERAGE_FOR_VERDICT;

  const tone = thin
    ? 'border-border bg-bg-elevated text-ink-mute'
    : value >= DEFAULT_PROCEED_AT
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value >= DEFAULT_MONITOR_AT
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';

  const title = thin
    ? `${label} ${value}/100 pero solo con el ${cov} % del peso puntuado. ` +
      `Demasiado poco para un veredicto: falta contestar el ${100 - (cov as number)} % restante.`
    : `${label} ${value}/100 · ${verdict} (adelante desde ${DEFAULT_PROCEED_AT}, ` +
      `vigilar desde ${DEFAULT_MONITOR_AT})` +
      (cov === null || cov === undefined ? '' : ` · ${cov} % del peso puntuado`);

  return (
    <span
      className={`inline-flex min-w-[46px] items-center justify-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
      title={title}
    >
      <span>
        {label} {value}
      </span>
      {thin ? <span className="font-normal opacity-70">{cov}%</span> : null}
    </span>
  );
}

/**
 * The three gates together, in the order they are crossed.
 *
 * All three always render, including the ones nobody has scored yet, because
 * an empty PFR slot is the information: it says the deal has not reached the
 * financial review. Showing only the gates that have a number would make a
 * screening-stage deal and a closed one look alike.
 */
export function Gates({
  qss,
  om,
  pfr,
  qssCov,
  omCov,
  pfrCov,
  veto,
  compact = false,
}: {
  qss: number | null;
  om: number | null;
  pfr: number | null;
  qssCov?: number | null;
  omCov?: number | null;
  pfrCov?: number | null;
  veto?: boolean | null;
  /** Drops the unscored gates. For a 232px card, where three dashes is noise. */
  compact?: boolean;
}) {
  const all: [string, number | null, number | null | undefined][] = [
    ['QSS', qss, qssCov],
    ['OM', om, omCov],
    ['PFR', pfr, pfrCov],
  ];
  const shown = compact ? all.filter(([, v]) => v !== null) : all;

  if (shown.length === 0) {
    return (
      <span className="inline-flex items-center rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-ink-faint">
        sin puntuar
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map(([label, value, cov]) => (
        <ScorePill key={label} value={value} label={label} cov={cov} />
      ))}
      {veto ? (
        <span
          className="text-[10px] font-bold text-rose-600"
          title="Hay un kill criterion marcado: el veredicto es descartar sea cual sea la puntuación"
        >
          VETO
        </span>
      ) : null}
    </span>
  );
}
