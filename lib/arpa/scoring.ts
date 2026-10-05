/**
 * ARPA Partners · screening and scoring engine.
 *
 * Port of the calculator published at joblanders.ai/arpa, moved server-side so
 * the database and the UI share one implementation. Pure functions, no DOM, no
 * I/O: everything here is a function of its inputs, which is what makes it
 * testable (see scoring.test.ts, which pins it to known outputs).
 *
 * Faithful to the ARPA workbook v4:
 *   - 16 criteria across three gates, with the sheet's own weights
 *   - the 13 Kill Criteria from Funnel_Stages, verbatim, as vetoes
 *   - the Valuation formula chain: EV = EBITDA_ref x Entry Multiple,
 *     Equity = EV - Net Debt, Valuation Gap = Seller Expectation - EV
 *   - Pass / Lost Reason drawn only from their 7 allowed values
 *
 * Scale: criteria are scored 1-5 because the Scoring_Model sheet is built that
 * way. Totals are reported on 0-100 (= weighted 1-5 mean x 20), which is the
 * scale ARPA chose on 2026-10-03 and matches the `Overall Project Score = 78`
 * already in their workbook.
 *
 * Two things in here are OURS, not theirs, and are marked so they are easy to
 * argue with: GEO_FIT and OWNERSHIP_FIT translate controlled-list values into a
 * 1-5 fit score. The workbook asks a human for those two numbers. Deriving them
 * keeps the form shorter but the mapping needs ARPA's sign-off.
 */

export type Letter = 'H' | 'M' | 'L';
export type TaxonomyFit = 'in' | 'adjacent' | 'out';
export type Concentration = 'low' | 'mid' | 'high';
export type Confidence = 'Low' | 'Medium' | 'High';

export type OwnershipType =
  | 'Founder-owned'
  | 'Family-owned'
  | 'Private equity'
  | 'Corporate subsidiary'
  | 'Public'
  | 'Unknown';

/** Projects · Pass / Lost Reason. The only 7 values their single select allows. */
export type PassReason =
  | 'Too small'
  | 'Weak business'
  | 'Price gap'
  | 'Financial issue'
  | 'Seller not ready'
  | 'Lost to competitor'
  | 'Other';

export type ModelId = 'qss' | 'om' | 'pfr';

/**
 * Funnel_Stages, in blueprint order. The blueprint names nine; `Sourcing` sits
 * in front because origination promotes into it, and `Closed` is terminal.
 * Mirrored by the arpa_projects_stage_check constraint, so the two must be
 * changed together.
 */
export const STAGES = [
  'Sourcing',
  'Screening',
  'Assessment',
  'Preliminary Financial Review',
  'Investment Case',
  'LOI & Exclusivity',
  'Full Due Diligence',
  'Final Investment Approval',
  'Closing',
  'Portfolio',
  'Closed',
] as const;

export type Stage = (typeof STAGES)[number];

export interface TaxonomyRow {
  sector: string;
  category: string;
  subsector: string;
  growth: Letter;
  fragmentation: Letter;
  consolidation: Letter;
}

/** Everything the engine needs. Money is millions of EUR throughout. */
export interface ScoringInput {
  country: string | null;
  ownershipType: OwnershipType | null;
  taxonomyFit: TaxonomyFit;
  taxonomy: TaxonomyRow | null;

  /** oldest to most recent */
  revenue: [number | null, number | null, number | null];
  ebitda: [number | null, number | null, number | null];
  ebitdaNorm: number | null;
  capex: number | null;
  workingCapital: number | null;
  netDebt: number | null;
  /** share of revenue that is recurring, 0-100 */
  recurringPct: number | null;
  customerConc: Concentration | null;
  /** seller motivation, 1-5, a human judgement the data cannot supply */
  sellerMotiv: number | null;
  dataConfidence: Confidence | null;

  entryMultiple: number | null;
  sellerExpEv: number | null;
}

export interface ScoringOptions {
  /** 0-100. At or above this a gate opens. */
  proceedAt?: number;
  /** 0-100. At or above this a gate says Monitor. Below it, Pass. */
  monitorAt?: number;
  /** criterion key -> 1-5, replacing the derived score */
  manual?: Record<string, number | null>;
  /** criterion key -> 0-100 weight, replacing the blueprint weight */
  weights?: Record<string, number>;
  /** kill ids a human has ticked. These veto regardless of the data. */
  flagged?: string[];
  /** treat data-detected kill criteria as vetoes too. Default false: advisory only. */
  blockOnSuggested?: boolean;
}

