import assert from 'node:assert/strict';
import { test } from 'node:test';

import { VOCABULARY } from './__fixtures__/vocabulary.ts';
import {
  AI_OUTPUT_STATUS,
  CLOSING_STATUS,
  CONFIDENCE,
  CONFIDENTIALITY,
  COMPANY_STATUS,
  DECISION_TYPE,
  DOC_STATUS,
  DOC_TYPES,
  FULL_DD_STATUS,
  GATE_ALLOWED,
  GATE_DECISIONS,
  GATE_DECISION_STATUS,
  INDUSTRIES,
  LOI_STATUS,
  ORIGIN_TYPES,
  OWNERSHIP_TYPES,
  PASS_LOST_REASONS,
  PE_ROLES,
  PRIMARY_STRATEGIES,
  PRIORITY,
  PROJECT_COMPANY_ROLES,
  PROJECT_COMPANY_STATUS,
  PROJECT_STATUS,
  PROJECT_TYPES,
  RATING_LMH,
  RESEARCH_STATUS,
  STAGES,
  STAGE_DELIVERABLE,
  STAGE_LABEL,
  STAGE_NEXT,
  STAGE_STATUS,
  THESIS_FIT,
  THESIS_SCOPES,
  THESIS_STATUS,
  TIER_LABEL,
} from './lists.ts';

/**
 * Our name for a list, against ARPA's name for it in the `Vocabulary` sheet.
 *
 * This is the test that matters most in the file. Every one of these lists is
 * also a check constraint in `ios_*`, so a dropped option or a plain hyphen typed
 * where their text has an en dash does not fail here as a typo: it fails in
 * production as a rejected insert, on a form nobody can submit. Catch it in
 * `npm test` instead.
 */
const MIRRORS: [string, readonly string[], readonly string[]][] = [
  ['Current Stage', STAGES, VOCABULARY['Current Stage']],
  ['Project Status', PROJECT_STATUS, VOCABULARY['Project Status']],
  ['Stage Status', STAGE_STATUS, VOCABULARY['Stage Status']],
  ['Gate Decision', GATE_DECISIONS, VOCABULARY['Gate Decision']],
  ['Gate Decision Status', GATE_DECISION_STATUS, VOCABULARY['Gate Decision Status']],
  ['Document Type', DOC_TYPES, VOCABULARY['Document Type']],
  ['Document Status', DOC_STATUS, VOCABULARY['Document Status']],
  ['LOI Status', LOI_STATUS, VOCABULARY['LOI Status']],
  ['Full DD Status', FULL_DD_STATUS, VOCABULARY['Full DD Status']],
  ['Closing Status', CLOSING_STATUS, VOCABULARY['Closing Status']],
  ['Pass / Lost Reason', PASS_LOST_REASONS, VOCABULARY['Pass / Lost Reason']],
  ['Project Type', PROJECT_TYPES, VOCABULARY['Project Type']],
  ['Project Company Role', PROJECT_COMPANY_ROLES, VOCABULARY['Project Company Role']],
  ['Project Company Status', PROJECT_COMPANY_STATUS, VOCABULARY['Project Company Status']],
  ['Thesis Fit', THESIS_FIT, VOCABULARY['Thesis Fit']],
  ['Thesis Status', THESIS_STATUS, VOCABULARY['Thesis Status']],
  ['Thesis Scope', THESIS_SCOPES, VOCABULARY['Thesis Scope']],
  ['Primary Strategy', PRIMARY_STRATEGIES, VOCABULARY['Primary Strategy']],
  ['Industry', INDUSTRIES, VOCABULARY.Industry],
  ['PE Role', PE_ROLES, VOCABULARY['PE Role']],
  ['Company Status', COMPANY_STATUS, VOCABULARY['Company Status']],
  ['Ownership Type', OWNERSHIP_TYPES, VOCABULARY['Ownership Type']],
  ['Origin Type', ORIGIN_TYPES, VOCABULARY['Origin Type']],
  ['Confidence', CONFIDENCE, VOCABULARY.Confidence],
  ['Priority', PRIORITY, VOCABULARY.Priority],
  ['Rating LMH', RATING_LMH, VOCABULARY['Rating LMH']],
  ['AI Output Status', AI_OUTPUT_STATUS, VOCABULARY['AI Output Status']],
  ['Research Status', RESEARCH_STATUS, VOCABULARY['Research Status']],
  [
    'Data Room Confidentiality',
    CONFIDENTIALITY,
    VOCABULARY['Data Room Confidentiality'],
  ],
];

test('every list mirrors ARPA\u2019s vocabulary sheet, option for option', () => {
  for (const [name, ours, theirs] of MIRRORS) {
    assert.ok(theirs, `the workbook has no list called ${name}`);
    assert.deepEqual([...ours], [...theirs], `list out of sync: ${name}`);
  }
});

test('the tier labels keep ARPA\u2019s en dash', () => {
  const theirs = VOCABULARY['Attractiveness Tier'];
  assert.deepEqual([TIER_LABEL.A, TIER_LABEL.B, TIER_LABEL.C], [...theirs]);
});

/**
 * Their `Decision Type` formula covers all 16 decisions. A decision with no type
 * would reach the server action and fall through every branch, so the gate would
 * record the decision and move nothing.
 */
test('all 16 decisions have a type and no extras sneak in', () => {
  assert.deepEqual(Object.keys(DECISION_TYPE).sort(), [...GATE_DECISIONS].sort());
  assert.equal(GATE_DECISIONS.length, 16);
});

test('every allowed decision is a real decision', () => {
  for (const stage of STAGES) {
    for (const decision of GATE_ALLOWED[stage]) {
      assert.ok(GATE_DECISIONS.includes(decision), `${stage} allows unknown ${decision}`);
    }
  }
});

test('the nine stages are covered by labels, next and deliverables', () => {
  assert.equal(STAGES.length, 9);
  for (const stage of STAGES) {
    assert.ok(STAGE_LABEL[stage], `no Spanish label for ${stage}`);
    assert.ok(stage in GATE_ALLOWED, `no allowed decisions for ${stage}`);
  }
  // Portfolio is terminal and has no gate, so it has neither a next stage nor a
  // deliverable nor any allowed decision. That absence is the rule, not a gap.
  assert.equal(STAGE_NEXT.Portfolio, undefined);
  assert.equal(STAGE_DELIVERABLE.Portfolio, undefined);
  assert.deepEqual([...GATE_ALLOWED.Portfolio], []);
  assert.equal(Object.keys(STAGE_NEXT).length, 8);
  // Closing's gate reads closing_status, not a document, so it has no deliverable.
  assert.equal(STAGE_DELIVERABLE.Closing, undefined);
});

test('STAGE_NEXT walks the funnel in order with no shortcuts', () => {
  for (let i = 0; i < STAGES.length - 1; i += 1) {
    assert.equal(STAGE_NEXT[STAGES[i]], STAGES[i + 1], `${STAGES[i]} jumps the queue`);
  }
});

test('every deliverable is a known document type', () => {
  for (const doc of Object.values(STAGE_DELIVERABLE)) {
    assert.ok(DOC_TYPES.includes(doc), `unknown deliverable ${doc}`);
  }
});
