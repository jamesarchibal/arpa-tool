/**
 * ARPA's own controlled vocabulary, from the `Vocabulary` sheet of the IOS v9
 * workbook. One list per check constraint in the `ios_*` tables, verbatim and in
 * their wording, so the database and the forms cannot disagree.
 *
 * This is V2's list file. It does NOT extend `lib/arpa/lists.ts`, it replaces it,
 * because two of V1's lists are older and narrower than v9:
 *   - V1 `STAGES` has 11 entries, v9 has 9. v9 keeps the outcome in a separate
 *     `Project Status`, so a project is never *in* a stage called Passed or Lost.
 *   - V1 `PassReason` (in `lib/arpa/scoring.ts`) has 7 entries, v9 has 12.
 * V2 imports V1's scoring engine but shadows those two, or it writes values the
 * v9 check constraints reject.
 *
 * Like `lib/arpa/lists.ts` this file is deliberately NOT `'use server'`. In a
 * `'use server'` module every export becomes a server action, so a client
 * component importing one of these arrays receives a function reference and
 * `.map` throws at render. Typecheck and build both pass and the page 500s.
 *
 * `lib/ios/lists.test.ts` compares every list here against
 * `__fixtures__/vocabulary.ts`, generated straight from the workbook.
 */

/** `ios_projects.stage` · Vocabulary "Current Stage", in funnel order. */
export const STAGES = [
  'Screening',
  'Assessment',
  'Preliminary Financial Review',
  'Investment Case',
  'LOI & Exclusivity',
  'Full Due Diligence',
  'Final Investment Approval',
  'Closing',
  'Portfolio',
] as const;

export type Stage = (typeof STAGES)[number];

/** Spanish labels for the board. The stored value is always the English one. */
export const STAGE_LABEL: Record<Stage, string> = {
  Screening: 'Screening',
  Assessment: 'Memo de oportunidad',
  'Preliminary Financial Review': 'Revisión financiera',
  'Investment Case': 'Caso de inversión',
  'LOI & Exclusivity': 'LOI y exclusividad',
  'Full Due Diligence': 'Due diligence',
  'Final Investment Approval': 'Aprobación final',
  Closing: 'Cierre',
  Portfolio: 'Cartera',
};

/**
 * Where an Advance decision lands. Portfolio is terminal, so it is absent: a
 * missing key is the honest way to say "there is no next stage".
 */
export const STAGE_NEXT: Partial<Record<Stage, Stage>> = {
  Screening: 'Assessment',
  Assessment: 'Preliminary Financial Review',
  'Preliminary Financial Review': 'Investment Case',
  'Investment Case': 'LOI & Exclusivity',
  'LOI & Exclusivity': 'Full Due Diligence',
  'Full Due Diligence': 'Final Investment Approval',
  'Final Investment Approval': 'Closing',
  Closing: 'Portfolio',
};

/**
 * `ios_projects.project_status`. Separate from the stage on purpose (their D02):
 * a passed deal keeps the stage it died in, which is what makes the funnel
 * countable.
 */
