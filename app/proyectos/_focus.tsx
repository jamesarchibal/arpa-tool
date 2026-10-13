'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { setProjectFocus } from '../actions';

/**
 * Says which play a deal is, straight from its card.
 *
 * It sits on the card and not only on the project detail because assigning the
 * temática is the one thing that has to happen to every project before the board
 * is worth looking at, and walking into eleven fichas to do it is how it does
 * not get done.
 *
 * Pass `industries` to get the subsector select as well. The card leaves it out
 * because a 20-option list does not fit a 232px card, but the popup has the room
 * and both halves of the focus are the same decision.
 */
export default function FocusSelect({
  projectId,
  themeId,
  taxonomyId,
  themes,
  industries,
}: {
  projectId: string;
  themeId: number | null;
  taxonomyId: number | null;
  themes: { id: number; name: string }[];
  industries?: { id: number; subsector: string }[];
}) {
  const [theme, setTheme] = useState(themeId === null ? '' : String(themeId));
  const [industry, setIndustry] = useState(taxonomyId === null ? '' : String(taxonomyId));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const num = (v: string) => (v === '' ? null : Number(v));

  /** The action writes both columns, so both always go, changed or not. */
  function save(patch: { theme?: string; industry?: string }) {
    const previous = { theme, industry };
    const next = { theme, industry, ...patch };
    setTheme(next.theme);
    setIndustry(next.industry);
    setError(null);

    startTransition(async () => {
      const res = await setProjectFocus({
        project_id: projectId,
        theme_id: num(next.theme),
        taxonomy_id: num(next.industry),
      });
      if (!res.ok) {
        setTheme(previous.theme);
        setIndustry(previous.industry);
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  const box = (empty: boolean) =>
    `w-full rounded border bg-bg px-1.5 py-0.5 text-[11px] outline-none focus:border-brand disabled:opacity-50 ${
      empty ? 'border-dashed border-border text-ink-faint' : 'border-border text-ink-soft'
    }`;

  return (
    <div className="space-y-1">
      <select
        value={theme}
        disabled={pending}
        onChange={(e) => save({ theme: e.target.value })}
        aria-label="Temática"
        className={box(theme === '')}
      >
        <option value="">Sin temática</option>
        {themes.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      {industries ? (
        <select
          value={industry}
          disabled={pending}
          onChange={(e) => save({ industry: e.target.value })}
          aria-label="Industria"
          className={box(industry === '')}
        >
          <option value="">Sin industria</option>
          {industries.map((t) => (
            <option key={t.id} value={t.id}>{t.subsector}</option>
          ))}
        </select>
      ) : null}

      {error ? <p className="mt-0.5 text-[10px] text-rose-600">{error}</p> : null}
    </div>
  );
}
