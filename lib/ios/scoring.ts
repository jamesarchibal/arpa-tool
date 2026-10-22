/**
 * ARPA's three gate scores, as the IOS v9 `Scoring_Model` sheet defines them.
 *
 * Sixteen criteria across three gates, each rated 1-5 by a person, each with the
 * sheet's own weight, reported on 0-100. Plus the 13 kill criteria from
 * `Funnel_Stages`, verbatim, as vetoes.
 *
 * Two deliberate differences from V1's `lib/arpa/scoring.ts`, both because V2 is
 * their model and not ours:
 *
 *  1. **No derived ratings.** V1 computes most of the sixteen from financials
 *     (revenue series, net debt, capex, entry multiple). `ios_projects` has no
 *     financial columns at all, because per-period Financials is out of V2's
 *     scope, so there is nothing to derive from. Their sheet asks a human for
 *     all sixteen anyway: the derivation was ours, and it is the part that
 *     needed their sign-off.
 *  2. **A gate score is blank until every criterion is rated**, which is what
 *     their `Field_Dictionary` formula says. V1 renormalises over the weight that
 *     had data behind it, so a gate answered 30% of the way could report 90/100
 *     and outrank a fully diligenced 82. Without derivation that failure mode is
 *     not worth inheriting: an unfinished score here is simply absent.
 *
 * The 0-100 scale is the weighted 1-5 mean times 20, which is how their workbook
 * arrives at `Overall Project Score = 78`.
 *
 * Pure functions only. No I/O, no React, no database. `scoring.test.ts` pins the
 * weights and the arithmetic.
 */

import type { PassLostReason, Stage } from './lists.ts';

export type ModelId = 'qss' | 'om' | 'pfr';

export interface ScoringCriterion {
  id: string;
  name: string;
  detail: string;
  /** their weight, 0-100 within its own gate */
  weight: number;
  /** the Pass / Lost Reason to propose when this criterion is what sinks the deal */
  reason: PassLostReason | null;
}

export interface ScoringModel {
  id: ModelId;
  /** their name for the score field on `Projects` */
  name: string;
  /** the stage whose gate this score answers */
  stage: Stage;
  question: string;
  /** the gate wording from `Funnel_Stages`, indexed by [proceed, monitor, pass] */
  options: [string, string, string];
  criteria: ScoringCriterion[];
}

/** `Scoring_Model`, the three gates and their sixteen criteria. */
export const SCORING_MODELS: ScoringModel[] = [
  {
    id: 'qss',
    name: 'QSS Score',
    stage: 'Screening',
    question: '¿Merece una llamada?',
    options: ['Proceed', 'Monitor', 'Pass'],
    criteria: [
      { id: 'geo', name: 'Encaje geográfico', detail: 'España; Iberia opcional.', weight: 10, reason: null },
      { id: 'ebit', name: 'Encaje de EBITDA', detail: 'Probable 1-5 M€ de EBITDA.', weight: 20, reason: 'Size Outside Mandate' },
      { id: 'sec', name: 'Encaje sectorial', detail: 'Agribusiness / Industrial Products.', weight: 15, reason: 'Sector / Thesis Fit' },
      { id: 'own', name: 'Encaje de propiedad', detail: 'Ángulo de fundador, familia o sucesión.', weight: 15, reason: 'Ownership Not Ready' },
      { id: 'bq', name: 'Calidad del negocio', detail: 'Nicho, márgenes, calidad de cliente.', weight: 20, reason: 'Business Quality' },
      { id: 'deal', name: 'Dealability', detail: 'Motivación del vendedor y expectativa de precio.', weight: 20, reason: 'Valuation Gap' },
    ],
  },
  {
    id: 'om',
    name: 'OM Score',
    stage: 'Assessment',
    question: '¿Merece esfuerzo serio?',
    options: ['Continue', 'Monitor', 'Pass'],
    criteria: [
      { id: 'mkt', name: 'Atractivo del mercado', detail: 'Crecimiento, fragmentación y densidad del subsector.', weight: 20, reason: 'Business Quality' },
      { id: 'pos', name: 'Posicionamiento', detail: 'Diferenciación, liderazgo de nicho, exportación.', weight: 20, reason: 'Business Quality' },
      { id: 'fin', name: 'Perfil financiero', detail: 'Márgenes, crecimiento, señales de conversión de caja.', weight: 20, reason: 'Financials / EBITDA Quality' },
      { id: 'alig', name: 'Alineación comprador-vendedor', detail: 'Hueco de valoración y motivación del vendedor.', weight: 20, reason: 'Valuation Gap' },
      { id: 'risk', name: 'Perfil de riesgo', detail: 'Ausencia de deal-breakers evidentes.', weight: 20, reason: 'Business Quality' },
    ],
  },
  {
    id: 'pfr',
    name: 'PFR Score',
    stage: 'Preliminary Financial Review',
    question: '¿Nos fiamos del EBITDA?',
    options: ['Build Investment Case', 'Reprice', 'Pass'],
    criteria: [
      { id: 'cred', name: 'Credibilidad del EBITDA', detail: 'Confianza entre reportado y normalizado.', weight: 30, reason: 'Financials / EBITDA Quality' },
      { id: 'cash', name: 'Conversión de caja', detail: 'El EBITDA se convierte en caja tras capex y circulante.', weight: 20, reason: 'Financials / EBITDA Quality' },
      { id: 'revq', name: 'Calidad de los ingresos', detail: 'Ingreso recurrente o estable, sin extraordinarios.', weight: 20, reason: 'Financials / EBITDA Quality' },
      { id: 'debt', name: 'Deuda y pasivos', detail: 'Sin deuda oculta ni pasivos inusuales.', weight: 15, reason: 'Financials / EBITDA Quality' },
      { id: 'dq', name: 'Calidad del dato', detail: 'Fiabilidad de la información financiera recibida.', weight: 15, reason: 'Financials / EBITDA Quality' },
    ],
  },
];

