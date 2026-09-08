import assert from 'node:assert/strict';
import test from 'node:test';
import {
  quarantineMissingAssetReferences,
  shouldRejectImagePaste,
} from '../lib/image-request.ts';

test('image paste is rejected only when more than one object is selected', () => {
  assert.equal(shouldRejectImagePaste(['image/png'], 2), true);
  assert.equal(shouldRejectImagePaste(['text/plain', 'image/webp'], 3), true);
  assert.equal(shouldRejectImagePaste(['image/png'], 1), false);
  assert.equal(shouldRejectImagePaste(['image/png'], 0), false);
  assert.equal(shouldRejectImagePaste(['text/plain'], 2), false);
});

test('missing image references are quarantined without mutating valid objects', () => {
  const valid = {
    id: 'valid',
    type: 'NODE',
    role: 'NORMAL',
    text: 'Valid',
    note: '',
    x: 0,
    y: 0,
    width: 210,
    height: 90,
    images: ['asset-ok'],
    seeds: [],
    tier: 10,
    shuffle: 0,
    focal: 50,
    createdAt: 1,
    updatedAt: 1,
  };
  const orphaned = { ...valid, id: 'orphaned', images: ['asset-missing'] };
  const map = {
    version: 1,
    title: 'Assets',
    anchorId: 'valid',
    objects: [valid, orphaned],
    relationships: [],
  };
  const result = quarantineMissingAssetReferences(map, new Set(['asset-ok']));
  assert.deepEqual(result.missing, ['asset-missing']);
  assert.equal(result.map.objects[0], valid);
  assert.deepEqual(result.map.objects[1].images, []);
  assert.deepEqual(map.objects[1].images, ['asset-missing']);
});
