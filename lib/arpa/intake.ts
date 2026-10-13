/**
 * SABI intake: one batch of exported rows in, scored opportunities out.
 *
 * This is the entry point Marc described on the 2026-10-08 call. His SABI seat
 * exports the whole filtered result set to Excel with no download cap, so the
 * origination loop is: filter in SABI -> export -> drop the file into Claude ->
 * Claude posts the rows here -> every row becomes a scored opportunity sitting
 * in a stage he can move.
 *
 * Deliberately NOT an .xlsx parser. SABI's export carries merged cells, `n.d.`
 * placeholders, a variable column set (whatever he ticked) and one column per
 * year, so a parser here would be a permanent guessing game against a UI that
 * has not changed since 2003. An LLM reads that file correctly today, and it is
 * HIS Claude subscription doing it, which is the point: no API tokens on our
 * side. So the contract is clean JSON and the messy part stays where it is
 * already solved.
 *
 * ── Units ──
 * The single most dangerous thing in this file. SABI prints EUROS. Every money
 * column in this schema is MILLIONS of euros. Importing 3,926,156.92 € as
 * 3,926,156.92 M€ would not crash anything: it would sail through the 1-5 M€
 * EBITDA mandate filter and quietly corrupt every score downstream. So the unit
 * is explicit, defaults to the one SABI actually emits, and an implausible
 * result is REJECTED rather than stored.
 */

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import {
  scoreProject,
  toScoreRows,
  toScoringInput,
  type TaxonomyRow,
} from '@/lib/arpa/scoring';

/**
 * Anything above this, once converted to M€, is a unit mistake and not a
 * Spanish SME. Spain's largest company by revenue is around 100,000 M€, and
 * ARPA's mandate tops out four orders of magnitude below that, so this ceiling
 * cannot reject a real target. It exists to catch a caller who sent euros while
 * declaring millions.
 */
const IMPLAUSIBLE_MEUR = 150_000;

const money = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    // SABI writes `n.d.` for "this account did not publish the concept", which
    // is NOT zero, and Spanish decimal commas with dot thousands separators.
    const s = v.trim();
    if (s === '' || /^n\.?\s*d\.?$/i.test(s) || s === '-') return null;
    const normalised = s.replace(/[\s€]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const f = parseFloat(normalised);
    return Number.isFinite(f) ? f : null;
  });

const OWNERSHIP = [
  'Founder-owned',
  'Family-owned',
  'Private equity',
  'Corporate subsidiary',
  'Public',
  'Unknown',
] as const;

export const intakeRowSchema = z.object({
  legal_name: z.string().trim().min(1).max(300),
  /**
   * Validated loosely on purpose. A Spanish CIF is a letter, 7 digits and a
   * control character, but SABI also returns foreign VAT numbers and older
   * formats. A strict regex here would silently DROP real rows, which is worse
   * than storing an odd-looking identifier, so this only normalises.
   */
  cif: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => (v ? v.replace(/[^A-Z0-9]/g, '') || null : null)),
  city: z.string().trim().max(160).nullable().optional(),
  region: z.string().trim().max(160).nullable().optional(),
  country: z.string().trim().max(2).default('ES'),
  cnae: z.string().trim().max(120).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  employees: z.coerce.number().int().min(0).max(5_000_000).nullable().optional(),
  founded_year: z.coerce.number().int().min(1800).max(2100).nullable().optional(),
  ownership_type: z.enum(OWNERSHIP).nullable().optional(),
  /** Year the current administrador was first appointed: the owner-age proxy. */
  admin_since: z.coerce.number().int().min(1800).max(2100).nullable().optional(),
  /** Matched against arpa_taxonomy.subsector, case-insensitively. */
  subsector: z.string().trim().max(160).nullable().optional(),
  taxonomy_fit: z.enum(['in', 'adjacent', 'out']).default('in'),

  /**
   * Ascending by year, oldest first. Send as many years as SABI gave; only the
   * last three are stored, because that is what the scoring model consumes.
   */
  revenue: z.array(money).max(30).default([]),
  ebitda: z.array(money).max(30).default([]),
  net_debt: money,
  capex: money,
  working_capital: money,

  notes: z.string().trim().max(4000).nullable().optional(),
  source: z.string().trim().max(240).nullable().optional(),
});