export interface KillCriterion {
  id: string;
  model: ModelId;
  text: string;
  reason: PassLostReason | null;
}

/**
 * `Funnel_Stages` · Kill Criteria, broken out one by one. In V1 ten of these had
 * a data-side detector that raised them automatically. Here they are ticks: with
 * no financials there is nothing to detect, and a tick that a person took
 * responsibility for is the only honest kind.
 */
export const KILL_CRITERIA: KillCriterion[] = [
  { id: 'k1', model: 'qss', text: 'Fuera de España.', reason: 'Sector / Thesis Fit' },
  { id: 'k2', model: 'qss', text: 'Claramente fuera del rango de EBITDA.', reason: 'Size Outside Mandate' },
  { id: 'k3', model: 'qss', text: 'Sector no objetivo.', reason: 'Sector / Thesis Fit' },
  { id: 'k4', model: 'qss', text: 'Calidad obviamente baja o sin ángulo de transacción.', reason: 'Business Quality' },

  { id: 'k5', model: 'om', text: 'Sin solape de valoración.', reason: 'Valuation Gap' },
  { id: 'k6', model: 'om', text: 'Mercado débil.', reason: 'Business Quality' },
  { id: 'k7', model: 'om', text: 'Motivación del vendedor poco convincente.', reason: 'Ownership Not Ready' },
  { id: 'k8', model: 'om', text: 'Mala calidad del negocio.', reason: 'Business Quality' },
  { id: 'k9', model: 'om', text: 'Red flags altas.', reason: 'Business Quality' },

  { id: 'k10', model: 'pfr', text: 'EBITDA sobreestimado de forma material.', reason: 'Financials / EBITDA Quality' },
  { id: 'k11', model: 'pfr', text: 'Mala conversión de caja.', reason: 'Financials / EBITDA Quality' },
  { id: 'k12', model: 'pfr', text: 'Deuda o pasivos ocultos.', reason: 'Financials / EBITDA Quality' },
  { id: 'k13', model: 'pfr', text: 'Transparencia financiera insuficiente.', reason: 'Financials / EBITDA Quality' },
];

/** 0-100. At or above this a gate reads Proceed. Their workbook's threshold. */
export const PROCEED_AT = 80;
/** 0-100. At or above this a gate reads Monitor. Below it, Pass. */
export const MONITOR_AT = 60;

/** `${model}_${criterion}`, the key ratings are stored under. */
export function criterionKey(model: ModelId, criterionId: string): string {
  return `${model}_${criterionId}`;
}

/** criterion key -> 1-5. A key that is absent is a criterion nobody rated yet. */
export type Ratings = Record<string, number>;

export interface CriterionResult {
  key: string;
  id: string;
  name: string;
  detail: string;
  weight: number;
  /** 1-5, or null when nobody has rated it */
  rating: number | null;
  reason: PassLostReason | null;
}

