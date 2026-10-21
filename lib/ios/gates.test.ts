import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  advanceTarget,
  decisionType,
  gateReady,
  isDecisionAllowed,
  nextDeliverable,
  type GateFacts,
} from './gates.ts';
import { GATE_ALLOWED, GATE_DECISIONS, STAGES, type Stage } from './lists.ts';

/** A project whose gate is wide open at `stage`. Each test breaks one thing. */
function open(stage: Stage, overrides: Partial<GateFacts> = {}): GateFacts {
  return {
    stage,
    thesis_code: 'ARPA-TH-001',
    loi_status: 'Accepted',
    full_dd_status: 'Complete',
    closing_status: 'Closed',
    open_required_dd_items: 0,
    next_step: 'Llamar al fundador el martes',
    approved_doc_types: ['QSS', 'OM', 'PFR', 'IC', 'LOI', 'DD Summary', 'FIM'],
    ...overrides,
  };
}

/** Which check ids failed. Asserting on these is why `id` is stable. */
function failed(facts: GateFacts): string[] {
  return gateReady(facts)
    .checks.filter((c) => !c.ok)
    .map((c) => c.id);
}

/**
 * The whole 9 x 16 grid, in both directions.
 *
 * One direction alone is not enough: a function that returns true for everything
 * passes "every allowed decision is allowed", and a function that returns false
 * for everything passes "every other decision is refused".
 */
test('the 9 x 16 grid of gate and decision, both ways', () => {
  let allowed = 0;
  let refused = 0;
  for (const stage of STAGES) {
    for (const decision of GATE_DECISIONS) {
      const expected = GATE_ALLOWED[stage].includes(decision);
      assert.equal(
        isDecisionAllowed(stage, decision),
        expected,
        `${stage} / ${decision} should be ${expected}`,
      );
      if (expected) allowed += 1;
      else refused += 1;
    }
  }
  // 4+4+4+4+4+4+2+3+0 allowed, and Portfolio refuses all 16.
  assert.equal(allowed, 29);
  assert.equal(refused, 9 * 16 - 29);
});

test('an open gate is open at all eight stages that have one', () => {
  for (const stage of STAGES) {
    if (stage === 'Portfolio') continue;
    const readiness = gateReady(open(stage));
    assert.ok(readiness.ready, `${stage} should be ready: ${failed(open(stage)).join(', ')}`);
    assert.ok(readiness.checks.length >= 2, `${stage} has suspiciously few checks`);
  }
});

test('no next step closes every gate', () => {
  for (const stage of STAGES) {
    if (stage === 'Portfolio') continue;
    assert.deepEqual(failed(open(stage, { next_step: '   ' })), ['next_step']);
  }
});

/**
 * One case per gate, breaking exactly the requirement that gate is about, and
 * asserting on the check id. A test that only asserts `ready === false` passes
 * even when the gate failed for an unrelated reason.
 */
test('each gate fails on its own deliverable', () => {
  const cases: [Stage, string][] = [
    ['Screening', 'doc:QSS'],
    ['Assessment', 'doc:OM'],
    ['Preliminary Financial Review', 'doc:PFR'],
    ['Investment Case', 'doc:IC'],
    ['LOI & Exclusivity', 'doc:LOI'],
    ['Full Due Diligence', 'doc:DD Summary'],
    ['Final Investment Approval', 'doc:FIM'],
  ];
  for (const [stage, id] of cases) {
    assert.deepEqual(failed(open(stage, { approved_doc_types: [] })), [id]);
  }
});

/**
 * Only the Gate Ready? formula says this. The Stage_Gates header note does not
 * mention the thesis at all, so if someone ever "simplifies" the gates by reading
 * that note, this is the test that stops them.
 */
test('Screening needs a linked thesis, not only an approved QSS', () => {
  assert.deepEqual(failed(open('Screening', { thesis_code: null })), ['thesis']);
  assert.deepEqual(failed(open('Screening', { thesis_code: '  ' })), ['thesis']);
  // And the thesis is required at Screening only.
  for (const stage of STAGES) {
    if (stage === 'Screening' || stage === 'Portfolio') continue;
    assert.deepEqual(failed(open(stage, { thesis_code: null })), []);
  }
});

test('LOI & Exclusivity needs the LOI accepted, not just signed off internally', () => {
  assert.deepEqual(failed(open('LOI & Exclusivity', { loi_status: 'Submitted' })), [
    'loi_status',
  ]);
});

