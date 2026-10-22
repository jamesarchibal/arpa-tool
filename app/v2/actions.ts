'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { getGateFacts } from '@/lib/ios/db';
import {
  advanceTarget,
  decisionType,
  gateReady,
  isDecisionAllowed,
  nextDeliverable,
  type ProjectPatch,
} from '@/lib/ios/gates';
import {
  SABI_ORIGIN,
  SABI_SOURCE_NAME,
  fillPatch,
  pickArchetype,
  toLongListDraft,
  type ExistingCompany,
} from '@/lib/ios/sabi-import';
import { KILL_IDS, RATING_KEYS, scoreProject } from '@/lib/ios/scoring';
import {
  CLOSING_STATUS,
  CONFIDENTIALITY,
  DOC_STATUS,
  DOC_TYPES,
  FULL_DD_STATUS,
  GATE_DECISIONS,
  LOI_STATUS,
  PASS_LOST_REASONS,
  PRIORITY,
  PROJECT_TYPES,
  STAGES,
  STAGE_DELIVERABLE,
  THESIS_FIT,
} from '@/lib/ios/lists';

/**
 * V2's writes. Note what is NOT here: there is no `setStage`.
 *
 * In V1 the stage is a dropdown, and a dropdown means the board is whatever
 * somebody last clicked. V2 implements their model instead: the stage is the
 * output of `recordGateDecision`, and the only way to move is to record a
 * decision that an open gate justified. If this action has a bug the pipeline
 * freezes, which is a real risk and the reason the escape hatch is a documented
 * `scripts/q.mjs` patch and not a control in the interface.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

const uuid = z.string().uuid();
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .trim()
    .optional()
    .transform((v) => (v ? v : null));

// --------------------------------------------------------------- the project

const createSchema = z.object({
  name: z.string().trim().min(2, 'El proyecto necesita un nombre').max(200),
  project_type: z.enum(PROJECT_TYPES).default('Single Company'),
  thesis_id: uuid.optional().nullable(),
  industry_id: uuid.optional().nullable(),
  company_id: uuid.optional().nullable(),
  owner: optionalText(120),
  priority: z.enum(PRIORITY).optional().nullable(),
});

/**
 * A new project always starts at Screening with a QSS at Not Started, because
 * that is the only entry their funnel has. No `stage` argument on purpose.
 */
export async function createIosProject(
  input: unknown,
): Promise<ActionResult & { projectId?: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }
  const { company_id, ...fields } = parsed.data;
  const supabase = createClient();

  const project = await supabase
    .from('ios_projects')
    .insert({ ...fields, stage: 'Screening', stage_status: 'In Progress' })
    .select('id')
    .single();
  if (project.error) return { ok: false, message: project.error.message };
  const projectId = project.data.id as string;

  const deliverable = STAGE_DELIVERABLE.Screening;
  await supabase
    .from('ios_documents')
    .insert({ project_id: projectId, doc_type: deliverable, doc_status: 'Not Started' });

  if (company_id) {
    await supabase
      .from('ios_project_companies')
      .insert({ project_id: projectId, company_id, role: 'Target' });
  }

  revalidatePath('/v2');
  revalidatePath('/v2/pipeline');
  return { ok: true, message: 'Proyecto creado en Screening', projectId };
}

/**
 * The editable fields of a project. `stage` and `project_status` are absent, and
 * that absence is the feature: everything a gate reads can be edited here, but
 * the result of the gate cannot.
 */
const updateSchema = z.object({
  id: uuid,
  owner: optionalText(120),
  priority: z.enum(PRIORITY).nullable().optional(),
  thesis_id: uuid.nullable().optional(),
  thesis_fit: z.enum(THESIS_FIT).nullable().optional(),
  industry_id: uuid.nullable().optional(),
  next_step: optionalText(400),
  next_step_due: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  loi_status: z.enum(LOI_STATUS).optional(),
  full_dd_status: z.enum(FULL_DD_STATUS).optional(),
  closing_status: z.enum(CLOSING_STATUS).optional(),
  open_required_dd_items: z.coerce.number().int().min(0).max(999).optional(),
  notes: optionalText(4000),
});

