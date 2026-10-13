'use client';

import { useRouter } from 'next/navigation';

/**
 * The first two choices of the proactive path, in the order Ignasi gave them:
 * the play first, then the industry. The companies come last, and only once
 * both of these are set.
 *
 * Both controls write to the query string rather than to state, so a camino is
 * a URL. That is what makes it shareable: Marc can send Ignasi the exact screen
 * he is looking at.
 */
export default function CaminoPicker({
  themes,
  industries,
  themeId,
  taxonomyId,
}: {
  themes: { id: number; name: string }[];
  industries: { id: number; sector: string; category: string; subsector: string; pre_score: number | null }[];
  themeId: number | null;
  taxonomyId: number | null;
}) {
  const router = useRouter();

  function go(patch: { tema?: number | null; sub?: number | null }) {
    const qs = new URLSearchParams();
    const tema = patch.tema === undefined ? themeId : patch.tema;
    const sub = patch.sub === undefined ? taxonomyId : patch.sub;
    if (tema) qs.set('tema', String(tema));
    if (sub) qs.set('sub', String(sub));
    router.push(qs.toString() ? `/?${qs.toString()}` : '/');
  }

  const groups = industries.reduce<Record<string, typeof industries>>((acc, t) => {
    const key = `${t.sector} · ${t.category}`;
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-3 rounded-lg border border-border bg-bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-ink-faint">
          1 · Temática
        </span>
        {themes.length === 0 ? (
          <span className="text-xs text-ink-faint">
            Ninguna temática dada de alta. Se escriben en Ajustes.
          </span>
        ) : (
          themes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => go({ tema: themeId === t.id ? null : t.id })}
              className={`rounded-md border px-3 py-1 text-xs transition ${
                themeId === t.id
                  ? 'border-brand bg-brand-wash font-semibold text-brand'
                  : 'border-border text-ink-mute hover:bg-bg-elevated hover:text-ink'
              }`}
            >
              {t.name}
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-ink-faint">
          2 · Industria
        </span>
        <select
          value={taxonomyId ?? ''}
          onChange={(e) => go({ sub: e.target.value ? Number(e.target.value) : null })}
          className="w-full max-w-md rounded border border-border bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="">Elige un subsector…</option>
          {Object.entries(groups).map(([g, items]) => (
            <optgroup key={g} label={g}>
              {items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.subsector}
                  {t.pre_score === null ? '' : ` · interés ${t.pre_score}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