export const intakeBatchSchema = z.object({
  /** Which unit the money fields are in. SABI emits euros, hence the default. */
  units: z.enum(['eur', 'meur']).default('eur'),
  /** Free text, e.g. 'CNAE 17.x Cataluña, export 09/10/2026'. Shown in the UI. */
  label: z.string().trim().max(240).nullable().optional(),
  rows: z.array(intakeRowSchema).min(1).max(2000),
});

export type IntakeRow = z.infer<typeof intakeRowSchema>;
export type IntakeBatch = z.infer<typeof intakeBatchSchema>;

export interface IntakeRowResult {
  legal_name: string;
  cif: string | null;
  status: 'created' | 'updated' | 'rejected';
  project_id?: string;
  qss?: number | null;
  verdict?: string | null;
  reason?: string;
}

export interface IntakeResult {
  batch: string;
  created: number;
  updated: number;
  rejected: number;
  rows: IntakeRowResult[];
}

/** Last three entries, oldest first, padded to exactly three. */
function lastThree(xs: (number | null)[]): [number | null, number | null, number | null] {
  const t = xs.slice(-3);
  while (t.length < 3) t.unshift(null);
  return [t[0], t[1], t[2]];
}

export async function runIntake(batch: IntakeBatch, actor: string): Promise<IntakeResult> {
  const supabase = createClient();
  const divisor = batch.units === 'eur' ? 1_000_000 : 1;
  const toMeur = (v: number | null) => (v === null ? null : v / divisor);

  const batchId = `sabi:${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`;

  const { data: taxRows, error: taxError } = await supabase
    .from('arpa_taxonomy')
    .select('id, sector, category, subsector, growth, fragmentation, consolidation');
  if (taxError) throw new Error(`taxonomy read failed: ${taxError.message}`);

  const taxBySubsector = new Map<string, (typeof taxRows)[number]>();
  for (const t of taxRows ?? []) taxBySubsector.set(t.subsector.toLowerCase(), t);

  const results: IntakeRowResult[] = [];

  for (const row of batch.rows) {
    const revenue = lastThree(row.revenue.map(toMeur));
    const ebitda = lastThree(row.ebitda.map(toMeur));

    const biggest = Math.max(
      ...[...revenue, ...ebitda, toMeur(row.net_debt)]
        .filter((v): v is number => v !== null)
        .map(Math.abs),
      0,
    );
    if (biggest > IMPLAUSIBLE_MEUR) {
      results.push({
        legal_name: row.legal_name,
        cif: row.cif ?? null,
        status: 'rejected',
        reason:
          `${biggest.toFixed(0)} M€ es implausible para esta cartera. ` +
          `Lo más probable es que las cifras vengan en euros y el lote diga "meur".`,
      });
      continue;
    }

    const tax = row.subsector ? taxBySubsector.get(row.subsector.toLowerCase()) ?? null : null;

    // Find the durable company first. CIF is the natural key and is unique in
    // the table; falling back to the exact legal name stops a second import of
    // the same list creating twins when SABI had no identifier.
    let companyId: string | null = null;
    if (row.cif) {
      const { data } = await supabase
        .from('arpa_companies')
        .select('id')
        .eq('cif', row.cif)
        .maybeSingle();
      companyId = data?.id ?? null;
    }
    if (!companyId) {
      const { data } = await supabase
        .from('arpa_companies')
        .select('id')
        .ilike('legal_name', row.legal_name)
        .limit(1)
        .maybeSingle();
      companyId = data?.id ?? null;
    }

    const companyFields = {
      legal_name: row.legal_name,
      cif: row.cif,
      city: row.city ?? null,
      region: row.region ?? null,
      country: row.country,
      cnae: row.cnae ?? null,
      website: row.website ?? null,
      employees: row.employees ?? null,
      founded_year: row.founded_year ?? null,
      ownership_type: row.ownership_type ?? null,
      admin_since: row.admin_since ?? null,
      taxonomy_id: tax?.id ?? null,
      taxonomy_fit: row.taxonomy_fit,
      notes: row.notes ?? null,
      enrich_source: 'SABI',
      enriched_at: new Date().toISOString(),
      enriched_by: actor,
      intake_batch: batchId,
      updated_at: new Date().toISOString(),
    };

    const existed = companyId !== null;
    if (companyId) {
      const { error } = await supabase.from('arpa_companies').update(companyFields).eq('id', companyId);
      if (error) {
        results.push({
          legal_name: row.legal_name,
          cif: row.cif ?? null,
          status: 'rejected',
          reason: error.message,
        });
        continue;
      }
    } else {
      const { data, error } = await supabase
        .from('arpa_companies')
        .insert(companyFields)
        .select('id')
        .single();
      if (error || !data) {
        results.push({
          legal_name: row.legal_name,
          cif: row.cif ?? null,
          status: 'rejected',
          reason: error?.message ?? 'insert returned no row',
        });
        continue;
      }
      companyId = data.id;
    }

    // One live opportunity per company. Re-importing refreshes the numbers on
    // the open project instead of stacking duplicates on top of a deal someone
    // is already working.
    const { data: openProject } = await supabase
      .from('arpa_projects')
      .select('id')
      .eq('company_id', companyId)
      .not('stage', 'in', '("Closed","Portfolio")')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const projectFields = {
      company_id: companyId,
      revenue_y1: revenue[0],
      revenue_y2: revenue[1],
      revenue_y3: revenue[2],
      ebitda_y1: ebitda[0],
      ebitda_y2: ebitda[1],
      ebitda_y3: ebitda[2],
      net_debt: toMeur(row.net_debt),
      capex: toMeur(row.capex),
      working_capital: toMeur(row.working_capital),
      // SABI republishes accounts DEPOSITED at the Registro Mercantil, so the
      // figures are official rather than seller-supplied. That is 'High' on the
      // blueprint's own scale. It says nothing about normalisation, which stays
      // null until a human does the add-backs.
      data_confidence: 'High' as const,
      financials_src: batch.label ? `SABI · ${batch.label}` : 'SABI export',
      source: row.source ?? 'SABI',
      intake_batch: batchId,
      updated_at: new Date().toISOString(),
    };

    let projectId: string;
    if (openProject?.id) {
      const { error } = await supabase.from('arpa_projects').update(projectFields).eq('id', openProject.id);
      if (error) {
        results.push({
          legal_name: row.legal_name,
          cif: row.cif ?? null,
          status: 'rejected',
          reason: error.message,
        });
        continue;
      }
      projectId = openProject.id;
    } else {
      const { data, error } = await supabase
        .from('arpa_projects')
        .insert({ ...projectFields, stage: 'Sourcing' })
        .select('id')
        .single();
      if (error || !data) {
        results.push({
          legal_name: row.legal_name,
          cif: row.cif ?? null,
          status: 'rejected',
          reason: error?.message ?? 'insert returned no row',
        });
        continue;
      }
      projectId = data.id;
    }

    // Score it with the same engine the workbench uses, so an imported row and
    // a hand-entered one can never disagree about what the method says.
    const taxonomy: TaxonomyRow | null = tax
      ? {
          sector: tax.sector,
          category: tax.category,
          subsector: tax.subsector,
          growth: tax.growth as TaxonomyRow['growth'],
          fragmentation: tax.fragmentation as TaxonomyRow['fragmentation'],
          consolidation: tax.consolidation as TaxonomyRow['consolidation'],
        }
      : null;

    const result = scoreProject(
      toScoringInput(
        {
          revenue_y1: revenue[0],
          revenue_y2: revenue[1],
          revenue_y3: revenue[2],
          ebitda_y1: ebitda[0],
          ebitda_y2: ebitda[1],
          ebitda_y3: ebitda[2],
          ebitda_norm: null,
          capex: toMeur(row.capex),
          working_capital: toMeur(row.working_capital),
          net_debt: toMeur(row.net_debt),
          recurring_pct: null,
          customer_conc: null,
          seller_motiv: null,
          data_confidence: 'High',
          entry_multiple: null,
          seller_exp_ev: null,
        },
        {
          country: row.country,
          ownership_type: row.ownership_type ?? null,
          taxonomy_fit: row.taxonomy_fit,
        },
        taxonomy,
      ),
    );

    const scoreRows = toScoreRows(projectId, result, `intake:${actor}`);
    if (scoreRows.length) {
      const { error } = await supabase.from('arpa_scores').insert(scoreRows);
      if (error) throw new Error(`score insert failed: ${error.message}`);
    }

    const qss = result.models.find((m) => m.id === 'qss');
    results.push({
      legal_name: row.legal_name,
      cif: row.cif ?? null,
      status: existed ? 'updated' : 'created',
      project_id: projectId,
      qss: qss?.score0to100 ?? null,
      verdict: qss?.verdict ?? null,
    });
  }

  return {
    batch: batchId,
    created: results.filter((r) => r.status === 'created').length,
    updated: results.filter((r) => r.status === 'updated').length,
    rejected: results.filter((r) => r.status === 'rejected').length,
    rows: results,
  };
}
