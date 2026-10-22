import { getIosIndustries } from '@/lib/ios/db';
import { filterIndustries } from '@/lib/ios/filters';
import { INDUSTRY_CRITERIA } from '@/lib/ios/industries';
import { TIER_LABEL } from '@/lib/ios/lists';
import ExportCsv from '../_export-button';
import FilterBar from '../_filter-bar';
import { Stat } from '../_ui';
import IndustryRows from './_rows';

export const dynamic = 'force-dynamic';

/**
 * ARPA's Industry Library: 100 subsectors, eight criteria each, one tier.
 *
 * The score and the tier in this table are computed per request by
 * `lib/ios/industries.ts` and are not columns in `ios_industries`. That is the
 * one design decision on this screen worth defending: their sheet ships a
 * `Check: Weighted Score` column, we load the eight ratings and reproduce the
 * number, and a test proves we match on all 100 rows. A stored score would be a
 * second implementation and would drift the first time a rating is edited.
 */
type Params = { tier?: string; industry?: string; sector?: string };

export default async function IndustriasPage({
  searchParams,
}: {
  searchParams?: Params;
}) {
  const params = searchParams ?? {};
  const all = await getIosIndustries();

  // Shared with `/v2/export` so the file always matches the list.
  const rows = filterIndustries(all, params);

  const count = (pick: (r: typeof all[number]) => string) => {
    const out: Record<string, number> = {};
    for (const r of all) out[pick(r)] = (out[pick(r)] ?? 0) + 1;
    return out;
  };
  const byTier = count((r) => r.tier);
  const byIndustry = count((r) => r.industry);
  const bySector = count((r) => r.sector);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Subsectores" value={String(all.length)} hint="su biblioteca completa" />
        {(['A', 'B', 'C'] as const).map((t) => (
          <Stat key={t} label={TIER_LABEL[t]} value={String(byTier[t] ?? 0)} hint={`tier ${t}`} />
        ))}
      </div>

      <FilterBar
        base="/v2/industrias"
        params={params}
        total={all.length}
        showing={rows.length}
        right={<ExportCsv kind="industrias" params={params} />}
        filters={[
          {
            name: 'tier',
            label: 'Tier',
            options: (['A', 'B', 'C'] as const).map((t) => ({
              value: t,
              label: `${TIER_LABEL[t]} (${byTier[t] ?? 0})`,
            })),
          },
          {
            name: 'industry',
            label: 'Industria',
            options: Object.entries(byIndustry).map(([k, n]) => ({
              value: k,
              label: `${k} (${n})`,
            })),
          },
          {
            name: 'sector',
            label: 'Sector',
            options: Object.entries(bySector)
              .sort((a, b) => a[0].localeCompare(b[0], 'es'))
              .map(([k, n]) => ({ value: k, label: `${k} (${n})` })),
          },
        ]}
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              <th className="px-3 py-2">Subsector</th>
              <th className="px-3 py-2">Sector</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2">Tier</th>
              {INDUSTRY_CRITERIA.map((c) => (
                // The full Spanish name on hover: eight columns of eight words
                // each is a header nobody reads.
                <th key={c.key} className="px-3 py-2" title={`${c.label} (peso ${c.weight})`}>
                  {c.label.split(' ')[0]}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Editar</th>
            </tr>
          </thead>
          <IndustryRows rows={rows} />
        </table>
      </div>
    </>
  );
}