/* ─────────────────────────────── reference data ────────────────────────────── */

/** Industry_Taxonomy, 20 rows, verbatim. Mirrors the arpa_taxonomy seed. */
export const TAXONOMY: TaxonomyRow[] = (
  [
    ['Agribusiness', 'Primary Agriculture', 'Olives / olive oil farming', 'M', 'M', 'M'],
    ['Agribusiness', 'Primary Agriculture', 'Citrus / fruit production', 'M', 'H', 'M'],
    ['Agribusiness', 'Agricultural Inputs', 'Fertilizers / soil enhancers', 'M', 'M', 'H'],
    ['Agribusiness', 'Agricultural Inputs', 'Biological inputs / biostimulants', 'H', 'M', 'H'],
    ['Agribusiness', 'Irrigation & Water', 'Drip irrigation systems', 'H', 'M', 'H'],
    ['Agribusiness', 'Irrigation & Water', 'Pumps / filtration / dosing', 'H', 'M', 'H'],
    ['Agribusiness', 'Agri Equipment', 'Specialized farm machinery', 'M', 'H', 'M'],
    ['Agribusiness', 'Agri Processing', 'Olive oil mills / processing', 'M', 'M', 'M'],
    ['Agribusiness', 'Agri Processing', 'Fruit / vegetable processing', 'M', 'M', 'M'],
    ['Agribusiness', 'Agri Services', 'Testing / certification / agronomic services', 'H', 'M', 'H'],
    ['Industrial Products', 'Industrial Components', 'Precision machined parts', 'M', 'H', 'M'],
    ['Industrial Products', 'Industrial Components', 'Valves / pumps / hydraulic systems', 'M', 'M', 'H'],
    ['Industrial Products', 'Manufacturing', 'Metal fabrication / stamping', 'L', 'H', 'M'],
    ['Industrial Products', 'Manufacturing', 'Technical plastics / injection molding', 'M', 'M', 'M'],
    ['Industrial Products', 'Packaging', 'Industrial packaging', 'M', 'M', 'H'],
    ['Industrial Products', 'Packaging', 'Food/agri packaging', 'M', 'M', 'H'],
    ['Industrial Products', 'Specialized Machinery', 'Food processing machinery', 'M', 'M', 'H'],
    ['Industrial Products', 'Specialized Machinery', 'Packaging machinery', 'M', 'M', 'H'],
    ['Industrial Products', 'Environmental Products', 'Filtration / recycling / waste systems', 'H', 'M', 'H'],
    ['Industrial Products', 'Energy Products', 'Electrical cabinets / solar mounting', 'M', 'M', 'M'],
  ] as const
).map((r) => ({
  sector: r[0],
  category: r[1],
  subsector: r[2],
  growth: r[3] as Letter,
  fragmentation: r[4] as Letter,
  consolidation: r[5] as Letter,
}));

const LETTER_SCORE: Record<Letter, number> = { H: 5, M: 3, L: 1 };

/**
 * OURS, not the blueprint's. The mandate is Spain, with Iberia optional, so
 * Portugal scores as a near fit and everything else falls out. Kill criterion
 * k1 ("Fuera de España") fires at 2 or below.
 */
const GEO_FIT: Record<string, number> = { ES: 5, PT: 4 };
const GEO_FIT_OTHER = 1;

/**
 * OURS, not the blueprint's. The mandate wants a founder, family or succession
 * angle, so a sponsor-owned or listed asset is a poor fit even when the numbers
 * work. Unknown sits in the middle rather than penalising an early lead.
 */
const OWNERSHIP_FIT: Record<OwnershipType, number> = {
  'Founder-owned': 5,
  'Family-owned': 5,
  'Corporate subsidiary': 3,
  Unknown: 3,
  'Private equity': 2,
  Public: 1,
};

const CONFIDENCE_SCORE: Record<Confidence, number> = { Low: 1, Medium: 3, High: 5 };

/* ──────────────────────────────── derivation ───────────────────────────────── */

export interface Derived {
  revenue: (number | null)[];
  ebitda: (number | null)[];
  /** normalised EBITDA if given, else the most recent reported year */
  ebitdaRef: number | null;
  revenueCagr: number | null;
  ebitdaMargin: number | null;
  /** (reported - normalised) / |reported|. Positive means reported was flattering. */
  normalisationGap: number | null;
  cashConversion: number | null;
  leverage: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  /** seller expectation minus our EV, in €M */
  valuationGapM: number | null;
  /** the same gap as a fraction of our EV */
  valuationGapPct: number | null;
  /** the multiple the seller is implicitly asking for */
  askMultiple: number | null;
}