export async function updateIosProject(input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }
  const { id, ...fields } = parsed.data;
  const supabase = createClient();
  const { error } = await supabase
    .from('ios_projects')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/v2/pipeline/${id}`);
  revalidatePath('/v2/pipeline');
  revalidatePath('/v2');
  return { ok: true, message: 'Guardado' };
}

// ------------------------------------------------------------- the documents

const docSchema = z.object({
  id: uuid.optional(),
  project_id: uuid,
  doc_type: z.enum(DOC_TYPES),
  doc_status: z.enum(DOC_STATUS),
  version: z.coerce.number().int().min(1).max(99).default(1),
  title: optionalText(300),
  confidentiality: z.enum(CONFIDENTIALITY).default('Internal'),
  url: optionalText(1000),
});

/** Create or update one deliverable. Approving stamps the date. */
export async function saveIosDocument(input: unknown): Promise<ActionResult> {
  const parsed = docSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }
  const { id, ...fields } = parsed.data;
  const supabase = createClient();

  const row = {
    ...fields,
    approved_at: fields.doc_status === 'Approved' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from('ios_documents').update(row).eq('id', id)
    : await supabase.from('ios_documents').insert(row);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/v2/pipeline/${fields.project_id}`);
  revalidatePath('/v2/pipeline');
  revalidatePath('/v2');
  return { ok: true, message: 'Documento guardado' };
}

// -------------------------------------------------------------- the decision

const HOLD_DAYS = 90;

const decisionSchema = z.object({
  project_id: uuid,
  gate: z.enum(STAGES),
  decision: z.enum(GATE_DECISIONS),
  rationale: z.string().trim().min(10, 'La justificación es obligatoria').max(4000),
  decided_by: optionalText(120),
  pass_lost_reason: z.enum(PASS_LOST_REASONS).nullable().optional(),
  decisive_evidence: optionalText(2000),
});

/**
 * Record one gate decision. The only writer of `ios_projects.stage`.
 *
 * Order matters, and it is their automation A16 read top to bottom:
 *
 *   1. the decision must belong to the stage the project is in
 *   2. the decision must be one this gate allows
 *   3. an Advance needs the gate open, and if it is not, the attempt is still
 *      recorded as Blocked with the failing checks attached
 *
 * Step 3 is why this never just returns an error. A refused advance is the most
 * useful row in the log: it says the team wanted to move and what stopped them.
 */
