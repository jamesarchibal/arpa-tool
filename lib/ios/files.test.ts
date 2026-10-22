import assert from 'node:assert/strict';
import test from 'node:test';

import { formatBytes, safeFileName, storageKey } from './files.ts';

test('safeFileName keeps a normal name recognisable', () => {
  assert.equal(safeFileName('QSS_Champinones_v2.pdf'), 'QSS_Champinones_v2.pdf');
});

test('safeFileName folds accents instead of dropping them', () => {
  assert.equal(safeFileName('Valoración Champiñones.xlsx'), 'Valoracion-Champinones.xlsx');
});

// The reason this module exists. A name with path separators in it must not be
// able to write outside its own project folder.
test('safeFileName cannot escape its folder', () => {
  assert.equal(safeFileName('../../otro-proyecto/LOI.pdf'), 'LOI.pdf');
  assert.equal(safeFileName('C:\\Users\\ignasi\\LOI.pdf'), 'LOI.pdf');
});

test('safeFileName removes what breaks a signed URL', () => {
  assert.equal(safeFileName('informe #3 ¿final?.docx'), 'informe-3-final.docx');
});

test('safeFileName never returns an empty key', () => {
  assert.equal(safeFileName('   '), 'fichero');
  assert.equal(safeFileName('¿¿¿'), 'fichero');
});

test('safeFileName caps the stem without eating the extension', () => {
  const out = safeFileName(`${'a'.repeat(300)}.pdf`);
  assert.equal(out, `${'a'.repeat(80)}.pdf`);
});

test('a dotfile is not read as an extension', () => {
  assert.equal(safeFileName('.gitignore'), 'gitignore');
});

test('storageKey puts the project first and the document second', () => {
  const key = storageKey('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'LOI.pdf');
  assert.match(
    key,
    /^11111111-1111-1111-1111-111111111111\/22222222-2222-2222-2222-222222222222\/\d+-LOI\.pdf$/,
  );
});

test('formatBytes reads like Spanish', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2,0 KB');
  assert.equal(formatBytes(2_500_000), '2,4 MB');
  assert.equal(formatBytes(45_000_000), '43 MB');
});