export function derive(i: ScoringInput): Derived {
  const r = i.revenue;
  const e = i.ebitda;
  const ebitdaRef = i.ebitdaNorm ?? e[2];

  const revenueCagr =
    r[0] !== null && r[2] !== null && r[0] > 0 ? Math.pow(r[2] / r[0], 0.5) - 1 : null;

  const ebitdaMargin = e[2] !== null && r[2] !== null && r[2] > 0 ? e[2] / r[2] : null;

  const normalisationGap =
    e[2] !== null && i.ebitdaNorm !== null && e[2] !== 0
      ? (e[2] - i.ebitdaNorm) / Math.abs(e[2])
      : null;

  const cashConversion =
    ebitdaRef !== null && ebitdaRef > 0 && i.capex !== null
      ? (ebitdaRef - i.capex - (i.workingCapital ?? 0)) / ebitdaRef
      : null;

  const leverage =
    i.netDebt !== null && ebitdaRef !== null && ebitdaRef > 0 ? i.netDebt / ebitdaRef : null;

  // Valuation table formula chain, workbook v4.
  const enterpriseValue =
    ebitdaRef !== null && i.entryMultiple !== null ? ebitdaRef * i.entryMultiple : null;
  const equityValue =
    enterpriseValue !== null && i.netDebt !== null ? enterpriseValue - i.netDebt : null;
  const valuationGapM =
    i.sellerExpEv !== null && enterpriseValue !== null ? i.sellerExpEv - enterpriseValue : null;
  const valuationGapPct =
    valuationGapM !== null && enterpriseValue !== null && enterpriseValue > 0
      ? valuationGapM / enterpriseValue
      : null;
  const askMultiple =
    i.sellerExpEv !== null && ebitdaRef !== null && ebitdaRef > 0 ? i.sellerExpEv / ebitdaRef : null;

  return {
    revenue: r,
    ebitda: e,
    ebitdaRef,
    revenueCagr,
    ebitdaMargin,
    normalisationGap,
    cashConversion,
    leverage,
    enterpriseValue,
    equityValue,
    valuationGapM,
    valuationGapPct,
    askMultiple,
  };
}

const clamp = (n: number) => Math.max(1, Math.min(5, n));

function marginScore(m: number): number {
  return m >= 0.18 ? 5 : m >= 0.13 ? 4 : m >= 0.09 ? 3 : m >= 0.05 ? 2 : 1;
}

type AutoFn = (i: ScoringInput, d: Derived) => number | null;

