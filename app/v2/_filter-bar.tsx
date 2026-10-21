'use client';

import { useRouter } from 'next/navigation';

/**
 * The filter bar of the three catalogue screens.
 *
 * One component for Industrias, Tesis and Sourcing because all three filters are
 * the same thing: a row of dropdowns that write to the query string. Writing to
 * the URL and not to state is the point, a filtered catalogue has to survive
 * being pasted into an email.
 */
export interface FilterSpec {
  /** The query-string key. */
  name: string;
  label: string;
  /** Option values with their counts already folded into the label. */
  options: { value: string; label: string }[];
}

export default function FilterBar({
  base,
  params,
  filters,
  total,
  showing,
}: {
  /** The page's own path, e.g. `/v2/industrias`. */
  base: string;
  params: Record<string, string | undefined>;
  filters: FilterSpec[];
  total: number;
  showing: number;
}) {
  const router = useRouter();
  const active = filters.filter((f) => params[f.name]).length;

  function go(name: string, value: string) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== name) qs.set(k, v);
    if (value) qs.set(name, value);
    router.push(qs.toString() ? `${base}?${qs.toString()}` : base);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-card px-3 py-2.5">
      {filters.map((f) => (
        <label key={f.name} className="flex items-center gap-1.5 text-xs text-ink-mute">
          {f.label}
          <select
            value={params[f.name] ?? ''}
            onChange={(e) => go(f.name, e.target.value)}
            className={`max-w-[18rem] rounded border px-2 py-1 text-xs outline-none focus:border-brand ${
              params[f.name]
                ? 'border-brand bg-brand-wash font-semibold text-brand'
                : 'border-border bg-bg text-ink-mute'
            }`}
          >
            <option value="">Cualquiera</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      <span className="ml-auto font-mono text-xs text-ink-faint">
        {showing === total ? `${total}` : `${showing} de ${total}`}
      </span>
      {active > 0 ? (
        <button
          type="button"
          onClick={() => router.push(base)}
          className="rounded border border-border px-2 py-1 text-xs text-ink-mute hover:border-strong hover:text-ink"
        >
          Limpiar
        </button>
      ) : null}
    </div>
  );
}
