import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MODELS as V1_MODELS } from '../arpa/scoring.ts';
import { PASS_LOST_REASONS } from './lists.ts';
import {
  KILL_CRITERIA,
  MONITOR_AT,
  PROCEED_AT,
  RATING_KEYS,
  SCORING_MODELS,
  criterionKey,
  scoreProject,
  type ModelId,
  type Ratings,
} from './scoring.ts';

/** Rate every criterion of every gate the same, so the maths is checkable by hand. */
function flat(n: number): Ratings {
  return Object.fromEntries(RATING_KEYS.map((k) => [k, n]));
}

/** Rate one gate only, leaving the other two untouched. */
function rate(model: ModelId, n: number): Ratings {
  const M = SCORING_MODELS.find((m) => m.id === model)!;
  return Object.fromEntries(M.criteria.map((c) => [criterionKey(model, c.id), n]));
}

test('the three gates carry sixteen criteria and each gate weighs 100', () => {
  assert.equal(SCORING_MODELS.length, 3);
  assert.equal(SCORING_MODELS.flatMap((m) => m.criteria).length, 16);
  for (const M of SCORING_MODELS) {
    const sum = M.criteria.reduce((n, c) => n + c.weight, 0);
    assert.equal(sum, 100, `${M.id} weighs ${sum}`);
  }
});

test('the weights are the same as V1, which was checked against their sheet', () => {
  // V1's engine was verified criterion by criterion against `Scoring_Model` on
  // 21-oct. Pinning V2 to it means one of the two has to break loudly before the
  // two halves of the product can quietly disagree about what a QSS of 78 means.
  for (const M of SCORING_MODELS) {
    const v1 = V1_MODELS.find((m) => m.id === M.id);
    assert.ok(v1, `V1 has no ${M.id} model`);
    assert.deepEqual(
      M.criteria.map((c) => [c.id, c.weight]),
      v1.criteria.map((c) => [c.id, c.weight]),
      `${M.id} criteria or weights drifted from V1`,
    );
  }
});

test('all 5 is 100 and all 1 is 20', () => {
  for (const m of scoreProject(flat(5)).models) assert.equal(m.score, 100);
  for (const m of scoreProject(flat(1)).models) assert.equal(m.score, 20);
  assert.equal(scoreProject(flat(5)).overall, 100);
});

test('a gate is blank until every one of its criteria is rated', () => {
  // Their Field_Dictionary rule. Rate five of the six QSS criteria at 5 and the
  // score must still be null, not 100: a 5/6 answer is not a score.
  const partial = rate('qss', 5);
  delete partial[criterionKey('qss', 'deal')];

  const qss = scoreProject(partial).models.find((m) => m.id === 'qss')!;
  assert.equal(qss.complete, false);
  assert.equal(qss.score, null);
  assert.equal(qss.outcome, -1);
  assert.equal(qss.verdict, 'Sin puntuar');
  assert.deepEqual(qss.missing, ['Dealability']);
});

test('the weights actually move the score', () => {
  // QSS: geo weighs 10 and EBITDA fit weighs 20. Drop each to 1 from a clean 5
  // and the heavier one has to cost twice as much.
  const geo = { ...rate('qss', 5), [criterionKey('qss', 'geo')]: 1 };
  const ebit = { ...rate('qss', 5), [criterionKey('qss', 'ebit')]: 1 };

  const a = scoreProject(geo).models.find((m) => m.id === 'qss')!.score as number;
  const b = scoreProject(ebit).models.find((m) => m.id === 'qss')!.score as number;

  assert.equal(a, 92); // (90*5 + 10*1) / 100 * 20
  assert.equal(b, 84); // (80*5 + 20*1) / 100 * 20
  assert.equal(100 - a, (100 - b) / 2);
});

test('the verdict follows their two thresholds', () => {
  assert.equal(PROCEED_AT, 80);
  assert.equal(MONITOR_AT, 60);

  const at = (n: number) => scoreProject(rate('qss', n)).models.find((m) => m.id === 'qss')!;
  assert.equal(at(5).score, 100);
  assert.equal(at(5).verdict, 'Proceed');
  assert.equal(at(4).score, 80);
  assert.equal(at(4).verdict, 'Proceed'); // at the threshold, not above it
  assert.equal(at(3).score, 60);
  assert.equal(at(3).verdict, 'Monitor');
  assert.equal(at(2).score, 40);
  assert.equal(at(2).verdict, 'Pass');
});

test('each gate uses its own wording for the verdict', () => {
  const r = scoreProject(flat(5));
  assert.equal(r.models.find((m) => m.id === 'qss')!.verdict, 'Proceed');
  assert.equal(r.models.find((m) => m.id === 'om')!.verdict, 'Continue');
  assert.equal(r.models.find((m) => m.id === 'pfr')!.verdict, 'Build Investment Case');
});

test('a ticked kill criterion vetoes its gate whatever the score says', () => {
  const r = scoreProject(flat(5), ['k2']);
  const qss = r.models.find((m) => m.id === 'qss')!;

  assert.equal(qss.score, 100);
  assert.equal(qss.vetoed, true);
  assert.equal(qss.outcome, 2);
  assert.equal(qss.verdict, 'Pass');

  // And only its own gate: k2 belongs to QSS.
  assert.equal(r.models.find((m) => m.id === 'om')!.vetoed, false);
  assert.equal(r.models.find((m) => m.id === 'pfr')!.vetoed, false);
});

