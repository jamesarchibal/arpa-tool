import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cnaeCode,
  eurToMillions,
  fillPatch,
  latestOf,
  matchProvince,
  pickArchetype,
  toLongListDraft,
  type ExistingCompany,
} from './sabi-import.ts';

const EMPTY: ExistingCompany = {
  province: null,
  revenue_estimate_eur_m: null,
  ebitda_estimate_eur_m: null,
  research_notes: null,
  archetype_id: null,
  industry_id: null,
};

test('euros become millions with the two decimals the column stores', () => {
  assert.equal(eurToMillions(3_926_157), 3.93);
  assert.equal(eurToMillions(0), 0);
  assert.equal(eurToMillions(null), null);
});

test('a blank figure stays null and never becomes zero (his QA-20)', () => {
  assert.equal(latestOf([null, null]), null);
  assert.equal(eurToMillions(latestOf([null, null])), null);
});

test('the latest year is the last non-null, not the last cell', () => {
  assert.equal(latestOf([1, 2, 3]), 3);
  assert.equal(latestOf([1, 2, null]), 2);
});

test('only a 4-digit CNAE class is kept, a 3-digit group is not', () => {
  assert.equal(cnaeCode('2822 Fabricación de maquinaria'), '2822');
  assert.equal(cnaeCode('712'), null);
  assert.equal(cnaeCode(null), null);
});

test("SABI's shouted province matches his spelling, accents and all", () => {
  const known = ['Tarragona', 'A Coruña', 'Bizkaia'];
  assert.equal(matchProvince('TARRAGONA', known), 'Tarragona');
  assert.equal(matchProvince('A CORUÑA', known), 'A Coruña');
  assert.equal(matchProvince('A CORUNA', known), 'A Coruña');
});

test('an unknown province is kept verbatim, not dropped', () => {
  assert.equal(matchProvince('CEUTA', ['Tarragona']), 'CEUTA');
  assert.equal(matchProvince('  ', ['Tarragona']), null);
});

test('an archetype is only assigned when exactly one claims the CNAE', () => {
  const archetypes = [
    { id: 'a', cnae_codes: ['2822', '2829'] },
    { id: 'b', cnae_codes: ['7120'] },
    { id: 'c', cnae_codes: ['7120', '7490'] },
  ];
  assert.equal(pickArchetype('2822', archetypes)?.id, 'a');
  // 7120 is shared, which is the common case in his library, so it stays empty.
  assert.equal(pickArchetype('7120', archetypes), null);
  assert.equal(pickArchetype('9999', archetypes), null);
  assert.equal(pickArchetype(null, archetypes), null);
});

test('a SABI sheet maps to a long-list draft end to end', () => {
  const draft = toLongListDraft(
    {
      legal_name: '  TALLERES EJEMPLO SL  ',
      region: 'TARRAGONA',
      cnae: '2822 Fabricación de maquinaria',
      revenue: [3_000_000, 3_926_157],
      ebitda: [null, 1_480_000],
      notes: 'Actividad: mecanizado',
    },
    ['Tarragona'],
  );

  assert.deepEqual(draft, {
    name: 'TALLERES EJEMPLO SL',
    province: 'Tarragona',
    cnae: '2822',
    revenue_estimate_eur_m: 3.93,
    ebitda_estimate_eur_m: 1.48,
    research_notes: 'Actividad: mecanizado',
  });
});

test('nothing is overwritten with an empty, which is his A17 rule', () => {
  const draft = toLongListDraft(
    { legal_name: 'X', region: null, cnae: null, revenue: [], ebitda: [], notes: null },
    [],
  );
  const existing: ExistingCompany = {
    ...EMPTY,
    province: 'Barcelona',
    revenue_estimate_eur_m: 12,
    research_notes: 'lo escribió una persona',
  };
  assert.deepEqual(fillPatch(existing, draft, null), {});
});

test('a filed figure beats a directory estimate but a human note is never replaced', () => {
  const draft = toLongListDraft(
    {
      legal_name: 'X',
      region: null,
      cnae: null,
      revenue: [4_000_000],
      ebitda: [],
      notes: 'lo dijo SABI',
    },
    [],
  );
  const patch = fillPatch(
    { ...EMPTY, revenue_estimate_eur_m: 12, research_notes: 'lo escribió una persona' },
    draft,
    null,
  );
  assert.deepEqual(patch, { revenue_estimate_eur_m: 4 });
});

test('the archetype and its subsector only fill an empty slot', () => {
  const draft = toLongListDraft(
    { legal_name: 'X', region: null, cnae: '2822', revenue: [], ebitda: [], notes: null },
    [],
  );
  const arch = { id: 'a1', industry_id: 'i1' };

  assert.deepEqual(fillPatch(EMPTY, draft, arch), {
    archetype_id: 'a1',
    industry_id: 'i1',
  });
  assert.deepEqual(fillPatch({ ...EMPTY, archetype_id: 'other' }, draft, arch), {});
  // Already filed under a subsector by hand: the archetype lands, the subsector
  // is left alone rather than being moved underneath someone.
  assert.deepEqual(fillPatch({ ...EMPTY, industry_id: 'mine' }, draft, arch), {
    archetype_id: 'a1',
  });
});

test('a patch is a patch and never mentions a field it does not change', () => {
  const draft = toLongListDraft(
    { legal_name: 'X', region: 'TARRAGONA', cnae: null, revenue: [], ebitda: [], notes: null },
    ['Tarragona'],
  );
  const patch = fillPatch({ ...EMPTY, province: 'Tarragona' }, draft, null);
  assert.deepEqual(Object.keys(patch), []);
});