export interface ModelResult {
  id: ModelId;
  name: string;
  stage: Stage;
  question: string;
  /** true once all of this gate's criteria carry a rating */
  complete: boolean;
  /** 0-100, or null while the gate is incomplete */
  score: number | null;
  /** names of the criteria still unrated */
  missing: string[];
  /** 0 proceed, 1 monitor, 2 pass, -1 no verdict yet */
  outcome: -1 | 0 | 1 | 2;
  verdict: string;
  vetoed: boolean;
  vetoes: KillCriterion[];
  criteria: CriterionResult[];
  /** criteria rated 2 or below, worst first */
  weakest: CriterionResult[];
}

export interface ProjectScore {
  models: ModelResult[];
  /** mean of the completed gates. Their sheet gives no inter-gate weights. */
  overall: number | null;
  /** the gate a human last finished, or null when none is finished */
  furthest: ModelResult | null;
  kills: KillCriterion[];
  /** the Pass / Lost Reason to propose, drawn only from their 12 values */
  suggestedReason: PassLostReason | null;
  suggestedReasonSource: string | null;
}

const clampRating = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

export function scoreProject(ratings: Ratings, flagged: string[] = []): ProjectScore {
  const ticked = new Set(flagged);
  const kills = KILL_CRITERIA.filter((k) => ticked.has(k.id));

  const models: ModelResult[] = SCORING_MODELS.map((M) => {
    let acc = 0;
    let weightSum = 0;
    const missing: string[] = [];

    const criteria: CriterionResult[] = M.criteria.map((c) => {
      const key = criterionKey(M.id, c.id);
      const raw = ratings[key];
      const rating =
        typeof raw === 'number' && Number.isFinite(raw) ? clampRating(raw) : null;

      weightSum += c.weight;
      if (rating === null) missing.push(c.name);
      else acc += c.weight * rating;

      return { key, id: c.id, name: c.name, detail: c.detail, weight: c.weight, rating, reason: c.reason };
    });

    const complete = missing.length === 0;
    // Blank until every criterion is rated: their rule, not a renormalisation.
    const score = complete && weightSum > 0 ? Math.round((acc / weightSum) * 20) : null;

    const vetoes = kills.filter((k) => k.model === M.id);
    const vetoed = vetoes.length > 0;

    let outcome: -1 | 0 | 1 | 2;
    if (vetoed) outcome = 2;
    else if (score === null) outcome = -1;
    else outcome = score >= PROCEED_AT ? 0 : score >= MONITOR_AT ? 1 : 2;

    const weakest = criteria
      .filter((c) => c.rating !== null && c.rating <= 2)
      .sort((a, b) => (a.rating as number) - (b.rating as number) || b.weight - a.weight);

    return {
      id: M.id,
      name: M.name,
      stage: M.stage,
      question: M.question,
      complete,
      score,
      missing,
      outcome,
      verdict: outcome === -1 ? 'Sin puntuar' : M.options[outcome],
      vetoed,
      vetoes,
      criteria,
      weakest,
    };
  });

  const done = models.filter((m) => m.score !== null);
  const overall = done.length
    ? Math.round(done.reduce((a, m) => a + (m.score as number), 0) / done.length)
    : null;

  // The deal stops at the first gate that says Pass, so walk the three in funnel
  // order rather than reading whichever one happens to be filled in.
  let furthest: ModelResult | null = null;
  for (const m of models) {
    if (m.score !== null || m.vetoed) furthest = m;
    if (m.outcome === 2) break;
  }

  let suggestedReason: PassLostReason | null = null;
  let suggestedReasonSource: string | null = null;

  if (models.some((m) => m.outcome === 2)) {
    const killWithReason = kills.find((k) => k.reason);
    if (killWithReason) {
      suggestedReason = killWithReason.reason;
      suggestedReasonSource = `criterio de descarte: ${killWithReason.text.replace(/\.$/, '')}`;
    } else {
      const weak = models.flatMap((m) => m.weakest).find((c) => c.reason);
      if (weak) {
        suggestedReason = weak.reason;
        suggestedReasonSource = `criterio más débil: ${weak.name.toLowerCase()} = ${weak.rating}`;
      }
    }
  }

  return { models, overall, furthest, kills, suggestedReason, suggestedReasonSource };
}

/** Every valid rating key, for validating what a form posts. */
export const RATING_KEYS: string[] = SCORING_MODELS.flatMap((M) =>
  M.criteria.map((c) => criterionKey(M.id, c.id)),
);

export const KILL_IDS: string[] = KILL_CRITERIA.map((k) => k.id);
