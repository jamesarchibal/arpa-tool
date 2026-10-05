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
