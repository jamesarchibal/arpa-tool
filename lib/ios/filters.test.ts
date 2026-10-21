import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CROSS_SECTOR,
  filterArchetypes,
  filterCompanies,
  filterIndustries,
  filterTheses,
} from './filters.ts';

const INDUSTRIES = [
  { tier: 'A', industry: 'Industrials', sector: 'Testing' },
  { tier: 'B', industry: 'Industrials', sector: 'MRO' },
  { tier: 'C', industry: 'Healthcare', sector: 'Dental' },
];

const THESES = [
  { scope: 'Subsector', primary_strategy: 'Buy & build', priority: 'High', subsectors: ['Testing'] },
  { scope: 'Subsector', primary_strategy: 'Carve-out', priority: 'Low', subsectors: ['MRO', 'Testing'] },
  // The 17 real ones: Cross-sector, no subsector at all, on purpose.
  { scope: 'Cross-sector', primary_strategy: 'Buy & build', priority: 'High', subsectors: [] },
];

const COMPANIES = [
  { subsector: 'Testing', archetype: 'NDT', province: 'Barcelona', source: 'SABI' },
  { subsector: 'MRO', archetype: 'MRO shop', province: 'Madrid', source: 'Informa' },
  // Nulls are real in the long list: a missing province must never match a
  // province filter, and must never crash it either.
  { subsector: null, archetype: null, province: null, source: null },
];

test('no filters returns every row', () => {
  assert.equal(filterIndustries(INDUSTRIES, {}).length, 3);
  assert.equal(filterTheses(THESES, {}).length, 3);
  assert.equal(filterCompanies(COMPANIES, {}).length, 3);
});

test('an empty string is not a filter', () => {
  // `searchParams` hands over '' for a cleared dropdown, which must behave the
  // same as the key being absent.
  assert.equal(filterIndustries(INDUSTRIES, { tier: '' }).length, 3);
  assert.equal(filterCompanies(COMPANIES, { province: '' }).length, 3);
});

test('industry filters accumulate', () => {
  assert.equal(filterIndustries(INDUSTRIES, { industry: 'Industrials' }).length, 2);
  assert.equal(
    filterIndustries(INDUSTRIES, { industry: 'Industrials', tier: 'A' }).length,
    1,
  );
  assert.equal(filterIndustries(INDUSTRIES, { industry: 'Industrials', tier: 'C' }).length, 0);
});

test('a subsector filter keeps the theses that list it', () => {
  const rows = filterTheses(THESES, { subsector: 'Testing' });
  assert.equal(rows.length, 2);
});

test('the cross-sector option returns only the theses with no subsector', () => {
  const rows = filterTheses(THESES, { subsector: CROSS_SECTOR });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scope, 'Cross-sector');
});

test('cross-sector theses are reachable by scope, strategy and priority too', () => {
  // The screen's rule: they are never hidden by anything except a subsector.
  assert.ok(
    filterTheses(THESES, { strategy: 'Buy & build' }).some((t) => t.scope === 'Cross-sector'),
  );
  assert.ok(filterTheses(THESES, { priority: 'High' }).some((t) => t.scope === 'Cross-sector'));
});

test('a null field never matches a filter on that field', () => {
  assert.equal(filterCompanies(COMPANIES, { province: 'Barcelona' }).length, 1);
  assert.equal(filterCompanies(COMPANIES, { source: 'SABI' }).length, 1);
  assert.equal(filterCompanies(COMPANIES, { subsector: 'Testing', province: 'Madrid' }).length, 0);
});

test('archetypes filter by subsector and by PE role', () => {
  const rows = [
    { subsector: 'Testing', pe_role: 'Platform' },
    { subsector: 'Testing', pe_role: 'Add-on' },
    { subsector: 'MRO', pe_role: null },
  ];
  assert.equal(filterArchetypes(rows, { subsector: 'Testing' }).length, 2);
  assert.equal(filterArchetypes(rows, { subsector: 'Testing', role: 'Add-on' }).length, 1);
  assert.equal(filterArchetypes(rows, { role: 'Platform' }).length, 1);
});

test('filtering never mutates the input', () => {
  const before = JSON.stringify(COMPANIES);
  filterCompanies(COMPANIES, { province: 'Madrid' });
  assert.equal(JSON.stringify(COMPANIES), before);
});
