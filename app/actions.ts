'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import {
  KILLS,
  MODELS,
  STAGES,
  criterionKey,
  scoreProject,
  toScoreRows,
  toScoringInput,
  type ScoringOptions,
} from '@/lib/arpa/scoring';

const KILL_IDS = KILLS.map((k) => k.id) as [string, ...string[]];
const CRITERION_KEYS = MODELS.flatMap((m) => m.criteria.map((c) => criterionKey(m.id, c.id)));

const uuid = z.string().uuid();

/** A number field that an empty input should clear rather than set to zero. */
const money = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  });

const projectSchema = z.object({
  id: uuid,
  stage: z.enum(STAGES),
  owner: z.string().max(120).nullable().optional(),
  source: z.string().max(240).nullable().optional(),
  revenue_y1: money,
  revenue_y2: money,
  revenue_y3: money,
  ebitda_y1: money,
  ebitda_y2: money,
  ebitda_y3: money,
  ebitda_norm: money,
  capex: money,
  working_capital: money,
  net_debt: money,
  recurring_pct: money,
  customer_conc: z.enum(['low', 'mid', 'high']).nullable().optional(),
  seller_motiv: z.coerce.number().int().min(1).max(5).nullable().optional(),
  data_confidence: z.enum(['Low', 'Medium', 'High']).nullable().optional(),
  financials_src: z.string().max(240).nullable().optional(),
  entry_multiple: money,
  seller_exp_ev: money,
});

export interface ActionResult {
  ok: boolean;
  message: string;
}

