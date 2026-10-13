import { DEFAULT_MONITOR_AT, DEFAULT_PROCEED_AT } from '@/lib/arpa/scoring';

/**
 * ARPA's three gates, as they look on every screen that lists deals.
 *
 * One component and not three copies, because the colour IS the judgement: a
 * green 84 on one screen and an uncoloured 84 on the next would read as two
 * different scores. The thresholds come from the scoring engine's own
 * constants, so moving the bar moves it everywhere at once.
 */

const dash = '—';

export function ScorePill({ value, label }: { value: number | null; label: string }) {
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

  const tone =
    value >= DEFAULT_PROCEED_AT
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value >= DEFAULT_MONITOR_AT
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';

  const verdict =
    value >= DEFAULT_PROCEED_AT ? 'Adelante' : value >= DEFAULT_MONITOR_AT ? 'Vigilar' : 'Descartar';

  return (
    <span
      className={`inline-flex min-w-[46px] items-center justify-center rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
      title={`${label} ${value}/100 · ${verdict} (adelante desde ${DEFAULT_PROCEED_AT}, vigilar desde ${DEFAULT_MONITOR_AT})`}
    >
      {label} {value}
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
  veto,
  compact = false,
}: {
  qss: number | null;
  om: number | null;
  pfr: number | null;
  veto?: boolean | null;
  /** Drops the unscored gates. For a 232px card, where three dashes is noise. */
  compact?: boolean;
}) {
  const all: [string, number | null][] = [
    ['QSS', qss],
    ['OM', om],
    ['PFR', pfr],
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
      {shown.map(([label, value]) => (
        <ScorePill key={label} value={value} label={label} />
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
