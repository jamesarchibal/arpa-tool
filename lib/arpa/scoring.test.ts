/**
 * Regression tests for the ARPA scoring engine.
 *
 * Run: node --test lib/arpa/scoring.test.ts
 * (Node 25 strips the types itself, so there is no test dependency to install.)
 *
 * The numbers in `demo` are not invented for this test. They are the output of
 * the calculator already published at joblanders.ai/arpa, verified against it
 * by hand: QSS 4.40 Proceed, OM 3.40 Monitor, PFR 3.55 Reprice, EV 9.10 M€,
 * Equity 7.30 M€, Valuation Gap 2.40 M€, Overall 76/100. If a change here moves
 * any of those, the port has drifted from what ARPA has already seen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TAXONOMY,
  MODELS,
  KILLS,
  derive,
  scoreProject,
  criterionKey,
  toScoreRows,
  type ScoringInput,
  type TaxonomyRow,
} from './scoring.ts';

const tax = (subsector: string): TaxonomyRow => {
  const row = TAXONOMY.find((t) => t.subsector === subsector);
  if (!row) throw new Error(`no taxonomy row for ${subsector}`);
  return row;
};

/** Conservas del Segura, S.L., the demo target on the published page. */
const demo: ScoringInput = {
  country: 'ES',
  ownershipType: 'Family-owned',
  taxonomyFit: 'in',
  taxonomy: tax('Fruit / vegetable processing'),
  revenue: [8.2, 9.1, 10.4],
  ebitda: [0.95, 1.18, 1.46],
  ebitdaNorm: 1.3,
  capex: 0.25,
  workingCapital: 0.1,
  netDebt: 1.8,
  recurringPct: 55,
  customerConc: 'mid',
  sellerMotiv: 4,
  dataConfidence: 'Medium',
  entryMultiple: 7,
  sellerExpEv: 11.5,
};

const close = (a: number | null, b: number, eps = 1e-9) => {
  assert.notEqual(a, null);
  assert.ok(Math.abs((a as number) - b) < eps, `expected ${b}, got ${a}`);
};

/* ───────────────────────────── blueprint integrity ─────────────────────────── */

test('the blueprint is intact: 16 criteria, 13 kill criteria, 20 taxonomy rows', () => {
  assert.equal(TAXONOMY.length, 20);
  assert.equal(KILLS.length, 13);
  assert.equal(
    MODELS.reduce((n, m) => n + m.criteria.length, 0),
    16,
  );
  assert.deepEqual(
    MODELS.map((m) => m.criteria.length),
    [6, 5, 5],
  );
});

test('every model weights to 100 and every criterion key is unique', () => {
  const seen = new Set<string>();
  for (const m of MODELS) {
    assert.equal(
      m.criteria.reduce((n, c) => n + c.weight, 0),
      100,
      `${m.id} weights do not total 100`,
    );
    for (const c of m.criteria) {
      const k = criterionKey(m.id, c.id);
      assert.ok(!seen.has(k), `duplicate criterion key ${k}`);
      seen.add(k);
    }
  }
});

test('every kill criterion belongs to a real model and has a unique id', () => {
  const ids = new Set(MODELS.map((m) => m.id));
  const seen = new Set<string>();
  for (const k of KILLS) {
    assert.ok(ids.has(k.model), `${k.id} points at unknown model ${k.model}`);
    assert.ok(!seen.has(k.id), `duplicate kill id ${k.id}`);
    seen.add(k.id);
  }
});

/* ──────────────────────────── the valuation chain ──────────────────────────── */

test('valuation follows the workbook chain', () => {
  const d = derive(demo);
  close(d.ebitdaRef, 1.3); // normalised wins over reported
  close(d.enterpriseValue, 9.1); // 1.30 x 7
  close(d.equityValue, 7.3); // 9.10 - 1.80
  close(d.valuationGapM, 2.4); // 11.50 - 9.10
  close(d.valuationGapPct, 2.4 / 9.1);
  close(d.askMultiple, 11.5 / 1.3);
});

test('derived metrics match hand calculation', () => {
  const d = derive(demo);
  close(d.ebitdaMargin, 1.46 / 10.4);
  close(d.revenueCagr, Math.pow(10.4 / 8.2, 0.5) - 1);
  close(d.normalisationGap, (1.46 - 1.3) / 1.46);
  close(d.cashConversion, (1.3 - 0.25 - 0.1) / 1.3);
  close(d.leverage, 1.8 / 1.3);
});