export async function recordGateDecision(input: unknown): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }
  const data = parsed.data;
  const supabase = createClient();

  const project = await supabase
    .from('ios_projects')
    .select('id, stage, project_status')
    .eq('id', data.project_id)
    .maybeSingle();
  if (project.error) return { ok: false, message: project.error.message };
  if (!project.data) return { ok: false, message: 'El proyecto no existe' };

  const stage = project.data.stage as (typeof STAGES)[number];
  const statusBefore = project.data.project_status as string;

  if (data.gate !== stage) {
    return { ok: false, message: `La decisión es del gate ${data.gate} y el proyecto está en ${stage}` };
  }
  if (!isDecisionAllowed(stage, data.decision)) {
    return { ok: false, message: `"${data.decision}" no es una decisión de este gate` };
  }

  const facts = await getGateFacts(data.project_id);
  if (!facts) return { ok: false, message: 'No hay datos de gate para el proyecto' };

  const readiness = gateReady(facts);
  const type = decisionType(data.decision);
  const now = new Date();

  const base = {
    project_id: data.project_id,
    gate: data.gate,
    decision: data.decision,
    decision_type: type,
    rationale: data.rationale,
    decided_by: data.decided_by,
    gate_ready_detail: readiness.checks,
    stage_before: stage,
    project_status_before: statusBefore,
    pass_lost_reason: data.pass_lost_reason ?? null,
    decisive_evidence: data.decisive_evidence,
  };

  // The blocked attempt. Recorded, nothing moved.
  if (type === 'Advance' && !readiness.ready) {
    const missing = readiness.checks.filter((c) => !c.ok).map((c) => c.label);
    const { error } = await supabase.rpc('ios_record_gate_decision', {
      decision: {
        ...base,
        status: 'Blocked',
        gate_ready_at_decision: false,
        blocked_reason: missing.join('; '),
      },
      project_patch: {},
      new_docs: [],
    });
    if (error) return { ok: false, message: error.message };
    revalidatePath(`/v2/pipeline/${data.project_id}`);
    revalidatePath('/v2/decisiones');
    return { ok: false, message: `Gate cerrado: ${missing.join('; ')}. Intento registrado.` };
  }

  let patch: ProjectPatch = {};
  const newDocs: { doc_type: string; doc_status: string; version: number }[] = [];

  if (type === 'Advance') {
    patch = advanceTarget(stage, data.decision, now) ?? {};
    const deliverable = patch.stage ? nextDeliverable(patch.stage) : null;
    if (deliverable) newDocs.push({ doc_type: deliverable, doc_status: 'Not Started', version: 1 });
    // Closing -> Portfolio carries its own project_status from advanceTarget.
    if (!patch.project_status) patch.project_status = 'Active';
  } else if (type === 'Hold') {
    // Their A13: a hold has to come back. A review date 90 days out is what
    // keeps Monitor from being a quiet graveyard.
    const review = new Date(now.getTime() + HOLD_DAYS * 86_400_000);
    patch = {
      project_status: data.decision === 'Monitor' ? 'Monitor' : 'Paused',
      stage_status: 'Blocked',
      review_date: review.toISOString().slice(0, 10),
    };
  } else if (type === 'Rework') {
    // A15: the stage does not change, the work does. Back to In Progress so the
    // board stops showing it as waiting for a decision it already got.
    patch = { stage_status: 'In Progress' };
  } else if (type === 'Stop') {
    patch = {
      project_status: 'Passed',
      stage_status: 'Complete',
      pass_lost_reason: data.pass_lost_reason ?? null,
      decisive_evidence: data.decisive_evidence ?? null,
    };
  } else {
    patch = {
      project_status: 'Closed Lost',
      stage_status: 'Complete',
      pass_lost_reason: data.pass_lost_reason ?? null,
      decisive_evidence: data.decisive_evidence ?? null,
    };
  }

  const { error } = await supabase.rpc('ios_record_gate_decision', {
    decision: {
      ...base,
      status: 'Approved',
      gate_ready_at_decision: readiness.ready,
      stage_after: patch.stage ?? stage,
      project_status_after: patch.project_status ?? statusBefore,
    },
    project_patch: patch,
    new_docs: newDocs,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/v2/pipeline/${data.project_id}`);
  revalidatePath('/v2/pipeline');
  revalidatePath('/v2/decisiones');
  revalidatePath('/v2');

  return {
    ok: true,
    message: patch.stage ? `Avanzado a ${patch.stage}` : `Decisión registrada: ${data.decision}`,
  };
}

// --------------------------------------------------------------- perimeter

const perimeterSchema = z.object({
  project_id: uuid,
  company_id: uuid,
  role: z.enum(['Target', 'Platform', 'Add-on', 'Merger Partner']).default('Target'),
});

export async function addIosPerimeterCompany(input: unknown): Promise<ActionResult> {
  const parsed = perimeterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }
  const supabase = createClient();
  const { error } = await supabase.from('ios_project_companies').insert(parsed.data);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/v2/pipeline/${parsed.data.project_id}`);
  return { ok: true, message: 'Empresa añadida al perímetro' };
}

// ----------------------------------------------------------------- the score

/**
 * The sixteen ratings and the thirteen kill ticks for one project.
 *
 * Note what this does NOT do: it never writes `stage`, `project_status` or
 * `pass_lost_reason`. A gate score is an input a person forms a view with, not a
 * decision. Their `Gate Ready?` formula does not read the score either, so a 40
 * on QSS does not close the gate: it just means the next Advance should be very
 * hard to justify in the rationale box, which is where the judgement belongs.
 */
