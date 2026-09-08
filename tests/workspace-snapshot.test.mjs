import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMap } from '../lib/graph.ts';
import {
  chooseWorkspaceSnapshot,
  decodeWorkspaceSnapshot,
  makeWorkspaceSnapshot,
} from '../lib/workspace-snapshot.ts';

const map = (title) => ({
  version: 1,
  title,
  anchorId: '',
  objects: [],
  relationships: [],
});

test('newer database revision wins over local recovery', () => {
  const local = makeWorkspaceSnapshot(map('local'), 4, 40);
  const database = makeWorkspaceSnapshot(map('database'), 5, 50);
  assert.equal(chooseWorkspaceSnapshot(local, database), database);
});

test('newer local recovery wins over database', () => {
  const local = makeWorkspaceSnapshot(map('local'), 6, 60);
  const database = makeWorkspaceSnapshot(map('database'), 5, 50);
  assert.equal(chooseWorkspaceSnapshot(local, database), local);
});

test('database wins equal revision ties by freshness', () => {
  const local = makeWorkspaceSnapshot(map('local'), 5, 50);
  const database = makeWorkspaceSnapshot(map('database'), 5, 51);
  assert.equal(chooseWorkspaceSnapshot(local, database), database);
});

test('legacy maps migrate in memory at the lowest revision', () => {
  const legacy = decodeWorkspaceSnapshot(map('legacy'), validateMap);
  assert.equal(legacy?.revision, 0);
  assert.equal(legacy?.savedAt, 0);
  assert.equal(legacy?.map.title, 'legacy');
});

test('invalid envelope is rejected independently', () => {
  assert.throws(
    () =>
      decodeWorkspaceSnapshot(
        { schemaVersion: 1, revision: -1, savedAt: 1, map: map('bad') },
        validateMap,
      ),
    /invalid/,
  );
  const database = makeWorkspaceSnapshot(map('database'), 3, 30);
  assert.equal(chooseWorkspaceSnapshot(null, database), database);
});

test('no valid candidates returns null so the caller can use demo data', () => {
  assert.equal(chooseWorkspaceSnapshot(null, null), null);
});
