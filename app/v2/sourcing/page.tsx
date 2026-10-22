import Link from 'next/link';

import { getIosArchetypes, getIosLongList, getIosSources } from '@/lib/ios/db';
import { filterArchetypes, filterCompanies } from '@/lib/ios/filters';
import ExportCsv from '../_export-button';
import FilterBar from '../_filter-bar';
import { DASH, Pill, Stat } from '../_ui';
import Fuentes from './_fuentes';
import ImportSabi from './_import';

export const dynamic = 'force-dynamic';

/**
 * One screen, three views: arquetipos (173), empresas (258) and fuentes (22).
 *
 * Their spec has these as three separate library screens. They are not three
 * things, they are one chain read at three depths: an archetype says what kind of
 * company to look for, the long list is the companies found, and the source says
 * where each one came from. V1 already learned this twice (decisions A11 and
 * A13): separate tabs over one dataset mean the filters do not carry over and
 * people work in one place and look in another.
 */
const VIEWS = [
  { key: 'arquetipos', label: 'Arquetipos' },
  { key: 'empresas', label: 'Empresas' },
  { key: 'fuentes', label: 'Fuentes' },
] as const;

type Params = {
  v?: string;
  subsector?: string;
  role?: string;
  province?: string;
  source?: string;
  archetype?: string;
};

const pct = (v: number | null) => (v === null ? DASH : `${(v * 100).toFixed(0)} %`);
const money = (v: number | null) => (v === null ? DASH : `${Number(v).toFixed(1)} M€`);