const scoreSchema = z.object({
  project_id: uuid,
  // Partial on purpose: the form posts only the criteria that carry a value, and
  // an absent key means unrated. A `.default(null)` here would quietly turn "not
  // measured" into a number, which is the one thing their blank-until-complete
  // rule exists to prevent.
  ratings: z.record(z.enum(RATING_KEYS as [string, ...string[]]), z.coerce.number().int().min(1).max(5)),
  kills: z.array(z.enum(KILL_IDS as [string, ...string[]])).max(13),
  notes: optionalText(2000),
  scored_by: optionalText(120),
});

export async function saveIosScore(input: unknown): Promise<ActionResult> {
  const parsed = scoreSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }
  const { project_id, ...fields } = parsed.data;
  const supabase = createClient();

  const { error } = await supabase
    .from('ios_project_scores')
    .upsert({ project_id, ...fields, updated_at: new Date().toISOString() }, {
      onConflict: 'project_id',
    });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/v2/pipeline/${project_id}`);
  revalidatePath('/v2/pipeline');
  revalidatePath('/v2');

  const { models } = scoreProject(parsed.data.ratings, parsed.data.kills);
  const done = models.filter((m) => m.score !== null);
  return {
    ok: true,
    message: done.length
      ? `Guardado · ${done.map((m) => `${m.name} ${m.score}`).join(' · ')}`
      : 'Guardado. Ninguna puerta está completa todavía.',
  };
}

// ------------------------------------------------------------ the SABI import

/**
 * A figure in euros. The bound is 1e12, which is a hundred times Spain's largest
 * company: past that the file is not what we think it is.
 */
const eurFigure = z.number().finite().min(-1e12).max(1e12).nullable();

const sabiSchema = z.object({
  rows: z
    .array(
      z.object({
        legal_name: z.string().trim().min(2).max(300),
        region: z.string().trim().max(160).nullable(),
        cnae: z.string().trim().max(160).nullable(),
        revenue: z.array(eurFigure).max(40),
        ebitda: z.array(eurFigure).max(40),
        notes: z.string().trim().max(4000).nullable(),
      }),
    )
    .min(1)
    .max(500),
});

/** The `ios_sources` row every SABI company points at, or the error that stopped us. */
async function findOrCreateSource(
  supabase: ReturnType<typeof createClient>,
): Promise<string | { message: string }> {
  const found = await supabase
    .from('ios_sources')
    .select('id')
    .ilike('name', SABI_SOURCE_NAME)
    .maybeSingle();
  if (found.error) return { message: found.error.message };
  if (found.data) return found.data.id as string;

  const made = await supabase
    .from('ios_sources')
    .insert({
      name: SABI_SOURCE_NAME,
      source_type: SABI_ORIGIN,
      notes: 'Creada por la importación de exports de SABI.',
    })
    .select('id')
    .single();
  if (made.error) return { message: made.error.message };
  return made.data.id as string;
}

export interface SabiImportResult extends ActionResult {
  created: number;
  updated: number;
  unchanged: number;
  /** Per company, so the screen can say what happened to each one. */
  rows: {
    name: string;
    status: 'created' | 'updated' | 'unchanged';
    archetype: string | null;
  }[];
}

/**
 * Loads a parsed SABI export into the long list.
 *
 * The file is read in the BROWSER, exactly as V1 does it and for the same
 * reason: one SABI worksheet per company is 210 KB, and Vercel caps a request
 * body at 4.5 MB, so uploading the raw workbook starts failing at about twenty
 * companies. Compact JSON has no such ceiling. The client is therefore not
 * trusted and every figure is revalidated here.
 *
 * Matching is by name, the same unique index the seeder uses
 * (`lower(btrim(name))`), so re-importing the same export is a no-op rather than
 * 258 duplicates. The mapping and the never-overwrite-with-empty rule are in
 * `lib/ios/sabi-import.ts` and tested there.
 */
export async function importSabiCompanies(input: unknown): Promise<SabiImportResult> {
  const empty = { created: 0, updated: 0, unchanged: 0, rows: [] };
  const parsed = sabiSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos', ...empty };
  }
  const supabase = createClient();

  const [existing, archetypes] = await Promise.all([
    supabase
      .from('ios_companies')
      .select(
        'id, name, province, revenue_estimate_eur_m, ebitda_estimate_eur_m, research_notes, archetype_id, industry_id',
      )
      .limit(5000),
    supabase.from('ios_archetypes').select('id, name, cnae_codes, industry_id').limit(5000),
  ]);
  if (existing.error) return { ok: false, message: existing.error.message, ...empty };
  if (archetypes.error) return { ok: false, message: archetypes.error.message, ...empty };

  // Their 22 sources are web directories and rankings; SABI is not among them,
  // so it is created once, here, rather than seeded from a file it is not in.
  // Find-then-insert and not upsert: the unique index is on `lower(btrim(name))`,
  // an expression, and `on conflict (name)` does not match an expression index.
  const sourceId = await findOrCreateSource(supabase);
  if (typeof sourceId !== 'string') {
    return { ok: false, message: sourceId.message, ...empty };
  }

  const key = (s: string) => s.trim().toLowerCase();
  const byName = new Map(existing.data.map((c) => [key(c.name as string), c]));
  const provinces = [
    ...new Set(existing.data.map((c) => c.province as string | null).filter((p): p is string => !!p)),
  ];
  const archetypeRows = archetypes.data.map((a) => ({
    id: a.id as string,
    name: a.name as string,
    cnae_codes: (a.cnae_codes as string[] | null) ?? [],
    industry_id: a.industry_id as string | null,
  }));
  const result: SabiImportResult = { ok: true, message: '', ...empty, rows: [] };
  const inserts: Record<string, unknown>[] = [];
  // A workbook can hold the same company twice (a re-export appended to the
  // file), and two inserts of one name would hit the unique index and fail the
  // whole batch, so the batch is deduped before it is sent.
  const seen = new Set<string>();

  for (const row of parsed.data.rows) {
    const draft = toLongListDraft(row, provinces);
    const archetype = pickArchetype(draft.cnae, archetypeRows);
    const current = byName.get(key(draft.name));

    if (current) {
      const patch = fillPatch(current as unknown as ExistingCompany, draft, archetype);
      if (Object.keys(patch).length === 0) {
        result.unchanged += 1;
        result.rows.push({
          name: draft.name,
          status: 'unchanged',
          archetype: archetype?.name ?? null,
        });
        continue;
      }
      const { error } = await supabase
        .from('ios_companies')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', current.id);
      if (error) return { ...result, ok: false, message: error.message };
      result.updated += 1;
      result.rows.push({
        name: draft.name,
        status: 'updated',
        archetype: archetype?.name ?? null,
      });
      continue;
    }

    if (seen.has(key(draft.name))) continue;
    seen.add(key(draft.name));

    inserts.push({
      name: draft.name,
      country: 'Spain',
      province: draft.province,
      archetype_id: archetype?.id ?? null,
      industry_id: archetype?.industry_id ?? null,
      status: 'Mapped',
      origin_type: SABI_ORIGIN,
      revenue_estimate_eur_m: draft.revenue_estimate_eur_m,
      ebitda_estimate_eur_m: draft.ebitda_estimate_eur_m,
      source_id: sourceId,
      // A filed annual account, not a web directory guess.
      source_confidence: 'High',
      research_notes: draft.research_notes,
    });
    result.rows.push({
      name: draft.name,
      status: 'created',
      archetype: archetype?.name ?? null,
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('ios_companies').insert(inserts);
    if (error) return { ...result, ok: false, message: error.message };
    result.created = inserts.length;
  }

  revalidatePath('/v2/sourcing');
  revalidatePath('/v2');
  result.message = `${result.created} nuevas, ${result.updated} actualizadas, ${result.unchanged} sin cambios`;
  return result;
}
