/**
 * Subsector attractiveness, ARPA's own model from the `Seed_Industries` sheet.
 *
 * This is NOT the deal scoring in `lib/arpa/scoring.ts`. That one rates a
 * company at a gate (QSS, OM, PFR). This one rates a *market*: eight criteria
 * from 1 to 5, a weighted average from 1 to 5, and a tier A/B/C that decides
 * where proactive sourcing points. V1 had 21 made-up rows with H/M/L letters and
 * a pre-score we invented; these are their 100 real rows with their real weights.
 *
 * The score and the tier are derived HERE and nowhere else. `ios_industries`
 * stores the eight ratings and no score column on purpose: a stored copy is a
 * second implementation, and two implementations drift.
 */

/**
 * The eight criteria, in the sheet's column order, with their weights.
 *
 * `key` is the column in `ios_industries`. `risk_low_is_5` is spelled out
 * because the sheet calls it "Risk (5 = low)" and the inversion is the kind of
 * thing that gets silently flipped: a 5 means LOW risk, so high is good, like
 * every other criterion.
 */
export const INDUSTRY_CRITERIA = [
  { key: 'market_growth', label: 'Crecimiento de mercado', weight: 0.15 },
  { key: 'fragmentation_addons', label: 'Fragmentación / add-ons', weight: 0.15 },
  { key: 'target_density', label: 'Densidad de objetivos', weight: 0.15 },
  { key: 'margin_profile', label: 'Perfil de márgenes', weight: 0.15 },
  { key: 'recurring_revenue', label: 'Ingreso recurrente', weight: 0.1 },
  { key: 'barriers', label: 'Barreras / diferenciación', weight: 0.1 },
  { key: 'succession', label: 'Sucesión / salida del fundador', weight: 0.1 },
  { key: 'risk_low_is_5', label: 'Riesgo (5 = bajo)', weight: 0.1 },
] as const;

export type IndustryCriterionKey = (typeof INDUSTRY_CRITERIA)[number]['key'];

export type IndustryRatings = Record<IndustryCriterionKey, number>;

export type IndustryTier = 'A' | 'B' | 'C';

/**
 * Their thresholds, from the `Tier (check)` column: A from 3,75, B from 3,25,
 * everything else C.
 */
export const TIER_FLOOR = { A: 3.75, B: 3.25 } as const;

/**
 * The weighted average, 1 to 5, rounded to two decimals.
 *
 * The rounding is load-bearing, not cosmetic. `Electrical equipment /
 * switchgear / transformers` sums to 3.7499999999999996 in binary floating
 * point, so an unrounded `>= 3.75` demotes it to B where ARPA's own sheet says
 * A. Round first and all 100 rows match their numbers exactly.
 */
export function industryScore(ratings: IndustryRatings): number {
  let total = 0;
  for (const { key, weight } of INDUSTRY_CRITERIA) {
    const rating = ratings[key];
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error(`${key}: expected a rating from 1 to 5, got ${rating}`);
    }
    total += rating * weight;
  }
  return Math.round(total * 100) / 100;
}

export function industryTier(score: number): IndustryTier {
  if (score >= TIER_FLOOR.A) return 'A';
  if (score >= TIER_FLOOR.B) return 'B';
  return 'C';
}