/** Data-driven 1-5 scorers. A null means the data cannot answer it yet. */
const AUTO: Record<string, AutoFn> = {
  geo: (i) => (i.country ? (GEO_FIT[i.country.toUpperCase()] ?? GEO_FIT_OTHER) : null),

  sector: (i) => (i.taxonomyFit === 'out' ? 1 : i.taxonomyFit === 'adjacent' ? 3 : 5),

  own: (i) => (i.ownershipType ? OWNERSHIP_FIT[i.ownershipType] : null),

  dataQual: (i) => (i.dataConfidence ? CONFIDENCE_SCORE[i.dataConfidence] : null),

  market: (i) => {
    const t = i.taxonomy;
    if (!t) return null;
    return clamp(
      Math.round(
        (LETTER_SCORE[t.growth] + LETTER_SCORE[t.fragmentation] + LETTER_SCORE[t.consolidation]) / 3,
      ),
    );
  },

  // The mandate is 1-5 M€ of EBITDA. Scores taper either side rather than
  // cliff-edging, so a 5.5 M€ business is "near fit", not "out".
  ebitdaFit: (_i, d) => {
    const v = d.ebitdaRef;
    if (v === null) return null;
    if (v >= 1 && v <= 5) return 5;
    if ((v >= 0.8 && v < 1) || (v > 5 && v <= 6)) return 4;
    if ((v >= 0.6 && v < 0.8) || (v > 6 && v <= 8)) return 3;
    if ((v >= 0.4 && v < 0.6) || (v > 8 && v <= 12)) return 2;
    return 1;
  },

  quality: (i, d) => {
    if (d.ebitdaMargin === null) return null;
    let s = marginScore(d.ebitdaMargin);
    if (i.customerConc === 'high') s -= 1;
    return clamp(Math.round(s));
  },

  valAlign: (_i, d) => {
    const g = d.valuationGapPct;
    if (g === null) return null;
    return g <= 0 ? 5 : g <= 0.1 ? 4 : g <= 0.25 ? 3 : g <= 0.5 ? 2 : 1;
  },

  deal: (i, d) => {
    const mo = i.sellerMotiv;
    const v = AUTO.valAlign(i, d);
    if (mo === null) return v;
    if (v === null) return mo;
    return clamp(Math.round((mo + v) / 2));
  },

  finProfile: (_i, d) => {
    if (d.ebitdaMargin === null) return null;
    let s = marginScore(d.ebitdaMargin);
    if (d.revenueCagr !== null) {
      if (d.revenueCagr >= 0.08) s += 1;
      else if (d.revenueCagr < 0) s -= 1;
    }
    if (d.cashConversion !== null && d.cashConversion < 0.4) s -= 1;
    return clamp(Math.round(s));
  },

  risk: (i, d) => {
    let s = 5;
    if (i.customerConc === 'high') s -= 2;
    else if (i.customerConc === 'mid') s -= 1;
    if (d.leverage !== null && d.leverage > 3) s -= 1;
    if (d.normalisationGap !== null && d.normalisationGap > 0.2) s -= 1;
    const dq = AUTO.dataQual(i, d);
    if (dq !== null && dq <= 2) s -= 1;
    return clamp(s);
  },

  ebCred: (i, d) => {
    if (d.normalisationGap === null) return null;
    const g = Math.abs(d.normalisationGap);
    const s = g <= 0.05 ? 5 : g <= 0.1 ? 4 : g <= 0.2 ? 3 : g <= 0.35 ? 2 : 1;
    const dq = AUTO.dataQual(i, d);
    // confidence caps credibility: you cannot trust a number more than its source
    return clamp(dq === null ? s : Math.min(s, dq + 1));
  },

  cashConv: (_i, d) => {
    const c = d.cashConversion;
    if (c === null) return null;
    return c >= 0.8 ? 5 : c >= 0.65 ? 4 : c >= 0.5 ? 3 : c >= 0.35 ? 2 : 1;
  },

  revQual: (i) => {
    const r = i.recurringPct;
    if (r === null) return null;
    return r >= 70 ? 5 : r >= 50 ? 4 : r >= 30 ? 3 : r >= 15 ? 2 : 1;
  },

  debt: (_i, d) => {
    const l = d.leverage;
    if (l === null) return null;
    return l <= 1 ? 5 : l <= 2 ? 4 : l <= 3 ? 3 : l <= 4 ? 2 : 1;
  },
};

/* ───────────────────────────────── the gates ───────────────────────────────── */

export interface Criterion {
  id: string;
  name: string;
  detail: string;
  /** blueprint weight, 0-100 within its own model */
  weight: number;
  auto: string | null;
  /** Pass / Lost Reason to propose when this criterion is what sinks the deal */
  reason: PassReason | null;
  /**
   * Fallback for criteria no data can score, so the gate still produces a
   * number before a human has formed a view. The result marks these with
   * `usedDefault` so the UI can say the 3 is a placeholder, not a judgement.
   */
  defaultScore?: number;
}

export interface GateModel {
  id: ModelId;
  name: string;
  stage: string;
  question: string;
  /** gate wording from Funnel_Stages, indexed by [proceed, monitor, pass] */
  options: [string, string, string];
  /** matching Lists · Decision Status values */
  decisions: [string, string, string];
  criteria: Criterion[];
}

