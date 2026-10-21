/**
 * Turns a parsed SABI export into long-list rows for `ios_companies`.
 *
 * Ignasi's own architecture (S09, A17) says the SABI path cannot be an Airtable
 * automation: "para Excel de SABI la lectura, el mapeo y la vista previa los hace
 * el Company Import Agent (Claude Code / Cowork por la API de Airtable)". That is
 * the one place where his design needs a second product to work at all, so V2
 * doing it in-app is the comparison worth showing. The reading half already
 * exists and is tested: `lib/arpa/sabi-xls.ts`, reused as is, V1 untouched.
 *
 * This module is only the mapping half, and it is pure so it can be tested
 * without a database. Four decisions in it are worth defending:
 *
 * 1. Money arrives in EUROS and `ios_companies` stores MILLIONS. The conversion
 *    lives here, next to the parser that produced the figure, because getting it
 *    wrong does not throw: it just makes every company look a million times
 *    bigger and sails through the 1-5 M€ mandate band.
 *
 * 2. A blank figure stays NULL, never 0. That is his QA-20 and it is the
 *    difference between "we have not measured it" and "it is tiny".
 *
 * 3. The subsector and the archetype are mapped from the CNAE code against
 *    `ios_archetypes.cnae_codes`, and ONLY when exactly one archetype claims the
 *    code. Half his archetypes share 7120 (testing and inspection), so a
 *    first-match rule would file companies under a confident wrong archetype.
 *    Ambiguous is left empty for a human, which is visible; a guess is not.
 *
 * 4. Nothing is overwritten with an empty, which is his A17 rule verbatim.
 */

/** `ios_companies.origin_type` for anything that came out of SABI. */
export const SABI_ORIGIN = 'Database (SABI / Informa)';

/** The `ios_sources` row every imported company points at. Created on demand. */
export const SABI_SOURCE_NAME = 'SABI';

/** The subset of `SabiCompany` this mapping reads. */
export interface SabiRow {
  legal_name: string;
  region: string | null;
  cnae: string | null;
  revenue: (number | null)[];
  ebitda: (number | null)[];
  notes: string | null;
}

/** What goes into `ios_companies`, minus the foreign keys. */
export interface LongListDraft {
  name: string;
  province: string | null;
  /** The bare 4-digit CNAE, used to look up the archetype. Not a column. */
  cnae: string | null;
  revenue_estimate_eur_m: number | null;
  ebitda_estimate_eur_m: number | null;
  research_notes: string | null;
}

/** Accent-free, single-spaced lowercase. SABI shouts, his sheet does not. */
function norm(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The last reported year of a SABI series, which comes out ascending. */
export function latestOf(xs: readonly (number | null)[]): number | null {
  for (let i = xs.length - 1; i >= 0; i -= 1) {
    if (xs[i] !== null) return xs[i];
  }
  return null;
}

/** Euros to millions with two decimals, the precision of the column. */
export function eurToMillions(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return Math.round((v / 1_000_000) * 100) / 100;
}

/**
 * The 4-digit code out of what the parser scraped, e.g.
 * `"2822 Fabricación de maquinaria"` to `"2822"`. A 3-digit CNAE is a group and
 * not a class, so it cannot match an archetype and is dropped.
 */
export function cnaeCode(raw: string | null): string | null {
  const m = (raw ?? '').match(/\b(\d{4})\b/);
  return m ? m[1] : null;
}

/**
 * SABI prints the province as `TARRAGONA`, his long list says `Tarragona`. We
 * match against the spellings already in the table instead of carrying a list of
 * the 52 provinces: his data is the authority on how they are written here, and
 * an unmatched province is kept verbatim rather than thrown away.
 */
export function matchProvince(
  raw: string | null,
  known: readonly string[],
): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const target = norm(value);
  return known.find((k) => norm(k) === target) ?? value;
}

export function toLongListDraft(
  row: SabiRow,
  knownProvinces: readonly string[],
): LongListDraft {
  return {
    name: row.legal_name.trim(),
    province: matchProvince(row.region, knownProvinces),
    cnae: cnaeCode(row.cnae),
    revenue_estimate_eur_m: eurToMillions(latestOf(row.revenue)),
    ebitda_estimate_eur_m: eurToMillions(latestOf(row.ebitda)),
    research_notes: row.notes?.trim() || null,
  };
}

/**
 * The archetype whose CNAE list claims this code, or null when zero or several
 * do. See decision 3 in the header: several is the common case, not the edge.
 */
export function pickArchetype<T extends { id: string; cnae_codes: readonly string[] }>(
  code: string | null,
  archetypes: readonly T[],
): T | null {
  if (!code) return null;
  const hits = archetypes.filter((a) => a.cnae_codes.includes(code));
  return hits.length === 1 ? hits[0] : null;
}

/** The subset of an existing row that decides what an import may touch. */
export interface ExistingCompany {
  province: string | null;
  revenue_estimate_eur_m: number | null;
  ebitda_estimate_eur_m: number | null;
  research_notes: string | null;
  archetype_id: string | null;
  industry_id: string | null;
}

/**
 * What to write over an existing company. Empty when there is nothing to add,
 * so the caller can skip the update entirely.
 *
 * Two rules, and they differ on purpose. A figure or a province from SABI wins
 * over whatever a web directory estimated, because SABI is a filed account. The
 * research notes do not: they are what a person wrote, and an import that
 * replaced them would delete work. Either way a NULL from SABI never lands,
 * which is his A17 rule.
 */
export function fillPatch(
  existing: ExistingCompany,
  draft: LongListDraft,
  archetype: { id: string; industry_id: string | null } | null,
): Partial<ExistingCompany> {
  const patch: Partial<ExistingCompany> = {};

  if (draft.province !== null && draft.province !== existing.province) {
    patch.province = draft.province;
  }
  if (
    draft.revenue_estimate_eur_m !== null &&
    draft.revenue_estimate_eur_m !== existing.revenue_estimate_eur_m
  ) {
    patch.revenue_estimate_eur_m = draft.revenue_estimate_eur_m;
  }
  if (
    draft.ebitda_estimate_eur_m !== null &&
    draft.ebitda_estimate_eur_m !== existing.ebitda_estimate_eur_m
  ) {
    patch.ebitda_estimate_eur_m = draft.ebitda_estimate_eur_m;
  }
  if (draft.research_notes !== null && !existing.research_notes) {
    patch.research_notes = draft.research_notes;
  }
  if (archetype && !existing.archetype_id) {
    patch.archetype_id = archetype.id;
    if (archetype.industry_id && !existing.industry_id) {
      patch.industry_id = archetype.industry_id;
    }
  }

  return patch;
}