export default async function SourcingPage({ searchParams }: { searchParams?: Params }) {
  const params = searchParams ?? {};
  const view = VIEWS.find((v) => v.key === params.v)?.key ?? 'arquetipos';

  const [archetypes, companies, sources] = await Promise.all([
    getIosArchetypes(),
    getIosLongList(),
    getIosSources(),
  ]);

  const tally = <T,>(xs: T[], pick: (x: T) => string | null) => {
    const out: Record<string, number> = {};
    for (const x of xs) {
      const k = pick(x);
      if (k) out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };
  const options = (counts: Record<string, number>) =>
    Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([k, n]) => ({ value: k, label: `${k} (${n})` }));

  const qs = (next: string) => {
    const p = new URLSearchParams();
    if (next !== 'arquetipos') p.set('v', next);
    return p.toString() ? `/v2/sourcing?${p.toString()}` : '/v2/sourcing';
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Arquetipos" value={String(archetypes.length)} hint="qué buscar" />
        <Stat label="Empresas" value={String(companies.length)} hint="long list en España" />
        <Stat label="Fuentes" value={String(sources.length)} hint="de dónde salen" />
        <Stat
          label="Con ventas estimadas"
          value={String(companies.filter((c) => c.revenue_estimate_eur_m !== null).length)}
          hint="el resto está sin dato, no a cero"
        />
      </div>

      <nav className="mb-4 flex gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={qs(v.key)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
              view === v.key
                ? 'border-brand bg-brand-wash text-brand'
                : 'border-border text-ink-mute hover:border-strong hover:text-ink'
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === 'arquetipos' ? (
        (() => {
          // Shared with `/v2/export` so the file always matches the list.
          const rows = filterArchetypes(archetypes, params);
          return (
            <>
              <FilterBar
                base="/v2/sourcing"
                params={{ ...params, v: 'arquetipos' }}
                total={archetypes.length}
                showing={rows.length}
                right={<ExportCsv kind="arquetipos" params={params} />}
                filters={[
                  {
                    name: 'subsector',
                    label: 'Subsector',
                    options: options(tally(archetypes, (a) => a.subsector)),
                  },
                  {
                    name: 'role',
                    label: 'Rol PE',
                    options: options(tally(archetypes, (a) => a.pe_role)),
                  },
                ]}
              />
              <div className="space-y-3">
                {rows.map((a) => (
                  <article key={a.id} className="rounded-lg border border-border bg-bg-card px-4 py-3">
                    <header className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-sm font-semibold text-ink">{a.name}</h3>
                      {a.pe_role ? <Pill tone="brand">{a.pe_role}</Pill> : null}
                      <span className="text-xs text-ink-faint">{a.subsector}</span>
                      <span className="ml-auto font-mono text-xs text-ink-mute">
                        margen {pct(a.typical_ebitda_margin)}
                      </span>
                    </header>
                    {a.what_it_does ? (
                      <p className="mt-1.5 text-sm text-ink-soft">{a.what_it_does}</p>
                    ) : null}
                    {a.revenue_model ? (
                      <p className="mt-1 text-xs text-ink-mute">
                        <span className="font-semibold text-ink-soft">Modelo: </span>
                        {a.revenue_model}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {a.cnae_codes.map((c) => (
                        <Pill key={c} title="CNAE-2009">
                          CNAE {c}
                        </Pill>
                      ))}
                    </div>
                    {/* The keywords are the point of the table: this is the text
                        you paste into SABI to turn a thesis into a call list. */}
                    {a.sabi_keywords.length > 0 ? (
                      <p className="mt-2 font-mono text-[11px] text-ink-faint">
                        SABI: {a.sabi_keywords.join(', ')}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </>
          );
        })()
      ) : null}

      {view === 'empresas' ? (
        (() => {
          // Shared with `/v2/export` so the file always matches the list.
          const rows = filterCompanies(companies, params);
          return (
            <>
              <ImportSabi />
              <FilterBar
                base="/v2/sourcing"
                params={{ ...params, v: 'empresas' }}
                total={companies.length}
                showing={rows.length}
                right={<ExportCsv kind="empresas" params={params} />}
                filters={[
                  {
                    name: 'subsector',
                    label: 'Subsector',
                    options: options(tally(companies, (c) => c.subsector)),
                  },
                  {
                    name: 'archetype',
                    label: 'Arquetipo',
                    options: options(tally(companies, (c) => c.archetype)),
                  },
                  {
                    name: 'province',
                    label: 'Provincia',
                    options: options(tally(companies, (c) => c.province)),
                  },
                  {
                    name: 'source',
                    label: 'Fuente',
                    options: options(tally(companies, (c) => c.source)),
                  },
                ]}
              />
              <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                      <th className="px-3 py-2">Empresa</th>
                      <th className="px-3 py-2">Provincia</th>
                      <th className="px-3 py-2">Subsector</th>
                      <th className="px-3 py-2">Arquetipo</th>
                      <th className="px-3 py-2 text-right">Ventas est.</th>
                      <th className="px-3 py-2 text-right">EBITDA est.</th>
                      <th className="px-3 py-2">Origen</th>
                      <th className="px-3 py-2">Confianza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg-elevated">
                        <td className="px-3 py-2 font-medium text-ink">{c.name}</td>
                        <td className="px-3 py-2 text-xs text-ink-mute">
                          {c.province ?? DASH}
                          {c.autonomous_community ? (
                            <span className="text-ink-faint"> · {c.autonomous_community}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-ink-mute">{c.subsector ?? DASH}</td>
                        <td className="px-3 py-2 text-xs text-ink-mute">{c.archetype ?? DASH}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-ink">
                          {money(c.revenue_estimate_eur_m)}
                        </td>
                        {/* Blank, not 0. Their QA-20 is this cell. */}
                        <td className="px-3 py-2 text-right font-mono text-xs text-ink">
                          {money(c.ebitda_estimate_eur_m)}
                        </td>
                        <td className="px-3 py-2 text-xs text-ink-mute">{c.origin_type ?? DASH}</td>
                        <td className="px-3 py-2">
                          {c.source_confidence ? (
                            <Pill tone={c.source_confidence === 'Low' ? 'warn' : 'neutral'}>
                              {c.source_confidence}
                            </Pill>
                          ) : (
                            DASH
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()
      ) : null}

      {view === 'fuentes' ? (
        <>
          {/* The 22 sources have nothing to filter by, so this view gets the
              download link on its own instead of inside a FilterBar. */}
          <div className="mb-3 flex justify-end">
            <ExportCsv kind="fuentes" />
          </div>
          <Fuentes
            sources={sources}
            counts={companies.reduce<Record<string, number>>((out, c) => {
              if (c.source) out[c.source] = (out[c.source] ?? 0) + 1;
              return out;
            }, {})}
          />
        </>
      ) : null}
    </>
  );
}
