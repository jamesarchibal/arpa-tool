/**
 * The nine gates of IOS v9, as a pure function.
 *
 * In V2 a project's stage is never set, it is earned. `app/v2/actions.ts` exports
 * no `setStage`, the workspace shows the stage as text, and the only writer is
 * `ios_record_gate_decision`. Everything that decides whether a gate opens lives
 * here, with no import outside `./lists.ts`, so every rule has a test.
 *
 * Where the rules come from, and where ARPA's own documents disagree:
 *
 * The `Stage_Gates` sheet has a header note listing the requirements, and the
 * `Field_Dictionary` has the `Projects.Gate Ready?` formula. They do not match.
 * The formula is authoritative, because it is what their Airtable would actually
 * evaluate, and it differs in two places:
 *
 *   - Screening also requires a linked primary thesis (`Thesis Code` not empty).
 *     The header note does not mention it.
 *   - The Closing gate requires NO approved document, only `Closing Status =
 *     Closed`. The header note says every gate needs an Approved deliverable.
 *
 * `gateReady` returns the list of checks and not a boolean because it has three
 * consumers: the gate panel paints it as a checklist with the reason each line
 * failed, the server action reads `.ready` as its guard, and the same array is
 * frozen into `ios_gate_decisions.gate_ready_detail` so that in six months an
 * audit can see why the gate was open without re-deriving it from documents that
 * have since been superseded.
 */
import {
  DECISION_TYPE,
  GATE_ALLOWED,
  STAGE_DELIVERABLE,
  STAGE_NEXT,
  type ClosingStatus,
  type DecisionType,
  type DocType,
  type FullDdStatus,
  type GateDecision,
  type LoiStatus,
  type Stage,
} from './lists.ts';

/**
 * What a gate needs to know, one row of `ios_project_gate_facts`.
 *
 * Facts only. The view computes no verdict on purpose: a gate rule written in SQL
 * is a gate rule nobody can unit test.
 */
export interface GateFacts {
  stage: Stage;
  /** Non-empty when a primary thesis is linked. Screening needs it. */
  thesis_code: string | null;
  loi_status: LoiStatus;
  full_dd_status: FullDdStatus;
  closing_status: ClosingStatus;
  open_required_dd_items: number;
  next_step: string;
  /** Doc types whose current, non-Superseded version is Approved. */
  approved_doc_types: readonly DocType[];
}

export interface GateCheck {
  /** Stable across releases: it is stored in gate_ready_detail and read later. */
  id: string;
  /** Spanish, shown as-is in the panel. */
  label: string;
  ok: boolean;
}

export interface GateReadiness {
  ready: boolean;
  checks: GateCheck[];
}

export function decisionType(decision: GateDecision): DecisionType {
  return DECISION_TYPE[decision];
}

/**
 * `Proceed` is Screening's advance and Full Due Diligence's advance. The same
 * word at two gates, which is why a decision is only ever valid together with
 * its gate, and why the server action checks this before anything else.
 */
export function isDecisionAllowed(stage: Stage, decision: GateDecision): boolean {
  return GATE_ALLOWED[stage].includes(decision);
}

const check = (id: string, label: string, ok: boolean): GateCheck => ({ id, label, ok });

export function gateReady(facts: GateFacts): GateReadiness {
  const checks: GateCheck[] = [];

  // Portfolio is terminal. There is no gate out of the cartera, so readiness is
  // not "false because something is missing", it is "the question is wrong".
  if (facts.stage === 'Portfolio') {
    return {
      ready: false,
      checks: [check('no_gate', 'La cartera no tiene gate de salida', false)],
    };
  }

  // Every gate, theirs included: you cannot advance without saying what happens
  // next. It is the cheapest rule in the system and the one that keeps a board
  // from filling with deals nobody owns.
  checks.push(
    check('next_step', 'Próximo paso definido', facts.next_step.trim().length > 0),
  );

  // The gate's own deliverable, Approved. Closing has none: it reads
  // closing_status. That absence is their formula, not an oversight here.
  const deliverable = STAGE_DELIVERABLE[facts.stage];
  if (deliverable) {
    checks.push(
      check(
        `doc:${deliverable}`,
        `${deliverable} aprobado`,
        facts.approved_doc_types.includes(deliverable),
      ),
    );
  }

  if (facts.stage === 'Screening') {
    // Only in the Projects.Gate Ready? formula, not in the Stage_Gates note.
    checks.push(
      check(
        'thesis',
        'Tesis principal enlazada',
        (facts.thesis_code ?? '').trim().length > 0,
      ),
    );
  }

  if (facts.stage === 'LOI & Exclusivity') {
    checks.push(
      check('loi_status', 'LOI aceptada por el vendedor', facts.loi_status === 'Accepted'),
    );
  }

  if (facts.stage === 'Full Due Diligence') {
    checks.push(
      check(
        'dd_items',
        'Sin puntos obligatorios de DD abiertos',
        facts.open_required_dd_items === 0,
      ),
    );
  }

  if (facts.stage === 'Closing') {
    checks.push(
      check('closing_status', 'Estado de cierre = Closed', facts.closing_status === 'Closed'),
    );
  }

  return { ready: checks.every((c) => c.ok), checks };
}

/** The columns of `ios_projects` a decision is allowed to write. */
export interface ProjectPatch {
  stage?: Stage;
  stage_status?: string;
  stage_entered_at?: string;
  project_status?: string;
  loi_status?: LoiStatus;
  full_dd_status?: FullDdStatus;
  closing_status?: ClosingStatus;
  next_step?: string | null;
  next_step_due?: string | null;
  review_date?: string | null;
  pass_lost_reason?: string | null;
  decisive_evidence?: string | null;
}

/**
 * Where an approved Advance lands, plus the side effects their automations A06 to
 * A10 attach to it. Returns null when the decision is not an Advance or when
 * there is nowhere to go, so the caller never has to ask twice.
 *
 * The side effects are here and not in the action because they are rules: an
 * approved LOI submission putting `loi_status` at Drafting is the kind of thing
 * that quietly stops happening after a refactor unless a test watches it.
 */
export function advanceTarget(
  stage: Stage,
  decision: GateDecision,
  now: Date,
): ProjectPatch | null {
  if (decisionType(decision) !== 'Advance') return null;
  if (!isDecisionAllowed(stage, decision)) return null;

  const next = STAGE_NEXT[stage];
  if (!next) return null;

  const patch: ProjectPatch = {
    stage: next,
    stage_status: 'Not Started',
    stage_entered_at: now.toISOString(),
  };

  if (stage === 'Investment Case') patch.loi_status = 'Drafting';
  if (stage === 'LOI & Exclusivity') patch.full_dd_status = 'In Progress';
  if (stage === 'Final Investment Approval') patch.closing_status = 'In Progress';
  if (stage === 'Closing') patch.project_status = 'Closed Won';

  return patch;
}

/**
 * The deliverable the stage a project is entering will be judged on, created at
 * Not Started so the new stage shows what it is waiting for.
 */
export function nextDeliverable(stage: Stage): DocType | null {
  return STAGE_DELIVERABLE[stage] ?? null;
}

// TODO(roles): their automation A16 also requires the approver to be a Partner.
// V2 has no role model in scope, so `ios_gate_decisions.decided_by` is free text
// and that half of A16 is not enforced. Saying so is better than faking it.
