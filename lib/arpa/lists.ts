/**
 * Controlled lists shared by the forms and the server actions that validate
 * them. Each one mirrors a check constraint in the database, verbatim and in
 * the database's own wording, so the two cannot disagree.
 *
 * These live HERE and not in `app/actions.ts` on purpose. That file is
 * `'use server'`, so Next treats every one of its exports as a server action:
 * a client component importing a const array from it receives a function
 * reference, not the array, and `.map` blows up at render with
 * `TypeError: ... .map is not a function`. It is a runtime-only failure, so
 * typecheck and build both pass and the page 500s in production.
 */

/**
 * arpa_projects.stage · Funnel_Stages, in blueprint order.
 *
 * The blueprint names nine; `Sourcing` sits in front because origination
 * promotes into it, and `Closed` is terminal. Marc's own wording on the
 * 2026-10-08 call maps onto the back half: LOI sent and accepted, due
 * diligence, SPA negotiation, closed, portfolio.
 *
 * THE ONE PLACE TO EDIT. Changing this list also needs a migration, because
 * `arpa_projects_stage_check` enumerates the same strings and will reject
 * anything new. Widen the constraint FIRST, then edit here, or saving a row in
 * a brand-new stage fails at the database.
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

/**
 * The board's columns.
 *
 * Ignasi's funnel is a handful of approval gates, not eleven stages: companies
 * identified, screening (15 minutes, one page out), opportunity memo (3-4
 * pages), financial assessment, investment case, then closing. Eleven columns
 * on a board is unreadable and most of them would always be empty, so the
 * stages group into the gates.
 *
 * Every stage in STAGES must appear in exactly one lane, or a project
 * disappears from the board. `lib/arpa/lists.test.ts` asserts that.
 */
export const FUNNEL_LANES = [
  { key: 'identified', label: 'Identificadas', stages: ['Sourcing'] },
  { key: 'screening', label: 'Screening', stages: ['Screening'] },
  { key: 'memo', label: 'Memo oportunidad', stages: ['Assessment'] },
  { key: 'finance', label: 'Finanzas', stages: ['Preliminary Financial Review'] },
  {
    key: 'hot',
    label: 'Caliente',
    stages: [
      'Investment Case',
      'LOI & Exclusivity',
      'Full Due Diligence',
      'Final Investment Approval',
      'Closing',
    ],
  },
  { key: 'closed', label: 'Cerradas', stages: ['Portfolio', 'Closed'] },
] as const satisfies readonly { key: string; label: string; stages: readonly Stage[] }[];

/** arpa_stakeholders.kind */
export const STAKEHOLDER_KINDS = [
  'Owner',
  'Family member',
  'Management',
  'Advisor',
  'Banker',
  'Broker',
  'Lawyer',
  'Accountant',
  'Lender',
  'Investor',
  'LP',
  'Co-investor',
  'Intermediary',
  'Other',
] as const;

/** arpa_interactions.kind */
export const INTERACTION_KINDS = ['Call', 'Meeting', 'Email', 'Message', 'Note', 'Site visit'] as const;

/** arpa_companies.ownership_type */
export const OWNERSHIP_TYPES = [
  'Founder-owned',
  'Family-owned',
  'Private equity',
  'Corporate subsidiary',
  'Public',
  'Unknown',
] as const;

/**
 * arpa_companies.enrich_source. Not a check constraint, a convention, so that
 * data copied from a licensed database can be found and deleted if its licence
 * forbids storage.
 */
export const ENRICH_SOURCES = ['SABI', 'BORME', 'web', 'manual'] as const;

/** arpa_documents.doc_type */
export const DOC_TYPES = [
  'Teaser',
  'NDA',
  'Info memo',
  'Annual accounts',
  'XBRL deposit',
  'Management accounts',
  'Valuation',
  'LOI',
  'Report',
  'Other',
] as const;