export const MODELS: GateModel[] = [
  {
    id: 'qss',
    name: 'QSS Score',
    stage: 'Screening',
    question: '¿Merece una llamada?',
    options: ['Proceed', 'Monitor', 'Pass'],
    decisions: ['Proceed', 'Monitor', 'Pass'],
    criteria: [
      { id: 'geo', name: 'Encaje geográfico', detail: 'España; Iberia opcional.', weight: 10, auto: 'geo', reason: null },
      { id: 'ebit', name: 'Encaje de EBITDA', detail: 'Probable 1-5 M€ de EBITDA.', weight: 20, auto: 'ebitdaFit', reason: 'Too small' },
      { id: 'sec', name: 'Encaje sectorial', detail: 'Agribusiness / Industrial Products.', weight: 15, auto: 'sector', reason: null },
      { id: 'own', name: 'Encaje de propiedad', detail: 'Ángulo de fundador, familia o sucesión.', weight: 15, auto: 'own', reason: null },
      { id: 'bq', name: 'Calidad del negocio', detail: 'Nicho, márgenes, calidad de cliente.', weight: 20, auto: 'quality', reason: 'Weak business' },
      { id: 'deal', name: 'Dealability', detail: 'Motivación del vendedor y expectativa de precio.', weight: 20, auto: 'deal', reason: 'Price gap' },
    ],
  },
  {
    id: 'om',
    name: 'OM Score',
    stage: 'Assessment',
    question: '¿Merece esfuerzo serio?',
    options: ['Continue', 'Monitor', 'Pass'],
    decisions: ['Continue', 'Monitor', 'Pass'],
    criteria: [
      { id: 'mkt', name: 'Atractivo del mercado', detail: 'Growth, fragmentación y consolidación de Industry_Taxonomy.', weight: 20, auto: 'market', reason: 'Weak business' },
      // No dataset answers this one. It waits for a human, and sits at 3 meanwhile.
      { id: 'pos', name: 'Posicionamiento', detail: 'Diferenciación, liderazgo de nicho, exportación.', weight: 20, auto: null, reason: 'Weak business', defaultScore: 3 },
      { id: 'fin', name: 'Perfil financiero', detail: 'Márgenes, crecimiento, señales de conversión de caja.', weight: 20, auto: 'finProfile', reason: 'Financial issue' },
      { id: 'alig', name: 'Alineación comprador-vendedor', detail: 'Valuation Gap €M y motivación del vendedor.', weight: 20, auto: 'valAlign', reason: 'Price gap' },
      { id: 'risk', name: 'Perfil de riesgo', detail: 'Ausencia de deal-breakers evidentes.', weight: 20, auto: 'risk', reason: 'Weak business' },
    ],
  },
  {
    id: 'pfr',
    name: 'PFR Score',
    stage: 'Preliminary Financial Review',
    question: '¿Nos fiamos del EBITDA?',
    options: ['Build Investment Case', 'Reprice', 'Pass'],
    decisions: ['Build Investment Case', 'Reprice', 'Pass'],
    criteria: [
      { id: 'cred', name: 'Credibilidad del EBITDA', detail: 'Confianza entre reportado y normalizado.', weight: 30, auto: 'ebCred', reason: 'Financial issue' },
      { id: 'cash', name: 'Conversión de caja', detail: 'El EBITDA se convierte en caja tras capex y circulante.', weight: 20, auto: 'cashConv', reason: 'Financial issue' },
      { id: 'revq', name: 'Calidad de los ingresos', detail: 'Ingreso recurrente o estable, sin extraordinarios.', weight: 20, auto: 'revQual', reason: 'Financial issue' },
      { id: 'debt', name: 'Deuda y pasivos', detail: 'Sin deuda oculta ni pasivos inusuales.', weight: 15, auto: 'debt', reason: 'Financial issue' },
      { id: 'dq', name: 'Calidad del dato', detail: 'Financials · Confidence.', weight: 15, auto: 'dataQual', reason: 'Financial issue' },
    ],
  },
];

export interface KillCriterion {
  id: string;
  model: ModelId;
  stage: string;
  text: string;
  reason: PassReason | null;
  /** data-side detector. Null means only a human can raise it. */
  detect: ((i: ScoringInput, d: Derived) => boolean) | null;
}