test('the 13 kill criteria are 4 / 5 / 4 across the three gates', () => {
  assert.equal(KILL_CRITERIA.length, 13);
  const per = (m: ModelId) => KILL_CRITERIA.filter((k) => k.model === m).length;
  assert.equal(per('qss'), 4);
  assert.equal(per('om'), 5);
  assert.equal(per('pfr'), 4);
  assert.equal(new Set(KILL_CRITERIA.map((k) => k.id)).size, 13);
});

test('every proposed reason is one of their 12 values', () => {
  // V1's list had 7. Writing one of those into `ios_projects.pass_lost_reason`
  // would be rejected by the v9 check constraint, so this test is the guard.
  const allowed = new Set<string>(PASS_LOST_REASONS);
  for (const k of KILL_CRITERIA) {
    if (k.reason) assert.ok(allowed.has(k.reason), `kill ${k.id}: ${k.reason}`);
  }
  for (const M of SCORING_MODELS) {
    for (const c of M.criteria) {
      if (c.reason) assert.ok(allowed.has(c.reason), `${M.id}/${c.id}: ${c.reason}`);
    }
  }
});

test('a ticked kill proposes its own reason', () => {
  const r = scoreProject(flat(5), ['k2']);
  assert.equal(r.suggestedReason, 'Size Outside Mandate');
  assert.match(r.suggestedReasonSource ?? '', /criterio de descarte/);
});

test('with no kill ticked the reason comes from the weakest criterion', () => {
  // All 2 scores 40, which is a Pass. Business quality at 1 is then the worst
  // criterion on the gate, so its reason is the one to propose.
  const r = scoreProject({ ...rate('qss', 2), [criterionKey('qss', 'bq')]: 1 });

  const qss = r.models.find((m) => m.id === 'qss')!;
  assert.equal(qss.verdict, 'Pass');
  assert.equal(qss.weakest[0].id, 'bq');
  assert.equal(r.suggestedReason, 'Business Quality');
  assert.match(r.suggestedReasonSource ?? '', /criterio m\u00e1s d\u00e9bil/);
});

test('a weak criterion alone does not sink a gate that still passes', () => {
  // Business quality at 1 with everything else at 5 is 84, which is Proceed.
  // Nothing is proposed, because nothing died.
  const r = scoreProject({ ...rate('qss', 5), [criterionKey('qss', 'bq')]: 1 });
  assert.equal(r.models.find((m) => m.id === 'qss')!.verdict, 'Proceed');
  assert.equal(r.suggestedReason, null);
});

test('nothing is proposed while every gate is still passing', () => {
  const r = scoreProject(flat(5));
  assert.equal(r.suggestedReason, null);
  assert.equal(r.suggestedReasonSource, null);
});

test('the overall is the mean of the finished gates only', () => {
  // QSS all 5 (100), OM all 3 (60), PFR untouched (null) -> 80, not 53.
  const r = scoreProject({ ...rate('qss', 5), ...rate('om', 3) });
  assert.equal(r.models.find((m) => m.id === 'pfr')!.score, null);
  assert.equal(r.overall, 80);
});

test('the furthest gate stops at the first Pass', () => {
  // QSS passes, OM fails, PFR would pass. The deal is dead at OM, so that is the
  // gate the board should show, not the PFR filled in afterwards by mistake.
  const r = scoreProject({ ...rate('qss', 5), ...rate('om', 2), ...rate('pfr', 5) });
  assert.equal(r.furthest?.id, 'om');
  assert.equal(r.furthest?.verdict, 'Pass');
});

test('the furthest gate is null before anything is rated', () => {
  const r = scoreProject({});
  assert.equal(r.furthest, null);
  assert.equal(r.overall, null);
  for (const m of r.models) assert.equal(m.score, null);
});

test('a rating outside 1-5 is clamped, never trusted', () => {
  const r = scoreProject({ ...rate('qss', 5), [criterionKey('qss', 'geo')]: 99 });
  const geo = r.models
    .find((m) => m.id === 'qss')!
    .criteria.find((c) => c.id === 'geo')!;
  assert.equal(geo.rating, 5);
  assert.equal(r.models.find((m) => m.id === 'qss')!.score, 100);
});

test('a non-numeric rating counts as unrated, not as zero', () => {
  const bad = { ...rate('qss', 5), [criterionKey('qss', 'geo')]: NaN };
  const qss = scoreProject(bad as Ratings).models.find((m) => m.id === 'qss')!;
  assert.equal(qss.complete, false);
  assert.equal(qss.score, null);
});

test('one gate per funnel stage, in funnel order', () => {
  assert.deepEqual(
    SCORING_MODELS.map((m) => m.stage),
    ['Screening', 'Assessment', 'Preliminary Financial Review'],
  );
});

test('every rating key is unique and shaped model_criterion', () => {
  assert.equal(RATING_KEYS.length, 16);
  assert.equal(new Set(RATING_KEYS).size, 16);
  for (const k of RATING_KEYS) assert.match(k, /^(qss|om|pfr)_[a-z]+$/);
});