test('reported EBITDA is the fallback when nothing is normalised', () => {
  const d = derive({ ...demo, ebitdaNorm: null });
  close(d.ebitdaRef, 1.46);
  close(d.enterpriseValue, 1.46 * 7);
  assert.equal(d.normalisationGap, null, 'no normalised figure means no gap to report');
});

/* ───────────────────────── the published demo, pinned ──────────────────────── */

test('demo reproduces the published scores exactly', () => {
  const r = scoreProject(demo);
  const [qss, om, pfr] = r.models;

  close(qss.score1to5, 4.4);
  close(om.score1to5, 3.4);
  close(pfr.score1to5, 3.55);

  assert.equal(qss.score0to100, 88);
  assert.equal(om.score0to100, 68);
  assert.equal(pfr.score0to100, 71);
  assert.equal(r.overall0to100, 76);

  assert.equal(qss.verdict, 'Proceed');
  assert.equal(om.verdict, 'Monitor');
  assert.equal(pfr.verdict, 'Reprice');
});

test('demo is clean: no vetoes, no suggested kills, no missing data', () => {
  const r = scoreProject(demo);
  assert.deepEqual(r.gaps, []);
  assert.deepEqual(r.flaggedKills, []);
  assert.deepEqual(
    r.suggestedKills.map((k) => k.id),
    [],
  );
  assert.equal(r.passReason, null);
  assert.equal(r.models.every((m) => m.coverage === 1), true);
});

test('demo stops at PFR, because no gate says Pass', () => {
  const r = scoreProject(demo);
  assert.equal(r.stage, 'Preliminary Financial Review');
  assert.equal(r.decision, 'Reprice');
});

test('the one criterion no data can score is marked as a placeholder, not a judgement', () => {
  const r = scoreProject(demo);
  const pos = r.models[1].criteria.find((c) => c.id === 'pos');
  assert.equal(pos?.score, 3);
  assert.equal(pos?.usedDefault, true);
  assert.equal(pos?.autoScore, null);

  // everything else is either derived or explicitly set by a human
  const others = r.models.flatMap((m) => m.criteria).filter((c) => c.id !== 'pos');
  assert.equal(others.every((c) => !c.usedDefault), true);
});

/* ──────────────────────────────── the gates ────────────────────────────────── */

test('a human veto forces Pass regardless of a high score', () => {
  const r = scoreProject(demo, { flagged: ['k4'] });
  const qss = r.models[0];
  close(qss.score1to5, 4.4); // the score itself does not move
  assert.equal(qss.vetoed, true);
  assert.equal(qss.verdict, 'Pass');
  assert.equal(r.stage, 'Screening', 'a screening veto must stop the deal at screening');
  assert.equal(r.decision, 'Pass');
  assert.equal(r.passReason, 'Weak business');
});

test('a veto at screening is not overwritten by later gates', () => {
  // This is the bug the published page had: it reported the last model with a
  // score, so a QSS veto silently became "PFR · Reprice".
  const r = scoreProject(demo, { flagged: ['k1'] });
  assert.equal(r.stage, 'Screening');
  assert.notEqual(r.stage, 'Preliminary Financial Review');
});

test('suggested kill criteria advise by default and veto only when asked', () => {
  // seller motivation 1 trips k7 by data, but nobody ticked it
  const weak: ScoringInput = { ...demo, sellerMotiv: 1 };

  const advisory = scoreProject(weak);
  assert.ok(advisory.suggestedKills.some((k) => k.id === 'k7'));
  assert.equal(advisory.models[1].vetoed, false, 'advisory must not veto');

  const blocking = scoreProject(weak, { blockOnSuggested: true });
  assert.equal(blocking.models[1].vetoed, true);
  assert.equal(blocking.models[1].verdict, 'Pass');
  assert.equal(blocking.passReason, 'Seller not ready');
});

test('manual override replaces the derived score and is recorded as such', () => {
  const key = criterionKey('qss', 'bq');
  const r = scoreProject(demo, { manual: { [key]: 1 } });
  const bq = r.models[0].criteria.find((c) => c.id === 'bq');

  assert.equal(bq?.manualScore, 1);
  assert.equal(bq?.autoScore, 4, 'the derived value must survive for comparison');
  assert.equal(bq?.score, 1);

  // 440 - 20*4 + 20*1 = 380
  close(r.models[0].score1to5, 3.8);
  assert.ok(r.weakPoints.some((w) => w.name === 'Calidad del negocio'));
});