test('Full Due Diligence needs zero open required items', () => {
  assert.deepEqual(failed(open('Full Due Diligence', { open_required_dd_items: 1 })), [
    'dd_items',
  ]);
});

/**
 * Their header note says every gate needs an Approved deliverable. For Closing
 * that is wrong: the formula reads Closing Status and no document. Adding a
 * document requirement here would freeze every deal one step from the finish.
 */
test('Closing reads closing_status and asks for no document at all', () => {
  const ids = gateReady(open('Closing', { approved_doc_types: [] })).checks.map((c) => c.id);
  assert.deepEqual(ids, ['next_step', 'closing_status']);
  assert.ok(gateReady(open('Closing', { approved_doc_types: [] })).ready);
  assert.deepEqual(failed(open('Closing', { closing_status: 'Delayed' })), ['closing_status']);
  assert.equal(nextDeliverable('Closing'), null);
});

/**
 * A Superseded QSS is not in `approved_doc_types`, because the view only looks at
 * the current non-Superseded version of each type. This is the fact that makes
 * re-approving a reworked document meaningful.
 */
test('a superseded QSS does not open Screening', () => {
  assert.deepEqual(
    failed(open('Screening', { approved_doc_types: ['OM', 'PFR'] })),
    ['doc:QSS'],
  );
});

test('Portfolio has no gate, and says so instead of listing failures', () => {
  const readiness = gateReady(open('Portfolio'));
  assert.equal(readiness.ready, false);
  assert.deepEqual(
    readiness.checks.map((c) => c.id),
    ['no_gate'],
  );
  assert.deepEqual([...GATE_ALLOWED.Portfolio], []);
});

test('every decision has a type and the five types are used', () => {
  const seen = new Set(GATE_DECISIONS.map((d) => decisionType(d)));
  assert.deepEqual([...seen].sort(), ['Advance', 'Hold', 'Lost', 'Rework', 'Stop']);
});

const NOW = new Date('2026-10-21T10:00:00.000Z');

test('an Advance lands on the next stage, reset to Not Started', () => {
  const patch = advanceTarget('Screening', 'Proceed', NOW);
  assert.deepEqual(patch, {
    stage: 'Assessment',
    stage_status: 'Not Started',
    stage_entered_at: NOW.toISOString(),
  });
});

test('the advance side effects of A06 to A10 ride along', () => {
  assert.equal(advanceTarget('Investment Case', 'Submit LOI', NOW)?.loi_status, 'Drafting');
  assert.equal(
    advanceTarget('LOI & Exclusivity', 'Launch Full DD', NOW)?.full_dd_status,
    'In Progress',
  );
  assert.equal(
    advanceTarget('Final Investment Approval', 'Approve', NOW)?.closing_status,
    'In Progress',
  );
  const closed = advanceTarget('Closing', 'Closed', NOW);
  assert.equal(closed?.stage, 'Portfolio');
  assert.equal(closed?.project_status, 'Closed Won');
});

test('advanceTarget refuses anything that is not this gate\u2019s advance', () => {
  // Not an Advance type.
  assert.equal(advanceTarget('Screening', 'Monitor', NOW), null);
  assert.equal(advanceTarget('Closing', 'Aborted', NOW), null);
  // An Advance, but belonging to a different gate: Continue is Assessment's.
  assert.equal(advanceTarget('Screening', 'Continue', NOW), null);
  // And nowhere to go from the cartera.
  for (const decision of GATE_DECISIONS) {
    assert.equal(advanceTarget('Portfolio', decision, NOW), null);
  }
});

test('every advance except Closing\u2019s has a deliverable waiting for it', () => {
  for (const stage of STAGES) {
    const advance = GATE_ALLOWED[stage].find((d) => decisionType(d) === 'Advance');
    if (!advance) continue;
    const patch = advanceTarget(stage, advance, NOW);
    assert.ok(patch?.stage, `${stage} advance goes nowhere`);
    const doc = nextDeliverable(patch.stage);
    if (patch.stage === 'Closing' || patch.stage === 'Portfolio') {
      assert.equal(doc, null, `${patch.stage} should have no deliverable`);
    } else {
      assert.ok(doc, `${patch.stage} should have a deliverable`);
    }
  }
});
