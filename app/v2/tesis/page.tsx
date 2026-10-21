import { getIosTheses } from '@/lib/ios/db';
import { CROSS_SECTOR, filterTheses } from '@/lib/ios/filters';
import ExportCsv from '../_export-button';
import FilterBar from '../_filter-bar';
import { DASH, Pill, Stat } from '../_ui';

export const dynamic = 'force-dynamic';

/**
 * ARPA's Thesis Library: 140 theses.
 *
 * One rule this screen must not break: the 17 theses with `Scope =
 * Cross-sector` link to no subsector at all, deliberately, and they are the
 * firm's broadest plays. A subsector filter that dropped them would hide the
 * best ideas, so the subsector dropdown keeps them and labels them.
 */
type Params = { scope?: string; strategy?: string; priority?: string; subsector?: string };

export default async function TesisPage({ searchParams }: { searchParams?: Params }) {
  const params = searchParams ?? {};
  const all = await getIosTheses();

  // Shared with `/v2/export` so the file always matches the list.
  const rows = filterTheses(all, params);

  const tally = (pick: (t: typeof all[number]) => string | null) => {
    const out: Record<string, number> = {};
    for (const t of all) {
      const k = pick(t);
      if (k) out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };
  const byScope = tally((t) => t.scope);
  const byStrategy = tally((t) => t.primary_strategy);
  const byPriority = tally((t) => t.priority);

  const subsectorCounts: Record<string, number> = {};
  for (const t of all) for (const s of t.subsectors) subsectorCounts[s] = (subsectorCounts[s] ?? 0) + 1;
  const crossSector = all.filter((t) => t.subsectors.length === 0).length;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tesis" value={String(all.length)} />
        <Stat label="Alta prioridad" value={String(byPriority.High ?? 0)} />
        <Stat
          label="Cross-sector"
          value={String(crossSector)}
          hint="sin subsector, a propósito"
        />
        <Stat
          label="Pares tesis-subsector"
          value={String(Object.values(subsectorCounts).reduce((a, b) => a + b, 0))}
        />
      </div>

      <FilterBar
        base="/v2/tesis"
        params={params}
        total={all.length}
        showing={rows.length}
        right={<ExportCsv kind="tesis" params={params} />}
        filters={[
          {
            name: 'scope',
            label: 'Ámbito',
            options: Object.entries(byScope).map(([k, n]) => ({ value: k, label: `${k} (${n})` })),
          },
          {
            name: 'priority',
            label: 'Prioridad',
            options: ['High', 'Medium', 'Low']
              .filter((p) => byPriority[p])
              .map((p) => ({ value: p, label: `${p} (${byPriority[p]})` })),
          },
          {
            name: 'strategy',
            label: 'Estrategia',
            options: Object.entries(byStrategy)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => ({ value: k, label: `${k} (${n})` })),
          },
          {
            name: 'subsector',
            label: 'Subsector',
            options: [
              { value: CROSS_SECTOR, label: `Solo cross-sector (${crossSector})` },
              ...Object.entries(subsectorCounts)
                .sort((a, b) => a[0].localeCompare(b[0], 'es'))
                .map(([k, n]) => ({ value: k, label: `${k} (${n})` })),
            ],
          },
        ]}
      />

      <div className="space-y-3">
        {rows.map((t) => (
          <article key={t.id} className="rounded-lg border border-border bg-bg-card px-4 py-3">
            <header className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs text-ink-faint">{t.code}</span>
              <h3 className="text-sm font-semibold text-ink">{t.name}</h3>
              <Pill tone={t.scope === 'Cross-sector' ? 'brand' : 'neutral'}>{t.scope}</Pill>
              {t.priority ? (
                <Pill tone={t.priority === 'High' ? 'good' : 'neutral'}>{t.priority}</Pill>
              ) : null}
              <Pill>{t.status}</Pill>
              <span className="ml-auto text-xs text-ink-faint">
                {t.subsectors.length > 0
                  ? `${t.subsectors.length} subsector${t.subsectors.length === 1 ? '' : 'es'}`
                  : 'aplica a los subsectores elegibles'}
              </span>
            </header>

            {t.structural_driver ? (
              <p className="mt-2 text-xs text-ink-mute">
                <span className="font-semibold text-ink-soft">Driver: </span>
                {t.structural_driver}
              </p>
            ) : null}
            {t.description ? (
              <p className="mt-1.5 text-sm text-ink-soft">{t.description}</p>
            ) : null}

            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <div>
                <dt className="inline font-semibold text-ink-soft">Estrategia: </dt>
                <dd className="inline text-ink-mute">{t.primary_strategy ?? DASH}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink-soft">EBITDA objetivo: </dt>
                <dd className="inline text-ink-mute">{t.target_ebitda_eur_m ?? DASH}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink-soft">Ventas objetivo: </dt>
                <dd className="inline text-ink-mute">{t.target_revenue_eur_m ?? DASH}</dd>
              </div>
            </dl>

            {t.value_creation_levers.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {t.value_creation_levers.map((l) => (
                  <li key={l}>
                    <Pill>{l}</Pill>
                  </li>
                ))}
              </ul>
            ) : null}

            {t.subsectors.length > 0 ? (
              <p className="mt-2 text-[11px] text-ink-faint">{t.subsectors.join(' · ')}</p>
            ) : null}
          </article>
        ))}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">
            Ninguna tesis con esos filtros.
          </p>
        ) : null}
      </div>
    </>
  );
}
