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
