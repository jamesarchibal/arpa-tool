'use client';

import { useRouter } from 'next/navigation';

/**
 * The subsector filter of Originación.
 *
 * A dropdown and not chips like the other filters, because there are twenty-one
 * subsectors in four sectors and a row of twenty-one chips is not a filter bar,
 * it is a wall. The count rides on each option so an empty subsector is visible
 * before it is chosen.
 *
 * It writes to the query string instead of to state, which is why it is the only
 * client component on the screen: the filter has to survive a share, so a camino
 * is a URL.
 */
export default function IndustryFilter({
  industries,
  taxonomyId,
  counts,
  params,
}: {
  industries: { id: number; sector: string; category: string; subsector: string; pre_score: number | null }[];
  taxonomyId: number | null;
  counts: Record<number, number>;
  /** Every other filter already on the URL, so changing this one keeps them. */
  params: Record<string, string | undefined>;
}) {
  const router = useRouter();

  function go(sub: number | null) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'sub') qs.set(k, v);
    if (sub) qs.set('sub', String(sub));
    router.push(qs.toString() ? `/?${qs.toString()}` : '/');
  }

  const groups = industries.reduce<Record<string, typeof industries>>((acc, t) => {
    const key = `${t.sector} · ${t.category}`;
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  return (
    <select
      value={taxonomyId ?? ''}
      onChange={(e) => go(e.target.value ? Number(e.target.value) : null)}
      className={`max-w-md rounded border px-2.5 py-1 text-xs outline-none focus:border-brand ${
        taxonomyId
          ? 'border-brand bg-brand-wash font-semibold text-brand'
          : 'border-border bg-bg text-ink-mute'
      }`}
    >
      <option value="">Cualquiera</option>
      {Object.entries(groups).map(([g, items]) => (
        <optgroup key={g} label={g}>
          {items.map((t) => (
            <option key={t.id} value={t.id}>
              {t.subsector} ({counts[t.id] ?? 0})
              {t.pre_score === null ? '' : ` · interés ${t.pre_score}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