/** Funnel_Stages · Kill Criteria, broken out one by one. */
export const KILLS: KillCriterion[] = [
  // Screening · Quick Screen Snapshot
  { id: 'k1', model: 'qss', stage: 'Screening · Quick Screen Snapshot (QSS)', text: 'Fuera de España.', reason: null,
    detect: (i, d) => { const g = AUTO.geo(i, d); return g !== null && g <= 2; } },
  { id: 'k2', model: 'qss', stage: 'Screening · Quick Screen Snapshot (QSS)', text: 'Claramente fuera del rango de EBITDA.', reason: 'Too small',
    detect: (i, d) => { const e = AUTO.ebitdaFit(i, d); return e !== null && e <= 2; } },
  { id: 'k3', model: 'qss', stage: 'Screening · Quick Screen Snapshot (QSS)', text: 'Sector no objetivo.', reason: null,
    detect: (i, d) => (AUTO.sector(i, d) ?? 5) <= 1 },
  { id: 'k4', model: 'qss', stage: 'Screening · Quick Screen Snapshot (QSS)', text: 'Calidad obviamente baja o sin ángulo de transacción.', reason: 'Weak business',
    detect: null },

  // Assessment · Opportunity Memo
  { id: 'k5', model: 'om', stage: 'Assessment · Opportunity Memo (OM)', text: 'Sin solape de valoración.', reason: 'Price gap',
    detect: (_i, d) => d.valuationGapPct !== null && d.valuationGapPct > 0.5 },
  { id: 'k6', model: 'om', stage: 'Assessment · Opportunity Memo (OM)', text: 'Mercado débil.', reason: 'Weak business',
    detect: (i, d) => { const s = AUTO.market(i, d); return s !== null && s <= 2; } },
  { id: 'k7', model: 'om', stage: 'Assessment · Opportunity Memo (OM)', text: 'Motivación del vendedor poco convincente.', reason: 'Seller not ready',
    detect: (i) => i.sellerMotiv !== null && i.sellerMotiv <= 2 },
  { id: 'k8', model: 'om', stage: 'Assessment · Opportunity Memo (OM)', text: 'Mala calidad del negocio.', reason: 'Weak business',
    detect: (i, d) => { const s = AUTO.quality(i, d); return s !== null && s <= 2; } },
  { id: 'k9', model: 'om', stage: 'Assessment · Opportunity Memo (OM)', text: 'Red flags altas.', reason: 'Weak business',
    detect: (i, d) => { const s = AUTO.risk(i, d); return s !== null && s <= 2; } },

  // Preliminary Financial Review · PFR / Light QoE
  { id: 'k10', model: 'pfr', stage: 'Preliminary Financial Review · PFR / Light QoE', text: 'EBITDA sobreestimado de forma material.', reason: 'Financial issue',
    detect: (_i, d) => d.normalisationGap !== null && d.normalisationGap > 0.25 },
  { id: 'k11', model: 'pfr', stage: 'Preliminary Financial Review · PFR / Light QoE', text: 'Mala conversión de caja.', reason: 'Financial issue',
    detect: (_i, d) => d.cashConversion !== null && d.cashConversion < 0.35 },
  { id: 'k12', model: 'pfr', stage: 'Preliminary Financial Review · PFR / Light QoE', text: 'Deuda o pasivos ocultos.', reason: 'Financial issue',
    detect: (_i, d) => d.leverage !== null && d.leverage > 4 },
  { id: 'k13', model: 'pfr', stage: 'Preliminary Financial Review · PFR / Light QoE', text: 'Transparencia financiera insuficiente.', reason: 'Financial issue',
    detect: (i, d) => { const dq = AUTO.dataQual(i, d); return dq !== null && dq <= 1; } },
];

/* ───────────────────────────────── scoring ─────────────────────────────────── */

export interface CriterionResult {
  /** stable key, `${modelId}_${criterionId}`, used for manual and weight overrides */
  key: string;
  id: string;
  name: string;
  detail: string;
  weight: number;
  /** what the data says, or null if it cannot say */
  autoScore: number | null;
  /** what a human overrode it to */
  manualScore: number | null;
  /** what was actually used */
  score: number | null;
  /** true when `score` is only the placeholder, with no data and no human behind it */
  usedDefault: boolean;
  reason: PassReason | null;
}

export interface ModelResult {
  id: ModelId;
  name: string;
  stage: string;
  question: string;
  score1to5: number | null;
  score0to100: number | null;
  /** share of this model's weight that had a score behind it, 0-1 */
  coverage: number;
  /** sum of weights as configured. 100 unless someone changed them. */
  weightSum: number;
  /** 0 proceed, 1 monitor, 2 pass, -1 no data */
  outcome: -1 | 0 | 1 | 2;
  verdict: string;
  decision: string;
  vetoed: boolean;
  vetoes: KillCriterion[];
  criteria: CriterionResult[];
}

export interface WeakPoint {
  model: string;
  name: string;
  score: number;
  weight: number;
  reason: PassReason | null;
}

export interface ScoreResult {
  metrics: Derived;
  models: ModelResult[];
  /** simple mean of the scored models. The blueprint gives no inter-model weights. */
  overall0to100: number | null;
  /** the stage the deal actually reaches: it stops at the first gate that says Pass */
  stage: string;
  decision: string;
  passReason: PassReason | null;
  passReasonSource: string | null;
  /** true when the deal dies for a reason their 7-value list cannot express */
  passReasonMissing: boolean;
  flaggedKills: KillCriterion[];
  suggestedKills: KillCriterion[];
  weakPoints: WeakPoint[];
  /** criteria with no score, as "Model · Criterion" */
  gaps: string[];
}

