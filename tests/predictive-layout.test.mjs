import assert from 'node:assert/strict';
import test from 'node:test';
import { predictiveLayout } from '../lib/graph.ts';

const object = (id, x, y, role = 'NORMAL') => ({
  id,
  type: 'NODE',
  role,
  text: id,
  note: '',
  x,
  y,
  width: role === 'GOAL' ? 280 : 210,
  height: 90,
  images: [],
  seeds: [],
  tier: 10,
  shuffle: 0,
  focal: 50,
  createdAt: 1,
  updatedAt: 1,
});

const relationship = (id, sourceId, targetId, type = 'PATH') => ({
  id,
  sourceId,
  targetId,
  type,
});

function baseMap() {
  const root = { ...object('root', 0, 0), attachment: 'old-root' };
  return {
    version: 1,
    title: 'Predictive layout',
    anchorId: 'parent',
    objects: [
      object('parent', -360, 0),
      object('other-parent', -360, 220),
      root,
      object('child', 340, 0),
      object('shared', 680, 0),
      object('goal', 1020, 0, 'GOAL'),
      object('target', 0, 360),
      object('obstacle', 300, 360),
      object('distant', 2000, 1200),
    ],
    relationships: [
      relationship('old-root', 'parent', 'root'),
      relationship('extra-incoming', 'other-parent', 'root'),
      relationship('root-child', 'root', 'child'),
      relationship('child-shared', 'child', 'shared'),
      relationship('other-shared', 'other-parent', 'shared'),
      relationship('shared-goal', 'shared', 'goal'),
      relationship('related', 'root', 'obstacle', 'RELATED'),
      relationship('reference', 'root', 'distant', 'REFERENCE'),
    ],
  };
}

const position = (map, id) => {
  const item = map.objects.find((object) => object.id === id);
  return { x: item.x, y: item.y };
};

test('ordinary branch drag resolves full-bounds collision locally', () => {
  const map = baseMap();
  const moving = new Set(['root', 'child', 'shared', 'goal']);
  const result = predictiveLayout({
    baseMap: map,
    movingIds: moving,
    dragDelta: { x: 0, y: 360 },
    draggedRootId: 'root',
    explicitSelection: false,
  });
  assert.equal(result.valid, true);
  assert.notDeepEqual(position(result.previewMap, 'root'), { x: 0, y: 360 });
  assert.deepEqual(position(result.previewMap, 'distant'), position(map, 'distant'));
  assert.equal(
    position(result.previewMap, 'child').x - position(result.previewMap, 'root').x,
    340,
  );
});

test('re-parent changes one attachment and preserves other relationships', () => {
  const map = baseMap();
  const result = predictiveLayout({
    baseMap: map,
    movingIds: new Set(['root', 'child', 'shared', 'goal']),
    dragDelta: { x: 0, y: 300 },
    draggedRootId: 'root',
    optionalTargetId: 'target',
    explicitSelection: false,
  });
  assert.equal(result.valid, true);
  assert.equal(
    result.previewMap.relationships.some(({ id }) => id === 'old-root'),
    false,
  );
  for (const id of ['extra-incoming', 'related', 'reference'])
    assert.equal(
      result.previewMap.relationships.some((edge) => edge.id === id),
      true,
    );
  const root = result.previewMap.objects.find(({ id }) => id === 'root');
  assert.equal(root.attachment, result.relationshipChange.attachmentId);
});

test('shared downstream and goals retain their relative offsets', () => {
  const map = baseMap();
  const result = predictiveLayout({
    baseMap: map,
    movingIds: new Set(['root', 'child', 'shared', 'goal']),
    dragDelta: { x: 120, y: -80 },
    draggedRootId: 'root',
    explicitSelection: false,
  });
  for (const id of ['child', 'shared', 'goal']) {
    assert.equal(
      position(result.previewMap, id).x - position(result.previewMap, 'root').x,
      position(map, id).x - position(map, 'root').x,
    );
    assert.equal(
      position(result.previewMap, id).y - position(result.previewMap, 'root').y,
      position(map, id).y - position(map, 'root').y,
    );
  }
});

