/**
 * The filters of the V2 catalogue screens, as pure functions.
 *
 * They live here instead of inline in each page because there are two consumers
 * now: the screen and the CSV download. V1 already shipped the bug these prevent
 * (`app/export/route.ts:51-54`): an export that forgets one of the screen's
 * filters hands someone a file with more rows than the list they were looking
 * at, and nothing on screen says so.
 *
 * Generic over the row shape rather than importing the `Ios*` interfaces, so the
 * tests can use three-field literals and this file stays independent of `db.ts`.
 */

export interface IndustryFilters {
  tier?: string;
  industry?: string;
  sector?: string;
}

export function filterIndustries<T extends { tier: string; industry: string; sector: string }>(
  rows: readonly T[],
  f: IndustryFilters,
): T[] {
  return rows.filter(
    (r) =>
      (!f.tier || r.tier === f.tier) &&
      (!f.industry || r.industry === f.industry) &&
      (!f.sector || r.sector === f.sector),
  );
}

/**
 * The subsector dropdown's own option for the 17 Cross-sector theses.
 *
 * They link to no subsector on purpose, so they cannot be reached by picking a
 * subsector, and they are the firm's broadest plays: without this option they
 * would be the one thing a subsector filter can never show.
 */
export const CROSS_SECTOR = '__cross';

export interface ThesisFilters {
  scope?: string;
  strategy?: string;
  priority?: string;
  subsector?: string;
}

export function filterTheses<
  T extends {
    scope: string;
    primary_strategy: string | null;
    priority: string | null;
    subsectors: readonly string[];
  },
>(rows: readonly T[], f: ThesisFilters): T[] {
  return rows.filter(
    (t) =>
      (!f.scope || t.scope === f.scope) &&
      (!f.strategy || t.primary_strategy === f.strategy) &&
      (!f.priority || t.priority === f.priority) &&
      (!f.subsector || f.subsector === CROSS_SECTOR || t.subsectors.includes(f.subsector)) &&
      (f.subsector !== CROSS_SECTOR || t.subsectors.length === 0),
  );
}

export interface ArchetypeFilters {
  subsector?: string;
  role?: string;
}

export function filterArchetypes<T extends { subsector: string | null; pe_role: string | null }>(
  rows: readonly T[],
  f: ArchetypeFilters,
): T[] {
  return rows.filter(
    (a) =>
      (!f.subsector || a.subsector === f.subsector) && (!f.role || a.pe_role === f.role),
  );
}

export interface CompanyFilters {
  subsector?: string;
  archetype?: string;
  province?: string;
  source?: string;
}

export function filterCompanies<
  T extends {
    subsector: string | null;
    archetype: string | null;
    province: string | null;
    source: string | null;
  },
>(rows: readonly T[], f: CompanyFilters): T[] {
  return rows.filter(
    (c) =>
      (!f.subsector || c.subsector === f.subsector) &&
      (!f.archetype || c.archetype === f.archetype) &&
      (!f.province || c.province === f.province) &&
      (!f.source || c.source === f.source),
  );
}
