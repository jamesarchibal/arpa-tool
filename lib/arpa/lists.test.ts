import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FUNNEL_LANES, STAGES } from './lists.ts';

/**
 * The board renders a column per lane and nothing else, so a stage that belongs
 * to no lane is a project that silently vanishes from Proyectos. That failure is
 * invisible on screen: the board looks fine, it is just missing a card.
 */
test('every stage belongs to exactly one lane', () => {
  const seen = FUNNEL_LANES.flatMap((l) => l.stages);
  assert.deepEqual([...new Set(seen)].length, seen.length, 'a stage is in two lanes');
  for (const stage of STAGES) {
    assert.equal(seen.filter((s) => s === stage).length, 1, `stage not on the board: ${stage}`);
  }
});

test('no lane invents a stage', () => {
  for (const lane of FUNNEL_LANES) {
    for (const stage of lane.stages) {
      assert.ok(STAGES.includes(stage), `lane ${lane.key} names an unknown stage: ${stage}`);
    }
  }
});
