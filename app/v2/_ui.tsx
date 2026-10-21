import { TIER_LABEL } from '@/lib/ios/lists';

/**
 * The handful of shapes every V2 screen repeats. Server components, no state.
 * This exists so six screens do not carry six slightly different panel borders.
 */

export function Panel({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 rounded-lg border border-border bg-bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-ink-faint">{hint}</p> : null}
        </div>
        {right}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-faint">{children}</p>;
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
      {hint ? <div className="text-[11px] text-ink-faint">{hint}</div> : null}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: 'border-border bg-bg-elevated text-ink-mute',
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-700',
  bad: 'border-rose-200 bg-rose-50 text-rose-700',
  brand: 'border-brand bg-brand-wash text-brand',
};

export function Pill({
  children,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES | string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
        TONES[tone] ?? TONES.neutral
      }`}
    >
      {children}
    </span>
  );
}

/** A/B/C with ARPA's own label on hover. The en dash lives in TIER_LABEL. */
export function TierPill({ tier }: { tier: 'A' | 'B' | 'C' }) {
  const tone = tier === 'A' ? 'good' : tier === 'B' ? 'warn' : 'neutral';
  return (
    <Pill tone={tone} title={TIER_LABEL[tier]}>
      {tier}
    </Pill>
  );
}

/** A 1-5 rating as a number plus a bar, so a column scans without reading. */
export function Rating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-xs text-ink">{value}</span>
      <span className="inline-block h-1 w-8 rounded bg-bg-elevated">
        <span
          className="block h-1 rounded bg-brand"
          style={{ width: `${(value / 5) * 100}%` }}
        />
      </span>
    </span>
  );
}

export const DASH = '\u2014';
