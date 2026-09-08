import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRejectImagePaste } from '../lib/image-request.ts';

test('image paste is rejected only when more than one object is selected', () => {
  assert.equal(shouldRejectImagePaste(['image/png'], 2), true);
  assert.equal(shouldRejectImagePaste(['text/plain', 'image/webp'], 3), true);
  assert.equal(shouldRejectImagePaste(['image/png'], 1), false);
  assert.equal(shouldRejectImagePaste(['image/png'], 0), false);
  assert.equal(shouldRejectImagePaste(['text/plain'], 2), false);
});