export const DEFAULT_PROCEED_AT = 80; // = 4.0 on the blueprint's 1-5 scale
export const DEFAULT_MONITOR_AT = 60; // = 3.0

export function criterionKey(model: ModelId, criterionId: string): string {
  return `${model}_${criterionId}`;
}

export function scoreProject(input: ScoringInput, opts: ScoringOptions = {}): ScoreResult {
  const d = derive(input);
  const proceed1to5 = (opts.proceedAt ?? DEFAULT_PROCEED_AT) / 20;
  const monitor1to5 = (opts.monitorAt ?? DEFAULT_MONITOR_AT) / 20;
  const flagged = new Set(opts.flagged ?? []);

  // Split kill criteria into human vetoes and data-side suggestions. A tick
  // always vetoes; a detection only advises unless blockOnSuggested is set.
  const flaggedKills: KillCriterion[] = [];
  const suggestedKills: KillCriterion[] = [];
  for (const k of KILLS) {
    if (flagged.has(k.id)) flaggedKills.push(k);
    else if (k.detect && k.detect(input, d)) suggestedKills.push(k);
  }
  const vetoing = opts.blockOnSuggested ? [...flaggedKills, ...suggestedKills] : flaggedKills;

  const gaps: string[] = [];
  const weakPoints: WeakPoint[] = [];

  const models: ModelResult[] = MODELS.map((M) => {
    let scoredWeight = 0;
    let acc = 0;
    let weightSum = 0;

    const criteria: CriterionResult[] = M.criteria.map((c) => {
      const key = criterionKey(M.id, c.id);
      const weight = opts.weights?.[key] ?? c.weight;
      weightSum += weight;

      const autoScore = c.auto ? AUTO[c.auto](input, d) : null;
      const manualRaw = opts.manual?.[key];
      const manualScore = manualRaw === undefined || manualRaw === null ? null : manualRaw;
      const resolved = manualScore ?? autoScore;
      const usedDefault = resolved === null && c.defaultScore !== undefined;
      const score = usedDefault ? (c.defaultScore as number) : resolved;

      if (score === null || !Number.isFinite(score)) {
        gaps.push(`${M.name} · ${c.name}`);
      } else {
        scoredWeight += weight;
        acc += weight * score;
        if (score <= 2) {
          weakPoints.push({ model: M.name, name: c.name, score, weight, reason: c.reason });
        }
      }

      return { key, id: c.id, name: c.name, detail: c.detail, weight, autoScore, manualScore, score, usedDefault, reason: c.reason };
    });

    // Renormalise over the weight that actually had data behind it, so a missing
    // criterion lowers coverage instead of silently dragging the score down.
    const score1to5 = scoredWeight > 0 ? acc / scoredWeight : null;
    const vetoes = vetoing.filter((k) => k.model === M.id);
    const vetoed = vetoes.length > 0;

    let outcome: -1 | 0 | 1 | 2;
    if (vetoed) outcome = 2;
    else if (score1to5 === null) outcome = -1;
    else outcome = score1to5 >= proceed1to5 ? 0 : score1to5 >= monitor1to5 ? 1 : 2;

    return {
      id: M.id,
      name: M.name,
      stage: M.stage,
      question: M.question,
      score1to5,
      score0to100: score1to5 === null ? null : Math.round(score1to5 * 20),
      coverage: weightSum > 0 ? scoredWeight / weightSum : 0,
      weightSum,
      outcome,
      verdict: outcome === -1 ? 'Sin datos' : M.options[outcome],
      decision: outcome === -1 ? '—' : M.decisions[outcome],
      vetoed,
      vetoes,
      criteria,
    };
  });

  // The deal stops at the first gate that says Pass, so walk the stages in order
  // rather than reading the last model that happens to have data.
  let last: ModelResult | null = null;
  for (const r of models) {
    if (r.score1to5 !== null || r.vetoed) last = r;
    if (r.outcome === 2) break;
  }
  const stage = last ? last.stage : 'Screening';
  const decision = last ? last.decision : '—';

  const scored = models.filter((r) => r.score1to5 !== null);
  const overall0to100 = scored.length
    ? Math.round((scored.reduce((a, r) => a + (r.score1to5 as number), 0) / scored.length) * 20)
    : null;

  // Propose a Pass / Lost Reason, but only from their 7 values.
  let passReason: PassReason | null = null;
  let passReasonSource: string | null = null;
  let passReasonMissing = false;

  const anyPass = models.some((r) => r.outcome === 2);
  const source = flaggedKills.length ? flaggedKills : opts.blockOnSuggested ? suggestedKills : [];

  if (anyPass && source.length) {
    const withReason = source.find((k) => k.reason);
    if (withReason) {
      passReason = withReason.reason;
      passReasonSource = `kill criterion: ${withReason.text.replace(/\.$/, '')}`;
    } else {
      passReasonMissing = true;
      passReasonSource = `kill criterion: ${source[0].text.replace(/\.$/, '')}`;
    }
  }

  if (anyPass && !passReason && !passReasonMissing) {
    const ranked = [...weakPoints].sort((a, b) => a.score - b.score || b.weight - a.weight);
    const withReason = ranked.find((w) => w.reason);
    if (withReason) {
      passReason = withReason.reason;
      passReasonSource = `criterio más débil: ${withReason.name.toLowerCase()} = ${withReason.score}`;
    } else if (ranked.length) {
      passReasonMissing = true;
      passReasonSource = `criterio más débil: ${ranked[0].name.toLowerCase()} = ${ranked[0].score}`;
    }
  }

  weakPoints.sort((a, b) => a.score - b.score || b.weight - a.weight);

  return {
    metrics: d,
    models,
    overall0to100,
    stage,
    decision,
    passReason,
    passReasonSource,
    passReasonMissing,
    flaggedKills,
    suggestedKills,
    weakPoints,
    gaps,
  };
}