test('missing data lowers coverage instead of dragging the score down', () => {
  // drop everything the PFR gate needs except data confidence
  const thin: ScoringInput = {
    ...demo,
    ebitdaNorm: null,
    ebitda: [null, null, null],
    capex: null,
    netDebt: null,
    recurringPct: null,
  };
  const r = scoreProject(thin);
  const pfr = r.models[2];

  assert.ok(pfr.coverage < 1, 'coverage should report the hole');
  assert.equal(pfr.criteria.find((c) => c.id === 'dq')?.score, 3);
  // only the 15 % data-quality criterion scored, so the mean is that criterion
  close(pfr.score1to5, 3);
  assert.ok(r.gaps.length > 0);
});

test('an empty project scores nothing rather than scoring zero', () => {
  const empty: ScoringInput = {
    country: null,
    ownershipType: null,
    taxonomyFit: 'in',
    taxonomy: null,
    revenue: [null, null, null],
    ebitda: [null, null, null],
    ebitdaNorm: null,
    capex: null,
    workingCapital: null,
    netDebt: null,
    recurringPct: null,
    customerConc: null,
    sellerMotiv: null,
    dataConfidence: null,
    entryMultiple: null,
    sellerExpEv: null,
  };
  const r = scoreProject(empty);

  // taxonomy fit defaults to 'in', so sector is the one thing still scorable
  assert.equal(r.models[0].criteria.find((c) => c.id === 'sec')?.score, 5);
  assert.equal(r.models[2].score1to5, null, 'PFR has nothing to go on');
  assert.equal(r.models[2].verdict, 'Sin datos');
  assert.equal(r.models[2].outcome, -1);
  assert.equal(r.passReason, null, 'no data is not a reason to pass');
});

/* ────────────────────────── mandate and kill detection ─────────────────────── */

test('out of mandate geography trips the geography kill criterion', () => {
  const r = scoreProject({ ...demo, country: 'DE' });
  assert.equal(r.models[0].criteria.find((c) => c.id === 'geo')?.score, 1);
  assert.ok(r.suggestedKills.some((k) => k.id === 'k1'));
});

test('Portugal is a near fit, not a kill', () => {
  const r = scoreProject({ ...demo, country: 'PT' });
  assert.equal(r.models[0].criteria.find((c) => c.id === 'geo')?.score, 4);
  assert.equal(r.suggestedKills.some((k) => k.id === 'k1'), false);
});

test('a business outside the taxonomy scores 1 on sector and trips k3', () => {
  const r = scoreProject({ ...demo, taxonomyFit: 'out', taxonomy: null });
  assert.equal(r.models[0].criteria.find((c) => c.id === 'sec')?.score, 1);
  assert.ok(r.suggestedKills.some((k) => k.id === 'k3'));
  assert.equal(r.models[1].criteria.find((c) => c.id === 'mkt')?.score, null);
});

test('adjacent sits in the middle', () => {
  const r = scoreProject({ ...demo, taxonomyFit: 'adjacent' });
  assert.equal(r.models[0].criteria.find((c) => c.id === 'sec')?.score, 3);
});

test('a company too small for the mandate trips k2 and proposes Too small', () => {
  const small: ScoringInput = { ...demo, ebitdaNorm: 0.3, ebitda: [0.2, 0.25, 0.3] };
  const r = scoreProject(small, { blockOnSuggested: true });
  assert.ok(r.suggestedKills.some((k) => k.id === 'k2'));
  assert.equal(r.passReason, 'Too small');
});

test('a seller asking far above our EV trips the valuation kill criterion', () => {
  const r = scoreProject({ ...demo, sellerExpEv: 20 }, { blockOnSuggested: true });
  // gap = 20 - 9.10 = 10.90, i.e. 120 % over EV
  assert.ok((r.metrics.valuationGapPct as number) > 0.5);
  assert.ok(r.suggestedKills.some((k) => k.id === 'k5'));
  assert.equal(r.passReason, 'Price gap');
});

test('hidden debt trips the leverage kill criterion', () => {
  const r = scoreProject({ ...demo, netDebt: 6 }, { blockOnSuggested: true });
  assert.ok((r.metrics.leverage as number) > 4);
  assert.ok(r.suggestedKills.some((k) => k.id === 'k12'));
  assert.equal(r.models[2].criteria.find((c) => c.id === 'debt')?.score, 1);
});

test('low confidence caps EBITDA credibility and trips k13', () => {
  const r = scoreProject({ ...demo, dataConfidence: 'Low' });
  const cred = r.models[2].criteria.find((c) => c.id === 'cred');
  // normalisation gap alone would score 3; Low confidence caps it at 1+1
  assert.equal(cred?.score, 2);
  assert.ok(r.suggestedKills.some((k) => k.id === 'k13'));
});

