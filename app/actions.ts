'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { parseCalendarIcs, parseContactsCsv } from '@/lib/arpa/contacts-import';
import {
  intakeBatchSchema,
  linkPrimaryCompany,
  runIntake,
  type IntakeResult,
} from '@/lib/arpa/intake';
import {
  DOC_TYPES,
  ENRICH_SOURCES,
  INTERACTION_KINDS,
  OWNERSHIP_TYPES,
  STAKEHOLDER_KINDS,
} from '@/lib/arpa/lists';
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
  revalidatePath('/proyectos');
  return { ok: true, message: 'Datos guardados' };
}

/**
 * Move one opportunity between stages from the list, without opening it.
 *
 * Separate from `saveProject` on purpose: that one takes the whole financial
 * form, so reusing it from the list would mean round-tripping thirty fields to
 * change one, and any field the list did not know about would be nulled.
 */
export async function setStage(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, stage: z.enum(STAGES) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Etapa no válida' };

  const supabase = createClient();
  const { error } = await supabase
    .from('arpa_projects')
    .update({ stage: parsed.data.stage, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id);

  if (error) return { ok: false, message: error.message };

  // '/' too: moving a company off Sourcing is exactly what "send it to the
  // pipeline" means on the Originación screen, so that list has to change.
  revalidatePath('/');
  revalidatePath('/proyectos');
  revalidatePath(`/${parsed.data.id}`);
  return { ok: true, message: `Movido a ${parsed.data.stage}` };
}

/**
 * Take a batch of SABI rows and turn each one into a scored opportunity.
 *
 * The rows arrive from `lib/arpa/sabi-xls.ts` running in the BROWSER, which is
 * what keeps a 20 company export under Vercel's 4.5 MB body cap. That makes
 * this the trust boundary: the payload is revalidated here from scratch, and
 * `runIntake` rejects implausible magnitudes, so a wrong client parse cannot
 * write a corrupt figure. `runIntake` reports per row and never aborts the
 * whole batch for one bad line, because losing 400 good rows to one bad one
 * would be unusable.
 */
export async function importBatch(input: unknown): Promise<ActionResult & { result?: IntakeResult }> {
  const parsed = intakeBatchSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: first ? `${first.path.join('.') || 'lote'}: ${first.message}` : 'Lote no válido',
    };
  }

  try {
    const result = await runIntake(parsed.data, 'marc');
    revalidatePath('/');
    revalidatePath('/proyectos');
    return {
      ok: result.rejected === 0,
      message:
        `${result.created} nuevas, ${result.updated} actualizadas` +
        (result.rejected ? `, ${result.rejected} rechazadas` : ''),
      result,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Error desconocido' };
  }
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
  revalidatePath('/proyectos');

  return {
    ok: true,
    overall: result.overall0to100,
    message: `Guardado. ${result.stage} · ${result.decision}${
      result.passReasonMissing ? ' (sin valor en Pass / Lost Reason para este motivo)' : ''
    }`,
  };
}