/* ─────────────────────────────── db adapters ───────────────────────────────── */

/** Shape of an arpa_projects row joined to its company and taxonomy. */
export interface ProjectRow {
  revenue_y1: number | null;
  revenue_y2: number | null;
  revenue_y3: number | null;
  ebitda_y1: number | null;
  ebitda_y2: number | null;
  ebitda_y3: number | null;
  ebitda_norm: number | null;
  capex: number | null;
  working_capital: number | null;
  net_debt: number | null;
  recurring_pct: number | null;
  customer_conc: Concentration | null;
  seller_motiv: number | null;
  data_confidence: Confidence | null;
  entry_multiple: number | null;
  seller_exp_ev: number | null;
}

export interface CompanyRow {
  country: string | null;
  ownership_type: OwnershipType | null;
  taxonomy_fit: TaxonomyFit;
}

/**
 * Postgres numerics arrive as strings over the wire, so coerce before any maths.
 * Doing this once here is what stops "10.4" + 1 turning into "10.41" downstream.
 */
const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const f = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(f) ? f : null;
};

export function toScoringInput(
  project: ProjectRow,
  company: CompanyRow,
  taxonomy: TaxonomyRow | null,
): ScoringInput {
  return {
    country: company.country,
    ownershipType: company.ownership_type,
    taxonomyFit: company.taxonomy_fit ?? 'in',
    taxonomy,
    revenue: [n(project.revenue_y1), n(project.revenue_y2), n(project.revenue_y3)],
    ebitda: [n(project.ebitda_y1), n(project.ebitda_y2), n(project.ebitda_y3)],
    ebitdaNorm: n(project.ebitda_norm),
    capex: n(project.capex),
    workingCapital: n(project.working_capital),
    netDebt: n(project.net_debt),
    recurringPct: n(project.recurring_pct),
    customerConc: project.customer_conc,
    sellerMotiv: n(project.seller_motiv),
    dataConfidence: project.data_confidence,
    entryMultiple: n(project.entry_multiple),
    sellerExpEv: n(project.seller_exp_ev),
  };
}

/** Rows ready for insert into arpa_scores, one per gate. */
export function toScoreRows(projectId: string, result: ScoreResult, scoredBy: string) {
  return result.models
    .filter((m) => m.score1to5 !== null || m.vetoed)
    .map((m) => ({
      project_id: projectId,
      model: m.id,
      total_1_5: m.score1to5 === null ? null : Number(m.score1to5.toFixed(2)),
      total_0_100: m.score0to100,
      verdict: m.verdict,
      vetoed: m.vetoed,
      criteria: Object.fromEntries(
        m.criteria.map((c) => [c.id, { w: c.weight, score: c.score, auto: c.autoScore, manual: c.manualScore }]),
      ),
      scored_by: scoredBy,
    }));
}
