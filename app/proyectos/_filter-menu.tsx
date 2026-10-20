'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export type FilterOption = { value: string; label: string; count: number };

/**
 * One filter, as a dropdown that takes SEVERAL values at once.
 *
 * It replaced three rows of chips. The chips were honest but they were one
 * value each and they grew with the data: twenty one subsectores is twenty one
 * buttons pushing the table off the screen, and "¿qué tengo en Sourcing y en
 * Screening?" needed two page loads and a mental sum.
 *
 * The selection lives in the URL as a comma separated list, so a filtered view
 * is still a link somebody can send. Closing on outside click and on Escape is
 * not decoration: a panel you can only shut by picking something is a panel
 * that makes you pick something.
 */
export default function FilterMenu({
  label,
  param,
  options,
  selected,
  params,
}: {
  label: string;
  param: string;
  options: FilterOption[];
  selected: string[];
  params: Record<string, string | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function go(next: string[]) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      // `ficha` is dropped on purpose: changing a filter while a popup is open
      // should leave you looking at the list you just asked for.
      if (v && k !== param && k !== 'ficha') qs.set(k, v);
    }
    if (next.length) qs.set(param, next.join(','));
    router.push(qs.toString() ? `/proyectos?${qs.toString()}` : '/proyectos');
  }

  const toggle = (value: string) =>
    go(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const summary =
    selected.length === 0
      ? 'Todas'
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} seleccionadas`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs transition ${
          selected.length
            ? 'border-brand bg-brand-wash font-semibold text-brand'
            : 'border-border text-ink-mute hover:bg-bg-elevated hover:text-ink'
        }`}
      >
        <span className="truncate">
          <span className="uppercase tracking-wider text-ink-faint">{label}</span>
          <span className="mx-1.5 text-ink-faint">·</span>
          {summary}
        </span>
        <span className="shrink-0 text-[10px] text-ink-faint">{open ? '▲' : '▼'}</span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 max-h-80 w-full min-w-[240px] overflow-y-auto rounded-md border border-border bg-bg-card p-1 shadow-lg">
          {options.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-ink-faint">Nada que filtrar.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => go([])}
                disabled={selected.length === 0}
                className="w-full rounded px-2 py-1.5 text-left text-xs text-ink-mute transition hover:bg-bg-elevated hover:text-ink disabled:opacity-40"
              >
                Todas
              </button>
              {options.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-ink transition hover:bg-bg-elevated"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => toggle(o.value)}
                    className="accent-brand"
                  />
                  <span className="flex-1 truncate">{o.label}</span>
                  <span className="shrink-0 tabular-nums text-ink-faint">{o.count}</span>
                </label>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