const companySchema = z.object({
  /**
   * The DEAL's name, not the company's. Optional because most deals are one
   * company and repeating its name adds nothing; null means "call it after its
   * company", which is what every project meant before the column existed.
   */
  name: z.string().trim().max(240).nullable().optional(),
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

  const { name, owner, source, ...company } = parsed.data;
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
    .insert({
      name: name || null,
      company_id: created.id,
      stage: 'Sourcing',
      owner: owner ?? null,
      source: source ?? null,
    })
    .select('id')
    .single();

  if (pErr) return { ok: false, message: pErr.message };
  await linkPrimaryCompany(supabase, project.id, created.id);

  revalidatePath('/proyectos');
  revalidatePath('/');
  return { ok: true, message: 'Proyecto creado', projectId: project.id };
}

/**
 * The proactive door: open a deal on a company a camino surfaced.
 *
 * The temática and the subsector come from the camino that found it, not from a
 * second form. That is the whole claim of the proactive path: the play and the
 * industry were chosen BEFORE the company, so the project inherits them.
 */
export async function startFromCamino(input: unknown): Promise<ActionResult & { projectId?: string }> {
  const parsed = z
    .object({
      company_id: uuid,
      theme_id: z.coerce.number().int(),
      taxonomy_id: z.coerce.number().int(),
      owner: z.string().max(120).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const supabase = createClient();

  // One deal per company from this screen. Opening a second one by accident is
  // how the same target ends up scored twice with two different numbers.
  const { data: existing, error: eErr } = await supabase
    .from('arpa_projects')
    .select('id')
    .eq('company_id', parsed.data.company_id)
    .limit(1);

  if (eErr) return { ok: false, message: eErr.message };
  if (existing && existing.length > 0) {
    return { ok: false, message: 'Esta empresa ya tiene un proyecto abierto', projectId: existing[0].id };
  }

  const { data, error } = await supabase
    .from('arpa_projects')
    .insert({
      company_id: parsed.data.company_id,
      stage: 'Sourcing',
      source: 'Camino temático',
      theme_id: parsed.data.theme_id,
      taxonomy_id: parsed.data.taxonomy_id,
      owner: parsed.data.owner ?? null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, message: error.message };
  await linkPrimaryCompany(supabase, data.id, parsed.data.company_id);

  revalidatePath('/');
  revalidatePath('/proyectos');
  return { ok: true, message: 'Proyecto abierto', projectId: data.id };
}

/**
 * The opportunistic door: an advisor sends an infomemo.
 *
 * One form writes five rows, because that is what actually happened: a company
 * exists, a deal is open on it, somebody sent it, a document arrived, and there
 * is a date on which it did. Splitting that over five screens is how the sender
 * ends up unrecorded, and the sender is the asset.
 *
 * The steps are sequential and each failure says which one broke, so a half
 * written deal is visible instead of looking like a total failure that invites
 * a retry and a duplicate.
 */
export async function createInboundDeal(input: unknown): Promise<ActionResult & { projectId?: string }> {
  const parsed = z
    .object({
      /** The deal's name. Optional, same rule as `createLead`. */
      name: z.string().trim().max(240).nullable().optional(),
      legal_name: z.string().trim().min(2).max(240),
      cif: text(20),
      region: text(120),
      taxonomy_id: z.coerce.number().int().nullable().optional(),
      theme_id: z.coerce.number().int().nullable().optional(),
      sender_name: z.string().trim().min(2).max(200),
      sender_org: text(200),
      sender_email: z.union([z.string().trim().email().max(200), z.literal('')]).nullable().optional()
        .transform((v) => (v ? v : null)),
      sender_kind: z.enum(STAKEHOLDER_KINDS).default('Intermediary'),
      doc_title: z.string().trim().min(2).max(300),
      received_on: z.string().trim().max(40).nullable().optional(),
      note: text(1000),
      owner: text(120),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const d = parsed.data;
  const supabase = createClient();

  const { data: company, error: cErr } = await supabase
    .from('arpa_companies')
    .insert({
      legal_name: d.legal_name,
      cif: d.cif ? d.cif.toUpperCase() : null,
      country: 'ES',
      region: d.region,
      taxonomy_id: d.taxonomy_id ?? null,
    })
    .select('id')
    .single();

  if (cErr) {
    const hint = cErr.code === '23505' ? ' (ese CIF ya existe, abre la empresa y añade el documento allí)' : '';
    return { ok: false, message: `Empresa: ${cErr.message}${hint}` };
  }

  // Screening and not Sourcing. An infomemo is already a described company, so
  // the 15 minute screening is the next gate, not identification.
  const { data: project, error: pErr } = await supabase
    .from('arpa_projects')
    .insert({
      name: d.name || null,
      company_id: company.id,
      stage: 'Screening',
      source: 'Infomemo',
      theme_id: d.theme_id ?? null,
      taxonomy_id: d.taxonomy_id ?? null,
      owner: d.owner,
    })
    .select('id')
    .single();

  if (pErr) return { ok: false, message: `Proyecto: ${pErr.message}` };
  await linkPrimaryCompany(supabase, project.id, company.id);

  const { data: person, error: sErr } = await supabase
    .from('arpa_stakeholders')
    .insert({ full_name: d.sender_name, org: d.sender_org, kind: d.sender_kind, email: d.sender_email })
    .select('id')
    .single();

  if (sErr) {
    return { ok: false, message: `Deal creado, pero sin remitente: ${sErr.message}`, projectId: project.id };
  }

  const { error: lErr } = await supabase.from('arpa_stakeholder_links').insert({
    stakeholder_id: person.id,
    project_id: project.id,
    company_id: company.id,
    role: 'Remitente del infomemo',
  });

  if (lErr) {
    return { ok: false, message: `Deal creado, remitente sin vincular: ${lErr.message}`, projectId: project.id };
  }

  const { error: dErr } = await supabase.from('arpa_documents').insert({
    project_id: project.id,
    company_id: company.id,
    title: d.doc_title,
    doc_type: 'Info memo',
    // A filename, not a URL. The file itself is in their mail or SharePoint:
    // storing a link we cannot resolve would put a dead hyperlink on screen.
    storage_path: d.doc_title,
    uploaded_by: d.owner,
  });

  if (dErr) {
    return { ok: false, message: `Deal creado, documento no registrado: ${dErr.message}`, projectId: project.id };
  }

  const { error: iErr } = await supabase.from('arpa_interactions').insert({
    kind: 'Email',
    direction: 'inbound',
    project_id: project.id,
    company_id: company.id,
    stakeholder_id: person.id,
    happened_at: d.received_on || new Date().toISOString().slice(0, 10),
    summary: d.note ?? `Infomemo recibido: ${d.doc_title}`,
    logged_by: d.owner,
  });

  if (iErr) {
    return { ok: false, message: `Deal creado, interacción no registrada: ${iErr.message}`, projectId: project.id };
  }

  revalidatePath('/');
  revalidatePath('/crm');
  revalidatePath('/proyectos');
  return { ok: true, message: 'Deal entrante registrado', projectId: project.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stakeholder CRM. The blueprint's Contacts + Sources, as one person table and
// a link table, so a banker who appears on four deals is one record.
// ─────────────────────────────────────────────────────────────────────────────

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
  /**
   * The investor profile Marc described: what they invest in, what they do not,
   * and the cheque they can write. Blank on everyone who is not an investor,
   * which is fine, these are additive columns and nothing reads them as required.
   */
  invest_thesis: text(4000),
  sectors_in: text(1000),
  sectors_out: text(1000),
  /** M€. Same unit as the project financials, so no conversion at read time. */
  ticket_min: money,
  ticket_max: money,
});

/**
 * Create a contact, optionally attached to a company in the same call.
 *
 * The company is optional because a banker you met at a conference belongs to
 * nobody yet. It is on this form because the usual case is the opposite: you are
 * writing down the owner OF a specific company you just sent to the pipeline,
 * and making that a second step on a second screen is how contacts end up
 * floating unattached.
 */
export async function createStakeholder(input: unknown): Promise<ActionResult & { id?: string }> {
  const parsed = stakeholderSchema
    .extend({
      company_id: uuid.nullable().optional(),
      project_id: uuid.nullable().optional(),
      role: text(120),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const { company_id, project_id, role, ...person } = parsed.data;
  const supabase = createClient();
  const { data, error } = await supabase
    .from('arpa_stakeholders')
    .insert(person)
    .select('id')
    .single();

  if (error) return { ok: false, message: error.message };

  if (company_id || project_id) {
    const { error: lErr } = await supabase.from('arpa_stakeholder_links').insert({
      stakeholder_id: data.id,
      company_id: company_id ?? null,
      project_id: project_id ?? null,
      role,
    });
    // The person exists. Say that, or the next attempt creates a duplicate.
    if (lErr) {
      revalidatePath('/crm');
      return {
        ok: false,
        message: `Contacto creado pero sin vincular: ${lErr.message}`,
        id: data.id,
      };
    }
    if (project_id) revalidatePath(`/${project_id}`);
  }

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
  // Linking usually happens from a project page, so that page has to refresh too.
  if (parsed.data.project_id) revalidatePath(`/${parsed.data.project_id}`);
  return { ok: true, message: 'Vinculado' };
}

export async function unlinkStakeholder(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ id: uuid, project_id: uuid.nullable().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const supabase = createClient();
  const { error } = await supabase.from('arpa_stakeholder_links').delete().eq('id', parsed.data.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath('/crm');
  if (parsed.data.project_id) revalidatePath(`/${parsed.data.project_id}`);
  return { ok: true, message: 'Desvinculado' };
}

/**
 * Create a person and attach them to this project in one go.
 *
 * The CRM tab is the right place to manage people who recur across deals. This
 * exists because the common case on a live deal is "I just spoke to the CFO",
 * and making that a two screen job is how contacts end up never recorded.
 */
export async function addProjectStakeholder(input: unknown): Promise<ActionResult> {
  const parsed = stakeholderSchema
    .extend({ project_id: uuid, role: text(120) })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { project_id, role, ...person } = parsed.data;
  const supabase = createClient();

  const { data, error } = await supabase
    .from('arpa_stakeholders')
    .insert(person)
    .select('id')
    .single();

  if (error) return { ok: false, message: error.message };

  const { error: lErr } = await supabase
    .from('arpa_stakeholder_links')
    .insert({ stakeholder_id: data.id, project_id, role });

  // The person exists but is orphaned. Say so instead of a generic failure,
  // otherwise the next attempt creates a duplicate.
  if (lErr) {
    return {
      ok: false,
      message: `Persona creada pero sin vincular: ${lErr.message}. Vincúlala desde Contactos.`,
    };
  }

  revalidatePath(`/${project_id}`);
  revalidatePath('/crm');
  return { ok: true, message: 'Persona añadida' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactions and the agenda.
//
// An agenda item is not its own record: it is the `next_step` of an interaction.
// That is deliberate. A task table would let the to-do and the conversation that
// produced it drift apart, and the thing ARPA needs to trust is "what did we
// promise this person, and when".
// ─────────────────────────────────────────────────────────────────────────────

const interactionSchema = z
  .object({
    kind: z.enum(INTERACTION_KINDS),
    stakeholder_id: uuid.nullable().optional(),
    project_id: uuid.nullable().optional(),
    company_id: uuid.nullable().optional(),
    /** A date input, so `YYYY-MM-DD`. Empty string means no date, not today. */
    happened_at: z.string().trim().max(40).nullable().optional(),
    summary: text(1000),
    detail: text(8000),
    next_step: text(1000),
    next_step_due: z
      .string()
      .trim()
      .max(10)
      .nullable()
      .optional()
      // A malformed date becomes no date rather than an error: losing the due
      // date is recoverable, losing the whole logged interaction is not.
      .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
    logged_by: text(120),
  })
  .refine((v) => v.summary || v.next_step, { message: 'Escribe un resumen o un siguiente paso' });

export async function logInteraction(input: unknown): Promise<ActionResult> {
  const parsed = interactionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { happened_at, ...rest } = parsed.data;
  const supabase = createClient();
  const { error } = await supabase.from('arpa_interactions').insert({
    ...rest,
    stakeholder_id: rest.stakeholder_id ?? null,
    project_id: rest.project_id ?? null,
    company_id: rest.company_id ?? null,
    next_step_due: rest.next_step_due ?? null,
    // The column defaults to now(), so an empty field has to be left out of the
    // payload entirely rather than sent as null, which would violate not null.
    ...(happened_at ? { happened_at: new Date(happened_at).toISOString() } : {}),
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath('/crm');
  if (parsed.data.project_id) revalidatePath(`/${parsed.data.project_id}`);
  return { ok: true, message: 'Registrado' };
}

/**
 * Tick an agenda item off. The next step text stays, only the closing stamp is
 * written, so the promise and the fact it was kept are both still on the record.
 */
export async function completeNextStep(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ id: uuid, project_id: uuid.nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const supabase = createClient();
  const { error } = await supabase
    .from('arpa_interactions')
    .update({ next_step_done_at: new Date().toISOString() })
    .eq('id', parsed.data.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath('/crm');
  if (parsed.data.project_id) revalidatePath(`/${parsed.data.project_id}`);
  return { ok: true, message: 'Hecho' };
}

const int = (min: number, max: number) =>
  z
    .union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : parseInt(v, 10);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    });

const enrichSchema = z.object({
  company_id: uuid,
  /** Only used to revalidate the page the form was submitted from. */
  project_id: uuid.nullable().optional(),
  trade_name: text(200),
  cif: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  website: text(300),
  city: text(120),
  region: text(120),
  cnae: text(10),
  employees: int(0, 5_000_000),
  founded_year: int(1800, 2100),
  admin_since: int(1800, 2100),
  taxonomy_id: int(1, 100_000),
  ownership_type: z.enum(OWNERSHIP_TYPES).nullable().optional(),
  enrich_source: z.enum(ENRICH_SOURCES),
  enriched_by: text(120),
});

/**
 * The single entry point for filling a company ficha.
 *
 * Today a human reads SABI and types the numbers, because there is no API seat.
 * That is deliberate, not a stopgap shape: when an API arrives, the integration
 * calls THIS function with the same payload, so the validation, the provenance
 * stamp and the revalidation stay in one place. Nothing about where the data
 * lands has to be rewritten.
 *
 * Financials are not here. Revenue, EBITDA, debt and the rest belong to
 * arpa_projects, because they are a snapshot taken during a process, and
 * saveProject already writes them.
 */
export async function enrichCompany(input: unknown): Promise<ActionResult> {
  const parsed = enrichSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const { company_id, project_id, ...fields } = parsed.data;
  const supabase = createClient();

  const { error } = await supabase
    .from('arpa_companies')
    .update({ ...fields, enriched_at: new Date().toISOString() })
    .eq('id', company_id);

  if (error) {
    const hint = error.code === '23505' ? ' (ese CIF ya existe en otra empresa)' : '';
    return { ok: false, message: `${error.message}${hint}` };
  }

  if (project_id) revalidatePath(`/${project_id}`);
  revalidatePath('/proyectos');
  return { ok: true, message: 'Ficha actualizada' };
}

const documentSchema = z.object({
  project_id: uuid,
  company_id: uuid.nullable().optional(),
  title: z.string().trim().min(2).max(300),
  /** NOT NULL in the table, with default 'Other'. Never send null. */
  doc_type: z.enum(DOC_TYPES).default('Other'),
  /**
   * Required, not optional. The table has
   *   check (storage_path is not null or external_url is not null)
   * and we never write storage_path, so an empty URL would fail at the
   * database. Better to reject it here with a sentence a human can act on.
   */
  external_url: z.string().trim().url({ message: 'Hace falta un enlace válido' }).max(600),
  period: text(60),
  uploaded_by: text(120),
});

/**
 * Registers a document by LINK, not by upload.
 *
 * The team already keeps files in Drive and that is where version history and
 * sharing live. Re-uploading into Supabase Storage would create a second copy
 * that immediately starts drifting from the one people actually edit. So this
 * records where the document is, and the storage_path column stays free for the
 * day we decide we do want custody of the file.
 */
export async function addDocument(input: unknown): Promise<ActionResult> {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = createClient();
  const { error } = await supabase.from('arpa_documents').insert(parsed.data);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/${parsed.data.project_id}`);
  return { ok: true, message: 'Documento registrado' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk import of contacts and meetings.
//
// Both of these files get uploaded MORE THAN ONCE: you export your address book
// again next month and drop the new one in. So the only interesting question is
// not "can I read the file" but "what happens on the second upload", and the
// answer has to be an update, never a duplicate.
//
// The text is parsed HERE and not in the browser, unlike the SABI workbook. A
// contacts export is text and measured in hundreds of kilobytes, so it fits in a
// request body with room to spare, and parsing server-side means there is only
// one parser and therefore no trust boundary to defend.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportReport extends ActionResult {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

const fail = (message: string): ImportReport => ({
  ok: false,
  message,
  created: 0,
  updated: 0,
  skipped: 0,
  warnings: [],
});

const uploadSchema = z.object({
  /** Recorded on each row as `import_source`, so imported data stays findable. */
  file_name: z.string().trim().min(1).max(240),
  text: z.string().min(1).max(4_000_000, 'El fichero es demasiado grande.'),
});

/** PostgREST caps an unbounded select at 1,000 rows and says nothing about it. */
const READ_PAGE = 1000;
/** Rows per insert. Large enough to be one round trip for a normal address book. */
const WRITE_CHUNK = 500;

type Client = ReturnType<typeof createClient>;

/** Every row of one table, in pages, because an unbounded select lies. */
async function readAll<T>(client: Client, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += READ_PAGE) {
    const page = await client.from(table).select(columns).range(from, from + READ_PAGE - 1);
    if (page.error) throw new Error(`${table}: ${page.error.message}`);
    const got = (page.data ?? []) as unknown as T[];
    out.push(...got);
    if (got.length < READ_PAGE) return out;
  }
}

interface ExistingPerson {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  org: string | null;
  city: string | null;
  notes: string | null;
}

/**
 * The fields an import is allowed to touch on a person who already exists.
 *
 * `kind`, LinkedIn and the whole investor block are missing on purpose: those
 * are judgements somebody typed, and no address book export knows better.
 */
const FILLABLE = ['email', 'phone', 'org', 'city', 'notes'] as const;

export async function importContacts(input: unknown): Promise<ImportReport> {
  const parsed = uploadSchema
    .extend({ kind: z.enum(STAKEHOLDER_KINDS).default('Other') })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos no válidos');

  const { rows, warnings } = parseContactsCsv(parsed.data.text);
  if (rows.length === 0) {
    return { ...fail('No he encontrado ningún contacto en el fichero.'), warnings };
  }

  const supabase = createClient();
  let existing: ExistingPerson[];
  try {
    existing = await readAll<ExistingPerson>(
      supabase,
      'arpa_stakeholders',
      'id, full_name, email, phone, org, city, notes',
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'No he podido leer los contactos.');
  }

  // Email is the real key. Name is the fallback for the many real contacts that
  // have no email at all: without it, every email-less person is duplicated on
  // the second upload, which is worse than occasionally merging two people who
  // genuinely share a name in a CRM this size.
  const key = (email: string | null, name: string) =>
    email ? `e:${email.toLowerCase()}` : `n:${name.trim().toLowerCase()}`;

  const index = new Map<string, ExistingPerson>();
  for (const p of existing) {
    if (p.email) index.set(key(p.email, p.full_name), p);
    // Keep the name key too, so a row with no email still finds a person who
    // does have one.
    const nameKey = key(null, p.full_name);
    if (!index.has(nameKey)) index.set(nameKey, p);
  }

  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, string> }[] = [];
  let skipped = 0;
  // Two rows of the same file can be the same person. Without this the second
  // one trips the unique index and takes the whole chunk down with it.
  const seen = new Set<string>();

  for (const r of rows) {
    const k = r.email ? key(r.email, r.full_name) : key(null, r.full_name);
    if (seen.has(k)) {
      skipped += 1;
      continue;
    }
    seen.add(k);

    const match = index.get(k) ?? (r.email ? undefined : index.get(key(null, r.full_name)));
    if (!match) {
      inserts.push({
        full_name: r.full_name,
        kind: parsed.data.kind,
        email: r.email,
        phone: r.phone,
        org: r.org,
        city: r.city,
        notes: r.notes,
        import_source: parsed.data.file_name,
      });
      continue;
    }

    // Fill the gaps, never overwrite. A month-old export must not be able to
    // wipe a phone number somebody corrected by hand last week.
    const patch: Record<string, string> = {};
    for (const f of FILLABLE) {
      if (match[f] === null && r[f] !== null) patch[f] = r[f] as string;
    }
    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }
    updates.push({ id: match.id, patch });
  }

  for (let i = 0; i < inserts.length; i += WRITE_CHUNK) {
    const { error } = await supabase
      .from('arpa_stakeholders')
      .insert(inserts.slice(i, i + WRITE_CHUNK));
    if (error) {
      return {
        ...fail(`Importación interrumpida: ${error.message}`),
        created: i,
        warnings,
      };
    }
  }

  for (const u of updates) {
    const { error } = await supabase
      .from('arpa_stakeholders')
      .update({ ...u.patch, updated_at: new Date().toISOString() })
      .eq('id', u.id);
    // One failed patch is not worth abandoning the rest of the file over.
    if (error) warnings.push(`No he podido completar un contacto: ${error.message}`);
  }

  revalidatePath('/crm');
  return {
    ok: true,
    message:
      `${inserts.length} contacto(s) nuevo(s), ${updates.length} completado(s), ` +
      `${skipped} sin cambios.`,
    created: inserts.length,
    updated: updates.length,
    skipped,
    warnings,
  };
}

/**
 * Turn a calendar export into logged meetings.
 *
 * An event is only imported when at least one of its attendees is already a
 * contact. That is the whole point: the value is "when did we last speak to this
 * person", and an event nobody recognises is just a copy of a calendar we are
 * not trying to replace. Events are skipped rather than used to invent people,
 * because an ATTENDEE line carries a display name and nothing else, so importing
 * them would fill the CRM with rows that can never be told apart from real ones.
 */
export async function importCalendar(input: unknown): Promise<ImportReport> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos no válidos');

  const { rows, warnings } = parseCalendarIcs(parsed.data.text);
  if (rows.length === 0) {
    return { ...fail('No he encontrado ningún evento en el fichero.'), warnings };
  }

  const supabase = createClient();
  let people: { id: string; email: string | null }[];
  let logged: { external_uid: string | null; stakeholder_id: string | null }[];
  try {
    [people, logged] = await Promise.all([
      readAll<{ id: string; email: string | null }>(supabase, 'arpa_stakeholders', 'id, email'),
      readAll<{ external_uid: string | null; stakeholder_id: string | null }>(
        supabase,
        'arpa_interactions',
        'external_uid, stakeholder_id',
      ),
    ]);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'No he podido leer la base.');
  }

  const byEmail = new Map<string, string>();
  for (const p of people) if (p.email) byEmail.set(p.email.toLowerCase(), p.id);

  if (byEmail.size === 0) {
    return {
      ...fail('Ningún contacto tiene email, así que no puedo cruzar el calendario.'),
      warnings,
    };
  }

  // The unique index on (external_uid, stakeholder_id) would catch a repeat, but
  // as an error that aborts a whole chunk. Checking first makes a second upload
  // a quiet no-op, which is what re-uploading the same calendar should feel like.
  const already = new Set(
    logged.filter((i) => i.external_uid).map((i) => `${i.external_uid}|${i.stakeholder_id}`),
  );

  const inserts: Record<string, unknown>[] = [];
  let unknownPeople = 0;
  let skipped = 0;

  for (const ev of rows) {
    const ids = [...new Set(ev.emails.map((e) => byEmail.get(e)).filter(Boolean) as string[])];
    if (ids.length === 0) {
      unknownPeople += 1;
      continue;
    }
    // One row per recognised attendee, so the meeting shows up on each of their
    // records and "last contact" is right for all of them.
    for (const id of ids) {
      if (already.has(`${ev.uid}|${id}`)) {
        skipped += 1;
        continue;
      }
      already.add(`${ev.uid}|${id}`);
      inserts.push({
        kind: 'Meeting',
        stakeholder_id: id,
        happened_at: ev.starts_at,
        summary: ev.summary,
        detail: ev.detail,
        external_uid: ev.uid,
        logged_by: parsed.data.file_name,
      });
    }
  }

  if (unknownPeople > 0) {
    warnings.push(
      `${unknownPeople} evento(s) sin ningún asistente conocido, no importados. Sube primero ` +
        'los contactos y vuelve a subir el calendario.',
    );
  }

  for (let i = 0; i < inserts.length; i += WRITE_CHUNK) {
    const { error } = await supabase
      .from('arpa_interactions')
      .insert(inserts.slice(i, i + WRITE_CHUNK));
    if (error) {
      return { ...fail(`Importación interrumpida: ${error.message}`), created: i, warnings };
    }
  }

  revalidatePath('/crm');
  return {
    ok: true,
    message: `${inserts.length} reunión(es) registrada(s), ${skipped} ya estaban.`,
    created: inserts.length,
    updated: 0,
    skipped,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The two master lists: temáticas and the industry taxonomy.
//
// Both are reference data that ARPA owns and that almost never changes, so they
// live behind Ajustes rather than in the daily screens. Everything written here
// lands with is_example false, which is what separates ARPA's own content from
// the demo rows a migration seeded.
// ─────────────────────────────────────────────────────────────────────────────

/** A slug from a name: lowercase, accents folded, spaces to hyphens. */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

const themeSchema = z.object({
  id: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  thesis: text(2000),
  fit_criteria: text(2000),
  active: z.coerce.boolean().default(true),
  sort: z.coerce.number().int().min(0).max(999).default(0),
});

export async function saveTheme(input: unknown): Promise<ActionResult> {
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const { id, name, ...rest } = parsed.data;
  const supabase = createClient();

  // Editing never rewrites the slug. It is the stable handle, and a renamed
  // temática is the same play with a better name.
  const { error } = id
    ? await supabase.from('arpa_themes').update({ name, ...rest, updated_at: new Date().toISOString() }).eq('id', id)
    : await supabase.from('arpa_themes').insert({ name, slug: slugify(name), is_example: false, ...rest });

  if (error) return { ok: false, message: error.message };
  revalidatePath('/ajustes');
  revalidatePath('/proyectos');
  return { ok: true, message: id ? 'Temática guardada' : 'Temática creada' };
}

export async function deleteTheme(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const supabase = createClient();
  // The foreign key is ON DELETE SET NULL, so the projects survive and simply
  // lose their temática. Say how many, or the deletion looks free.
  const { count } = await supabase
    .from('arpa_projects')
    .select('id', { count: 'exact', head: true })
    .eq('theme_id', parsed.data.id);

  const { error } = await supabase.from('arpa_themes').delete().eq('id', parsed.data.id);
  if (error) return { ok: false, message: error.message };

  revalidatePath('/ajustes');
  revalidatePath('/proyectos');
  return {
    ok: true,
    message: count ? `Temática borrada. ${count} proyecto(s) se quedan sin temática.` : 'Temática borrada',
  };
}

/** A comma or newline separated input to a clean array, or null when empty. */
const list = z
  .union([z.string(), z.array(z.string())])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const parts = (Array.isArray(v) ? v : v.split(/[,\n]/)).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts.slice(0, 40) : null;
  });

const industrySchema = z.object({
  id: z.coerce.number().int().positive().nullable().optional(),
  sector: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(120),
  subsector: z.string().trim().min(2).max(160),
  growth: z.enum(['H', 'M', 'L']).nullable().optional(),
  fragmentation: z.enum(['H', 'M', 'L']).nullable().optional(),
  consolidation: z.enum(['H', 'M', 'L']).nullable().optional(),
  pre_score: z.coerce.number().int().min(0).max(100).nullable().optional(),
  margin_typical_pct: money,
  cnae_codes: list,
  keywords: list,
  notes: text(2000),
  active: z.coerce.boolean().default(true),
});

export async function saveIndustry(input: unknown): Promise<ActionResult> {
  const parsed = industrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };

  const { id, ...fields } = parsed.data;
  const supabase = createClient();

  // Saving a seeded row makes it ARPA's: the example flag is what the screens
  // use to say "this number is not yours yet", and once it is edited, it is.
  const { error } = id
    ? await supabase.from('arpa_taxonomy').update({ ...fields, is_example: false }).eq('id', id)
    : await supabase.from('arpa_taxonomy').insert({ ...fields, is_example: false });

  if (error) return { ok: false, message: error.message };
  revalidatePath('/ajustes');
  revalidatePath('/proyectos');
  return { ok: true, message: id ? 'Subsector guardado' : 'Subsector creado' };
}

/**
 * Removes every row a seed migration wrote.
 *
 * Deliberately one button and not a per-row delete: the point of the flag is
 * that the demo content leaves in one action, so nobody has to remember which
 * of thirty rows was invented.
 */
export async function clearExamples(): Promise<ActionResult> {
  const supabase = createClient();

  // Companies first, and almost everything else goes with them: projects,
  // scores, kill flags, documents, interactions and links all cascade from
  // arpa_companies. People are a separate root, because a person is not owned
  // by a company.
  for (const table of ['arpa_companies', 'arpa_stakeholders'] as const) {
    const { error } = await supabase.from(table).delete().eq('is_example', true);
    if (error) return { ok: false, message: error.message };
  }

  // Then the stragglers: an example row hung on a REAL company survives the
  // cascade, so it is deleted by its own flag.
  for (const table of [
    'arpa_scores',
    'arpa_interactions',
    'arpa_documents',
    'arpa_stakeholder_links',
    'arpa_project_companies',
    'arpa_projects',
  ] as const) {
    const { error } = await supabase.from(table).delete().eq('is_example', true);
    if (error) return { ok: false, message: error.message };
  }

  // A seeded subsector a project already points at is NOT deleted. Deleting it
  // would null that project's industry, which is a worse outcome than leaving
  // one labelled row behind, so it is reported instead. This runs AFTER the
  // deletes above, so a subsector only the demo deals used is now free.
  const [{ data: used }, { data: seeded }] = await Promise.all([
    supabase.from('arpa_projects').select('taxonomy_id').not('taxonomy_id', 'is', null),
    supabase.from('arpa_taxonomy').select('id').eq('is_example', true),
  ]);

  const inUse = new Set((used ?? []).map((r) => r.taxonomy_id as number));
  const removable = ((seeded ?? []) as { id: number }[]).map((r) => r.id).filter((id) => !inUse.has(id));
  const kept = ((seeded ?? []).length) - removable.length;

  const tErr = (await supabase.from('arpa_themes').delete().eq('is_example', true)).error;
  if (tErr) return { ok: false, message: tErr.message };

  if (removable.length > 0) {
    const iErr = (await supabase.from('arpa_taxonomy').delete().in('id', removable)).error;
    if (iErr) return { ok: false, message: iErr.message };
  }

  revalidatePath('/ajustes');
  revalidatePath('/proyectos');
  return {
    ok: true,
    message: kept
      ? `Ejemplos borrados. ${kept} subsector(es) se quedan porque hay proyectos usándolos.`
      : 'Ejemplos borrados.',
  };
}

/**
 * Says which play a deal is and in which subsector.
 *
 * Company + temática + industria is Ignasi's definition of a project, and this
 * is the action that completes the other two thirds.
 */
export async function setProjectFocus(input: unknown): Promise<ActionResult> {
  const parsed = z
    .object({
      project_id: uuid,
      theme_id: z.coerce.number().int().positive().nullable().optional(),
      taxonomy_id: z.coerce.number().int().positive().nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Datos no válidos' };

  const { project_id, theme_id, taxonomy_id } = parsed.data;
  const supabase = createClient();
  const { error } = await supabase
    .from('arpa_projects')
    .update({ theme_id: theme_id ?? null, taxonomy_id: taxonomy_id ?? null })
    .eq('id', project_id);

  if (error) return { ok: false, message: error.message };
  revalidatePath('/proyectos');
  revalidatePath(`/${project_id}`);
  return { ok: true, message: 'Enfoque guardado' };
}