test('explicit selection moves only selected objects and never re-parents', () => {
  const map = baseMap();
  const result = predictiveLayout({
    baseMap: map,
    movingIds: new Set(['root', 'obstacle']),
    dragDelta: { x: 50, y: 40 },
    draggedRootId: 'root',
    optionalTargetId: 'target',
    explicitSelection: true,
  });
  assert.equal(result.relationshipChange, undefined);
  assert.deepEqual(result.previewMap.relationships, map.relationships);
  assert.deepEqual(position(result.previewMap, 'child'), position(map, 'child'));
});

test('invalid circular re-parent never changes semantics', () => {
  const map = baseMap();
  const result = predictiveLayout({
    baseMap: map,
    movingIds: new Set(['root', 'child', 'shared', 'goal']),
    dragDelta: { x: 50, y: 20 },
    draggedRootId: 'root',
    optionalTargetId: 'child',
    explicitSelection: false,
  });
  assert.equal(result.valid, false);
  assert.match(result.message, /circular/);
  assert.deepEqual(result.previewMap.relationships, map.relationships);
});

test('predictive output is deterministic and preserves unrelated identity', () => {
  const map = baseMap();
  const input = {
    baseMap: map,
    movingIds: new Set(['root', 'child', 'shared', 'goal']),
    dragDelta: { x: 40, y: 330 },
    draggedRootId: 'root',
    optionalTargetId: 'target',
    explicitSelection: false,
  };
  const first = predictiveLayout(input);
  const second = predictiveLayout(input);
  assert.deepEqual(first, second);
  assert.equal(
    first.previewMap.objects.find(({ id }) => id === 'distant'),
    map.objects.find(({ id }) => id === 'distant'),
  );
});

test('a drag in flight tracks the pointer literally and reports the overlap', () => {
  const map = baseMap();
  const input = {
    baseMap: map,
    movingIds: new Set(['root', 'child', 'shared', 'goal']),
    dragDelta: { x: 0, y: 360 },
    draggedRootId: 'root',
    explicitSelection: false,
  };
  const flight = predictiveLayout({ ...input, settle: false });
  assert.equal(flight.valid, true);
  assert.deepEqual(position(flight.previewMap, 'root'), { x: 0, y: 360 });
  assert.deepEqual(position(flight.previewMap, 'child'), { x: 340, y: 360 });
  assert.equal(flight.overlappingIds.has('root'), true);
  assert.equal(flight.overlappingIds.has('goal'), false);
  const settled = predictiveLayout(input);
  assert.equal(settled.overlappingIds.size, 0);
  assert.notDeepEqual(position(settled.previewMap, 'root'), { x: 0, y: 360 });
});

test('an unsettled drag over free space reports no overlap', () => {
  const map = baseMap();
  const result = predictiveLayout({
    baseMap: map,
    movingIds: new Set(['root', 'child', 'shared', 'goal']),
    dragDelta: { x: 0, y: -400 },
    draggedRootId: 'root',
    explicitSelection: false,
    settle: false,
  });
  assert.equal(result.overlappingIds.size, 0);
  assert.deepEqual(position(result.previewMap, 'root'), { x: 0, y: -400 });
});

test('an unsettled re-parent still applies the attachment change', () => {
  const map = baseMap();
  const result = predictiveLayout({
    baseMap: map,
    movingIds: new Set(['root', 'child', 'shared', 'goal']),
    dragDelta: { x: 0, y: 300 },
    draggedRootId: 'root',
    optionalTargetId: 'target',
    explicitSelection: false,
    settle: false,
  });
  assert.equal(result.valid, true);
  assert.equal(
    result.previewMap.relationships.some(({ id }) => id === 'old-root'),
    false,
  );
  assert.deepEqual(position(result.previewMap, 'root'), { x: 0, y: 300 });
  assert.equal(result.overlappingIds.has('root'), true);
});
