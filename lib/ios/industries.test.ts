import assert from 'node:assert/strict';
import { test } from 'node:test';

import { INDUSTRIES_ORACLE } from './__fixtures__/industries-oracle.ts';
import {
  INDUSTRY_CRITERIA,
  type IndustryRatings,
  industryScore,
  industryTier,
} from './industries.ts';

/** The oracle keeps the ratings as an array in the sheet's column order. */
function ratingsOf(row: { ratings: number[] }): IndustryRatings {
  return Object.fromEntries(
    INDUSTRY_CRITERIA.map((c, i) => [c.key, row.ratings[i]]),
  ) as IndustryRatings;
}

test('the weights add up to exactly 1', () => {
  // Compare integers. 0.15 * 4 + 0.1 * 4 is 0.9999999999999999 as a float, so
  // asserting on the sum itself would fail on a model that is perfectly correct.
  const basisPoints = INDUSTRY_CRITERIA.reduce((n, c) => n + Math.round(c.weight * 100), 0);
  assert.equal(basisPoints, 100);
  assert.equal(INDUSTRY_CRITERIA.length, 8);
});

test('our score equals ARPA\u2019s on all 100 subsectors', () => {
  assert.equal(INDUSTRIES_ORACLE.length, 100);
  for (const row of INDUSTRIES_ORACLE) {
    assert.equal(
      industryScore(ratingsOf(row)),
      row.score,
      `score differs for ${row.subsector}`,
    );
  }
});

test('our tier equals ARPA\u2019s on all 100 subsectors', () => {
  for (const row of INDUSTRIES_ORACLE) {
    assert.equal(
      industryTier(industryScore(ratingsOf(row))),
      row.tier,
      `tier differs for ${row.subsector}`,
    );
  }
});

/**
 * The reason `industryScore` rounds to two decimals before anything compares it.
 *
 * This subsector's eight ratings sum to 3.7499999999999996 in floating point. An
 * unrounded `>= 3.75` makes it B; ARPA's sheet says A. If someone deletes the
 * rounding, this is the test that goes red, and the message says why.
 */
test('3.7499999999999996 is tier A, because the score rounds first', () => {
  const row = INDUSTRIES_ORACLE.find(
    (r) => r.subsector === 'Electrical equipment / switchgear / transformers',
  );
  assert.ok(row, 'the oracle lost the subsector this test exists for');
  const raw = INDUSTRY_CRITERIA.reduce(
    (n, c, i) => n + row.ratings[i] * c.weight,
    0,
  );
  assert.ok(raw < 3.75, 'the float trap is gone, this test no longer proves anything');
  assert.equal(industryScore(ratingsOf(row)), 3.75);
  assert.equal(industryTier(industryScore(ratingsOf(row))), 'A');
});

test('the tier split is ARPA\u2019s 21 / 36 / 43', () => {
  const count = { A: 0, B: 0, C: 0 };
  for (const row of INDUSTRIES_ORACLE) {
    count[industryTier(industryScore(ratingsOf(row)))] += 1;
  }
  assert.deepEqual(count, { A: 21, B: 36, C: 43 });
});

test('a rating outside 1 to 5 throws instead of scoring', () => {
  const ok = ratingsOf(INDUSTRIES_ORACLE[0]);
  assert.throws(() => industryScore({ ...ok, market_growth: 0 }), /market_growth/);
  assert.throws(() => industryScore({ ...ok, risk_low_is_5: 6 }), /risk_low_is_5/);
  assert.throws(() => industryScore({ ...ok, target_density: 3.5 }), /target_density/);
});