test('overstated EBITDA trips k10 and proposes Financial issue', () => {
  // reported 2.00 against normalised 1.30 is a 35 % haircut
  const r = scoreProject(
    { ...demo, ebitda: [0.95, 1.18, 2.0] },
    { blockOnSuggested: true },
  );
  assert.ok((r.metrics.normalisationGap as number) > 0.25);
  assert.ok(r.suggestedKills.some((k) => k.id === 'k10'));
  assert.equal(r.passReason, 'Financial issue');
});

/* ──────────────────────── pass reason stays inside their list ──────────────── */

test('a proposed Pass reason is always one of their seven values', () => {
  const allowed = new Set([
    'Too small',
    'Weak business',
    'Price gap',
    'Financial issue',
    'Seller not ready',
    'Lost to competitor',
    'Other',
  ]);
  const scenarios: ScoringInput[] = [
    { ...demo, sellerExpEv: 30 },
    { ...demo, ebitdaNorm: 0.2, ebitda: [0.1, 0.15, 0.2] },
    { ...demo, sellerMotiv: 1 },
    { ...demo, netDebt: 9 },
    { ...demo, customerConc: 'high', dataConfidence: 'Low' },
  ];
  for (const s of scenarios) {
    const r = scoreProject(s, { blockOnSuggested: true });
    if (r.passReason !== null) assert.ok(allowed.has(r.passReason), `${r.passReason} is not theirs`);
  }
});

test('a mandate failure is reported as unexpressible rather than mislabelled', () => {
  // "Fuera de España" is a real kill criterion, but their 7-value list has no
  // reason for it. Inventing one would be worse than admitting the gap.
  const r = scoreProject({ ...demo, country: 'DE' }, { flagged: ['k1'] });
  assert.equal(r.models[0].verdict, 'Pass');
  assert.equal(r.passReason, null);
  assert.equal(r.passReasonMissing, true);
  assert.match(r.passReasonSource ?? '', /Fuera de España/);
});

/* ─────────────────────────── thresholds and weights ───────────────────────── */

test('thresholds are expressed on the 0-100 scale ARPA chose', () => {
  // 88 clears a bar of 85 but not one of 90
  assert.equal(scoreProject(demo, { proceedAt: 85 }).models[0].verdict, 'Proceed');
  assert.equal(scoreProject(demo, { proceedAt: 90 }).models[0].verdict, 'Monitor');
  assert.equal(scoreProject(demo, { proceedAt: 90, monitorAt: 89 }).models[0].verdict, 'Pass');
});

test('reweighting changes the score and is reported', () => {
  const key = criterionKey('qss', 'geo');
  const r = scoreProject(demo, { weights: { [key]: 50 } });
  assert.equal(r.models[0].weightSum, 140);
  assert.equal(r.models[0].criteria.find((c) => c.id === 'geo')?.weight, 50);
  // 440 - 10*5 + 50*5 = 640 over 140
  close(r.models[0].score1to5, 640 / 140);
});

/* ─────────────────────────────── persistence ──────────────────────────────── */

test('score rows are shaped for arpa_scores and keep the audit trail', () => {
  const r = scoreProject(demo, { manual: { [criterionKey('qss', 'bq')]: 2 } });
  const rows = toScoreRows('22222222-2222-2222-2222-222222222222', r, 'Marc');

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((x) => x.model),
    ['qss', 'om', 'pfr'],
  );
  for (const row of rows) {
    assert.equal(row.scored_by, 'Marc');
    assert.equal(typeof row.verdict, 'string');
    assert.equal(Object.keys(row.criteria).length > 0, true);
  }

  // the override and the value it replaced both survive, so a later reviewer
  // can see that a human disagreed with the data and by how much
  const bq = (rows[0].criteria as Record<string, { auto: number | null; manual: number | null }>).bq;
  assert.equal(bq.manual, 2);
  assert.equal(bq.auto, 4);

  // total_1_5 and total_0_100 must agree
  for (const row of rows) {
    if (row.total_1_5 !== null && row.total_0_100 !== null) {
      assert.equal(Math.round((row.total_1_5 as number) * 20), row.total_0_100);
    }
  }
});

test('a vetoed gate is still written, so the refusal is on the record', () => {
  const r = scoreProject(demo, { flagged: ['k4'] });
  const rows = toScoreRows('p', r, 'Marc');
  const qss = rows.find((x) => x.model === 'qss');
  assert.equal(qss?.vetoed, true);
  assert.equal(qss?.verdict, 'Pass');
  assert.equal(qss?.total_0_100, 88, 'the score is kept even though it was overridden');
});
