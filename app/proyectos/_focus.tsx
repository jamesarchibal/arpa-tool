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
 */
export default function FocusSelect({
  projectId,
  themeId,
  taxonomyId,
  themes,
}: {
  projectId: string;
  themeId: number | null;
  taxonomyId: number | null;
  themes: { id: number; name: string }[];
}) {
  const [value, setValue] = useState(themeId === null ? '' : String(themeId));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const res = await setProjectFocus({
        project_id: projectId,
        theme_id: next === '' ? null : Number(next),
        // Sent back unchanged: the action writes both columns, so omitting it
        // would silently clear the industry.
        taxonomy_id: taxonomyId,
      });
      if (!res.ok) {
        setValue(previous);
        setError(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Temática"
        className={`w-full rounded border bg-bg px-1.5 py-0.5 text-[11px] outline-none focus:border-brand disabled:opacity-50 ${
          value === '' ? 'border-dashed border-border text-ink-faint' : 'border-border text-ink-soft'
        }`}
      >
        <option value="">Sin temática</option>
        {themes.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {error ? <p className="mt-0.5 text-[10px] text-rose-600">{error}</p> : null}
    </div>
  );
}