export async function saveProject(input: unknown): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { id, ...fields } = parsed.data;
  const supabase = createClient();
  const { error } = await supabase.from('arpa_projects').update(fields).eq('id', id);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/${id}`);
  revalidatePath('/pipeline');
  return { ok: true, message: 'Datos guardados' };
}

const scoreSchema = z.object({
  projectId: uuid,
  scoredBy: z.string().min(1).max(120),
  note: z.string().max(2000).nullable().optional(),
  proceedAt: z.coerce.number().min(0).max(100).optional(),
  monitorAt: z.coerce.number().min(0).max(100).optional(),
  blockOnSuggested: z.boolean().optional(),
  manual: z.record(z.string(), z.coerce.number().int().min(1).max(5).nullable()).optional(),
  weights: z.record(z.string(), z.coerce.number().min(0).max(100)).optional(),
  flagged: z.array(z.enum(KILL_IDS)).optional(),
});

/** Drop anything that is not a criterion the blueprint defines. */
function onlyKnownKeys<T>(rec: Record<string, T> | undefined): Record<string, T> | undefined {
  if (!rec) return undefined;
  const out: Record<string, T> = {};
  for (const k of CRITERION_KEYS) if (k in rec) out[k] = rec[k];
  return out;
}

/**
 * Recompute server-side from the stored project and persist one arpa_scores row
 * per gate. The client sends only the human inputs (overrides, weights, ticked
 * kill criteria); the numbers themselves are always derived here, so a score in
 * the database can never disagree with the data behind it.
 */
export async function saveScores(input: unknown): Promise<ActionResult & { overall?: number | null }> {
  const parsed = scoreSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { projectId, scoredBy, note, flagged, manual, weights, ...thresholds } = parsed.data;
  const opts: ScoringOptions = {
    ...thresholds,
    flagged,
    manual: onlyKnownKeys(manual),
    weights: onlyKnownKeys(weights),
  };
  const supabase = createClient();

  const { data: project, error: pErr } = await supabase
    .from('arpa_projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (pErr) return { ok: false, message: pErr.message };
  if (!project) return { ok: false, message: 'Proyecto no encontrado' };

  const { data: company, error: cErr } = await supabase
    .from('arpa_companies')
    .select('*')
    .eq('id', project.company_id)
    .maybeSingle();

  if (cErr) return { ok: false, message: cErr.message };
  if (!company) return { ok: false, message: 'Empresa no encontrada' };

  let taxonomy = null;
  if (company.taxonomy_id !== null) {
    const { data: tax } = await supabase
      .from('arpa_taxonomy')
      .select('sector, category, subsector, growth, fragmentation, consolidation')
      .eq('id', company.taxonomy_id)
      .maybeSingle();
    taxonomy = tax ?? null;
  }

  const scoringInput = toScoringInput(project, company, taxonomy);
  const result = scoreProject(scoringInput, opts);

  const rows = toScoreRows(projectId, result, scoredBy).map((r) => ({ ...r, note: note ?? null }));
  if (rows.length === 0) {
    return { ok: false, message: 'No hay nada que puntuar todavía' };
  }

  const { error: sErr } = await supabase.from('arpa_scores').insert(rows);
  if (sErr) return { ok: false, message: sErr.message };

  // Persist the ticked kill criteria so the veto survives a page reload.
  const flaggedSet = new Set(flagged ?? []);
  const killRows = KILLS.map((k) => ({
    project_id: projectId,
    kill_id: k.id,
    flagged: flaggedSet.has(k.id),
    flagged_by: flaggedSet.has(k.id) ? scoredBy : null,
  }));
  const { error: kErr } = await supabase
    .from('arpa_kill_flags')
    .upsert(killRows, { onConflict: 'project_id,kill_id' });
  if (kErr) return { ok: false, message: kErr.message };

  // Move the project to the stage and decision the gates actually produced.
  const update: Record<string, unknown> = {
    stage: result.stage,
    decision_status: result.decision === '—' ? null : result.decision,
  };
  // Only write a Pass reason when a gate really closed, and only one of their 7.
  if (result.decision === 'Pass' && result.passReason) update.pass_reason = result.passReason;

  const { error: uErr } = await supabase.from('arpa_projects').update(update).eq('id', projectId);
  if (uErr) return { ok: false, message: uErr.message };

  revalidatePath(`/${projectId}`);
  revalidatePath('/pipeline');

  return {
    ok: true,
    overall: result.overall0to100,
    message: `Guardado. ${result.stage} · ${result.decision}${
      result.passReasonMissing ? ' (sin valor en Pass / Lost Reason para este motivo)' : ''
    }`,
  };
}

const companySchema = z.object({
  legal_name: z.string().min(2).max(240),
  cif: z.string().max(20).nullable().optional(),
  country: z.string().length(2).default('ES'),
  region: z.string().max(120).nullable().optional(),
  taxonomy_id: z.coerce.number().int().nullable().optional(),
  taxonomy_fit: z.enum(['in', 'adjacent', 'out']).default('in'),
  ownership_type: z
    .enum(['Founder-owned', 'Family-owned', 'Private equity', 'Corporate subsidiary', 'Public', 'Unknown'])
    .nullable()
    .optional(),
  admin_since: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  owner: z.string().max(120).nullable().optional(),
  source: z.string().max(240).nullable().optional(),
});

/** Create a company and its first project together, which is how a lead arrives. */
export async function createLead(input: unknown): Promise<ActionResult & { projectId?: string }> {
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { owner, source, ...company } = parsed.data;
  const supabase = createClient();

  const { data: created, error: cErr } = await supabase
    .from('arpa_companies')
    .insert(company)
    .select('id')
    .single();

  if (cErr) {
    const hint = cErr.code === '23505' ? ' (ese CIF ya existe)' : '';
    return { ok: false, message: cErr.message + hint };
  }

  const { data: project, error: pErr } = await supabase
    .from('arpa_projects')
    .insert({ company_id: created.id, stage: 'Sourcing', owner: owner ?? null, source: source ?? null })
    .select('id')
    .single();

  if (pErr) return { ok: false, message: pErr.message };

  revalidatePath('/pipeline');
  return { ok: true, message: 'Lead creado', projectId: project.id };
}

const originationStatusSchema = z.object({
  reg_key: z.string().min(3).max(200),
  status: z.enum(['new', 'shortlisted', 'discarded']),
});

/** Marc's triage on the BORME shortlist. `promoted` is set by promoteOrigination. */
export async function setOriginationStatus(input: unknown): Promise<ActionResult> {
  const parsed = originationStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const supabase = createClient();
  const { error } = await supabase
    .from('arpa_origination')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('reg_key', parsed.data.reg_key);

  if (error) return { ok: false, message: error.message };

  revalidatePath('/');
  return { ok: true, message: 'Guardado' };
}

/**
 * Turn a BORME row into a real project.
 *
 * BORME has no CIF, so the company is created without one and Marc fills it in
 * later. The origination row keeps the project id, so promoting twice is a
 * no-op rather than a duplicate.
 */
export async function promoteOrigination(input: unknown): Promise<ActionResult & { projectId?: string }> {
  const parsed = z.object({ reg_key: z.string().min(3).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const supabase = createClient();
  const { data: row, error: rErr } = await supabase
    .from('arpa_origination')
    .select('reg_key, legal_name, province, subsector, cnae, objeto, project_id')
    .eq('reg_key', parsed.data.reg_key)
    .maybeSingle();

  if (rErr) return { ok: false, message: rErr.message };
  if (!row) return { ok: false, message: 'Esa empresa no está en la lista' };
  if (row.project_id) return { ok: true, message: 'Ya estaba en el pipeline', projectId: row.project_id };

  let taxonomyId: number | null = null;
  if (row.subsector) {
    const { data: tax } = await supabase
      .from('arpa_taxonomy')
      .select('id')
      .eq('subsector', row.subsector)
      .maybeSingle();
    taxonomyId = tax?.id ?? null;
  }

  const { data: company, error: cErr } = await supabase
    .from('arpa_companies')
    .insert({
      legal_name: row.legal_name,
      country: 'ES',
      region: row.province,
      taxonomy_id: taxonomyId,
      taxonomy_fit: taxonomyId ? 'in' : 'adjacent',
      cnae: row.cnae,
      notes: row.objeto,
    })
    .select('id')
    .single();

  if (cErr) return { ok: false, message: cErr.message };

  const { data: project, error: pErr } = await supabase
    .from('arpa_projects')
    .insert({ company_id: company.id, stage: 'Sourcing', source: `BORME ${row.reg_key}` })
    .select('id')
    .single();

  if (pErr) return { ok: false, message: pErr.message };

  const { error: uErr } = await supabase
    .from('arpa_origination')
    .update({ status: 'promoted', project_id: project.id, updated_at: new Date().toISOString() })
    .eq('reg_key', row.reg_key);

  if (uErr) return { ok: false, message: uErr.message };

  revalidatePath('/');
  revalidatePath('/pipeline');
  return { ok: true, message: 'Pasada al pipeline', projectId: project.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stakeholder CRM. The blueprint's Contacts + Sources, as one person table and
// a link table, so a banker who appears on four deals is one record.
// ─────────────────────────────────────────────────────────────────────────────

/** Must match the `kind` check constraint on arpa_stakeholders. */
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

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const stakeholderSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  kind: z.enum(STAKEHOLDER_KINDS),
  org: text(200),
  email: z.union([z.string().trim().email().max(200), z.literal('')]).nullable().optional()
    .transform((v) => (v ? v : null)),
  phone: text(60),
  linkedin: text(300),
  city: text(120),
  notes: text(4000),
});

export async function createStakeholder(input: unknown): Promise<ActionResult & { id?: string }> {
  const parsed = stakeholderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('arpa_stakeholders')
    .insert(parsed.data)
    .select('id')
    .single();

  if (error) return { ok: false, message: error.message };

  revalidatePath('/crm');
  return { ok: true, message: 'Contacto creado', id: data.id };
}

export async function updateStakeholder(input: unknown): Promise<ActionResult> {
  const parsed = stakeholderSchema.partial().extend({ id: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const { id, ...patch } = parsed.data;
  const supabase = createClient();
  const { error } = await supabase
    .from('arpa_stakeholders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, message: error.message };

  revalidatePath('/crm');
  return { ok: true, message: 'Guardado' };
}

/**
 * Attach a stakeholder to a company, a project, or both. `role` is the role in
 * THIS deal, which is why it lives on the link and not on the person: the same
 * lawyer can be sell-side on one deal and buy-side on the next.
 */
const linkSchema = z
  .object({
    stakeholder_id: uuid,
    company_id: uuid.nullable().optional(),
    project_id: uuid.nullable().optional(),
    role: text(120),
  })
  .refine((v) => v.company_id || v.project_id, { message: 'target required' });

export async function linkStakeholder(input: unknown): Promise<ActionResult> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Hace falta una empresa o un proyecto' };

  const supabase = createClient();
  const { error } = await supabase.from('arpa_stakeholder_links').insert({
    stakeholder_id: parsed.data.stakeholder_id,
    company_id: parsed.data.company_id ?? null,
    project_id: parsed.data.project_id ?? null,
    role: parsed.data.role,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath('/crm');
  return { ok: true, message: 'Vinculado' };
}

export async function unlinkStakeholder(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const supabase = createClient();
  const { error } = await supabase.from('arpa_stakeholder_links').delete().eq('id', parsed.data.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath('/crm');
  return { ok: true, message: 'Desvinculado' };
}