export const PROJECT_STATUS = [
  'Active',
  'Monitor',
  'Paused',
  'Passed',
  'Closed Won',
  'Closed Lost',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

/** `ios_projects.stage_status` */
export const STAGE_STATUS = [
  'Not Started',
  'In Progress',
  'Blocked',
  'Awaiting Decision',
  'Complete',
] as const;
export type StageStatus = (typeof STAGE_STATUS)[number];

/** `ios_gate_decisions.decision` · the 16 decision names. */
export const GATE_DECISIONS = [
  'Proceed',
  'Continue',
  'Build Investment Case',
  'Submit LOI',
  'Launch Full DD',
  'Approve',
  'Closed',
  'Monitor',
  'Pause',
  'Reprice',
  'Delayed',
  'Pass',
  'Reject',
  'Walk Away',
  'Lost',
  'Aborted',
] as const;
export type GateDecision = (typeof GATE_DECISIONS)[number];

/** `ios_gate_decisions.status` */
export const GATE_DECISION_STATUS = ['Proposed', 'Approved', 'Blocked', 'Withdrawn'] as const;
export type GateDecisionStatus = (typeof GATE_DECISION_STATUS)[number];

export const DECISION_TYPES = ['Advance', 'Hold', 'Rework', 'Stop', 'Lost'] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

/**
 * `Gate Decisions.Decision Type`, their SWITCH formula transcribed. Every one of
 * the 16 decisions has a type, and the type is what the automations key on.
 */
export const DECISION_TYPE: Record<GateDecision, DecisionType> = {
  Proceed: 'Advance',
  Continue: 'Advance',
  'Build Investment Case': 'Advance',
  'Submit LOI': 'Advance',
  'Launch Full DD': 'Advance',
  Approve: 'Advance',
  Closed: 'Advance',
  Monitor: 'Hold',
  Pause: 'Hold',
  Reprice: 'Rework',
  Delayed: 'Rework',
  Pass: 'Stop',
  Reject: 'Stop',
  'Walk Away': 'Stop',
  Lost: 'Lost',
  Aborted: 'Lost',
};

/**
 * `Gate Decisions.Allowed for Gate?`, their pipe-delimited SWITCH transcribed.
 *
 * Note `Proceed` means Screening -> Assessment at the first gate and Full DD ->
 * Final Investment Approval at the sixth. The same word, two gates: that is why
 * a decision is only ever valid together with its gate.
 *
 * Portfolio is deliberately empty. There is no gate out of the cartera.
 */
export const GATE_ALLOWED: Record<Stage, readonly GateDecision[]> = {
  Screening: ['Proceed', 'Monitor', 'Pass', 'Lost'],
  Assessment: ['Continue', 'Monitor', 'Pass', 'Lost'],
  'Preliminary Financial Review': ['Build Investment Case', 'Reprice', 'Pass', 'Lost'],
  'Investment Case': ['Submit LOI', 'Pause', 'Pass', 'Lost'],
  'LOI & Exclusivity': ['Launch Full DD', 'Reprice', 'Walk Away', 'Lost'],
  'Full Due Diligence': ['Proceed', 'Reprice', 'Walk Away', 'Lost'],
  'Final Investment Approval': ['Approve', 'Reject'],
  Closing: ['Closed', 'Delayed', 'Aborted'],
  Portfolio: [],
};

/**
 * The deliverable each gate reads, from the `Stage_Gates` sheet. Advancing
 * creates the NEXT gate's deliverable at `Not Started`.
 *
 * Closing has none: its gate reads `closing_status`, not a document. Portfolio
 * has none because it has no gate.
 */
export const STAGE_DELIVERABLE: Partial<Record<Stage, DocType>> = {
  Screening: 'QSS',
  Assessment: 'OM',
  'Preliminary Financial Review': 'PFR',
  'Investment Case': 'IC',
  'LOI & Exclusivity': 'LOI',
  'Full Due Diligence': 'DD Summary',
  'Final Investment Approval': 'FIM',
};

/** `ios_documents.doc_type` */
export const DOC_TYPES = [
  'QSS',
  'OM',
  'PFR',
  'IC',
  'LOI',
  'DD Summary',
  'FIM',
  'Closing Package',
  '100-Day Plan',
  'Teaser / CIM',
  'Financial Data',
  'Industry Snapshot',
  'Market Study',
  'Thesis Paper',
  'Other',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

/**
 * `ios_documents.doc_status`. This is the list that makes the gate possible:
 * `Approved` is what opens it, and V1's `arpa_documents` has no status at all.
 */
export const DOC_STATUS = [
  'Not Started',
  'Drafting',
  'In Review',
  'Approved',
  'Rejected',
  'Superseded',
] as const;
export type DocStatus = (typeof DOC_STATUS)[number];

/** `ios_projects.loi_status` */
export const LOI_STATUS = [
  'Not Started',
  'Drafting',
  'Submitted',
  'Accepted',
  'Rejected',
  'Withdrawn',
] as const;
export type LoiStatus = (typeof LOI_STATUS)[number];

/** `ios_projects.full_dd_status` */
export const FULL_DD_STATUS = ['Not Started', 'In Progress', 'On Hold', 'Complete'] as const;
export type FullDdStatus = (typeof FULL_DD_STATUS)[number];

/** `ios_projects.closing_status` */
export const CLOSING_STATUS = [
  'Not Started',
  'In Progress',
  'Delayed',
  'Closed',
  'Aborted',
] as const;
export type ClosingStatus = (typeof CLOSING_STATUS)[number];

/** `ios_projects.pass_lost_reason` · 12 values, not V1's 7. */
export const PASS_LOST_REASONS = [
  'Valuation Gap',
  'Size Outside Mandate',
  'Sector / Thesis Fit',
  'Business Quality',
  'Financials / EBITDA Quality',
  'DD Finding (Legal / Tax / Other)',
  'Ownership Not Ready',
  'No Response',
  'Lost to Other Buyer',
  'Seller Withdrew',
  'Financing',
  'Other',
] as const;
export type PassLostReason = (typeof PASS_LOST_REASONS)[number];

/** `ios_projects.project_type` */
export const PROJECT_TYPES = ['Single Company', 'Build-up', 'Merger'] as const;

/** `ios_project_companies.role` */
export const PROJECT_COMPANY_ROLES = ['Target', 'Platform', 'Add-on', 'Merger Partner'] as const;

/** `ios_project_companies.inclusion_status` */
export const PROJECT_COMPANY_STATUS = ['Under Review', 'In Scope', 'Dropped', 'Acquired'] as const;

/** `ios_projects.thesis_fit` */
export const THESIS_FIT = [
  'Core Thesis',
  'Adjacent Thesis',
  'Opportunistic',
  'New Thesis Candidate',
] as const;

/** `ios_theses.status` */
export const THESIS_STATUS = ['Proposed', 'Validated', 'Active', 'Monitor', 'Retired'] as const;

/** `ios_theses.scope` */
export const THESIS_SCOPES = ['Cross-sector', 'Agribusiness', 'Industrial Products'] as const;

/** `ios_theses.primary_strategy` and `ios_projects.primary_strategy` */
export const PRIMARY_STRATEGIES = [
  'Buy-and-build',
  'Vertical specialization',
  'Product / service expansion',
  'Aftermarket penetration',
  'Recurring-revenue conversion',
  'Operational improvement',
  'Capacity expansion',
  'Commercial acceleration',
  'Internationalization',
  'Technology enablement',
  'Founder succession',
  'Corporate carve-out',
  'Outsourcing',
] as const;

/** `ios_industries.industry`. Their whole mandate is these two. */
export const INDUSTRIES = ['Agribusiness', 'Industrial Products'] as const;

/** `ios_archetypes.pe_role` */
export const PE_ROLES = ['Platform', 'Add-on', 'Either'] as const;

/** `ios_companies.status` */
export const COMPANY_STATUS = [
  'Mapped',
  'Watching',
  'Active Project',
  'Passed',
  'Portfolio',
  'Exited',
  'Archived',
] as const;

/** `ios_companies.ownership_type` */
export const OWNERSHIP_TYPES = [
  'Founder-owned',
  'Family-owned',
  'Management-owned',
  'PE-backed',
  'Corporate',
  'Cooperative',
  'Other',
  'Unknown',
] as const;

/** `ios_companies.origin_type`, `ios_projects.origin_type`, `ios_sources.source_type` */
export const ORIGIN_TYPES = [
  'Proprietary Research',
  'Thematic Mapping',
  'Database (SABI / Informa)',
  'Founder / Owner Direct',
  'Inbound Approach',
  'M&A Advisor (sell-side)',
  'Investment Bank',
  'Business Broker / Intermediary',
  'Accountant / Lawyer Referral',
  'Bank / Lender Referral',
  'Personal Network',
  'Industry Expert',
  'Conference / Trade Fair',
  'Portfolio Company Add-on',
  'Co-investor / PE Fund',
  'Corporate Carve-out',
  'Press / Public Information',
  'AI Research',
  'Other',
] as const;

/** `ios_companies.source_confidence` */
export const CONFIDENCE = ['High', 'Medium', 'Low'] as const;

/** `ios_theses.priority` and `ios_projects.priority` */
export const PRIORITY = ['High', 'Medium', 'Low'] as const;

/** `ios_industries.*_attractiveness`, their "Rating LMH" minus the Unknown. */
export const RATING_LMH = ['High', 'Medium', 'Low', 'Unknown'] as const;

/** `ios_companies.ai_enrichment_status` */
export const AI_OUTPUT_STATUS = [
  'Not Run',
  'Running',
  'Needs Review',
  'Approved',
  'Rejected',
  'Failed',
] as const;

/** `ios_industries.research_status` */
export const RESEARCH_STATUS = [
  'Not Started',
  'Requested',
  'In Progress',
  'Needs Review',
  'Current',
  'Outdated',
] as const;

/** `ios_documents.confidentiality` */
export const CONFIDENTIALITY = [
  'Internal',
  'Confidential (data room only)',
  'Shareable',
] as const;

/**
 * Their tier labels contain a U+2013 EN DASH ("A – Priority"). The column stores
 * the bare letter and the label lives here, so no check constraint ever has to
 * carry a character that is easy to retype wrongly.
 */
export const TIER_LABEL: Record<'A' | 'B' | 'C', string> = {
  A: 'A – Priority',
  B: 'B – Selective',
  C: 'C – Opportunistic',
};
