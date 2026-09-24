import test from 'node:test';
import assert from 'node:assert/strict';
import { makeObject, connect, removeEdge, objectHeight } from '../lib/graph.ts';
import {
  relationSide,
  relationGesture,
  finishRelation,
  relationPreviewPath,
} from '../lib/relation-gesture.ts';

function fixture() {
  const objects = ['A', 'B', 'C'].map((id, i) => ({
    ...makeObject('NODE', { x: 600 - i * 300, y: i * 120 }),
    id,
    text: id,
  }));
  return {
    version: 1,
    title: 'Gesture',
    anchorId: 'A',
    objects,
    relationships: [],
  };
}
function start(map, id = 'A', side = 'left') {
  return relationGesture(
    relationGesture(
      { phase: 'idle' },
      { type: 'hover', sourceId: id, side },
      map,
    ),
    { type: 'start', pointer: { x: 0, y: 0 } },
    map,
  );
}
const target = (state, map, targetId) =>
  relationGesture(
    state,
    {
      type: 'target',
      candidateId: targetId,
      targetId,
      pointer: { x: 10, y: 20 },
    },
    map,
  );

test('D-093/D-094: nearest side locks until leave, including during drag', () => {
  const map = fixture();
  assert.equal(relationSide(110, 100, 200), 'left');
  assert.equal(relationSide(290, 100, 200), 'right');
  let s = relationGesture(
    { phase: 'idle' },
    { type: 'hover', sourceId: 'A', side: 'left' },
    map,
  );
  assert.equal(
    relationGesture(s, { type: 'hover', sourceId: 'A', side: 'right' }, map),
    s,
  );
  s = relationGesture(s, { type: 'leave', sourceId: 'A' }, map);
  s = relationGesture(s, { type: 'hover', sourceId: 'A', side: 'right' }, map);
  assert.equal(s.lockedSide, 'right');
  s = relationGesture(s, { type: 'start', pointer: { x: 0, y: 0 } }, map);
  assert.equal(relationGesture(s, { type: 'leave', sourceId: 'A' }, map), s);
  assert.equal(
    relationGesture(s, { type: 'hover', sourceId: 'B', side: 'left' }, map),
    s,
  );
});

test('D-008/D-041/D-095: source-to-target PATH preserves all positions and content', () => {
  const map = fixture(),
    before = structuredClone(map);
  const s = target(start(map), map, 'B');
  assert.equal(s.validity, 'valid');
  const result = finishRelation(map, s);
  assert.equal(result.state.phase, 'committed');
  assert.deepEqual(result.map.relationships[0], {
    id: result.map.relationships[0].id,
    sourceId: 'A',
    targetId: 'B',
    type: 'PATH',
  });
  for (const o of result.map.objects) {
    const { attachment: _attachment, ...content } = o;
    assert.deepEqual(
      content,
      before.objects.find((b) => b.id === o.id),
    );
  }
  assert.deepEqual(map, before);
  assert.equal(finishRelation(result.map, s).map, result.map);
});

test('D-012/D-095: canonical self, duplicate and cycle rejection', () => {
  let map = fixture();
  map.objects.push(
    { ...makeObject('IMAGINATION', { x: 0, y: 0 }), id: 'image' },
    { ...makeObject('SEED_BOX', { x: 0, y: 0 }), id: 'seeds' },
  );
  assert.equal(target(start(map), map, 'A').validity, 'invalid');
  assert.equal(finishRelation(map, target(start(map), map, 'A')).map, map);
  const related = finishRelation(map, target(start(map), map, 'seeds')).map;
  assert.equal(related.relationships.at(-1).type, 'RELATED');
  const reference = finishRelation(map, target(start(map), map, 'image')).map;
  assert.deepEqual(reference.relationships.at(-1), {
    id: reference.relationships.at(-1).id,
    sourceId: 'image',
    targetId: 'A',
    type: 'REFERENCE',
  });
  map = connect(connect(map, 'A', 'B'), 'B', 'C');
  assert.match(target(start(map), map, 'B').error, /already/);
  assert.match(target(start(map, 'C'), map, 'A').error, /circular/);
  assert.equal(finishRelation(map, target(start(map, 'C'), map, 'A')).map, map);
});

test('cancel, Escape, pointercancel, empty drop, deletion and cleanup have no commit', () => {
  const map = fixture(),
    s = target(start(map), map, 'B');
  for (const type of ['cancel', 'escape', 'pointercancel', 'cleanup']) {
    const next = relationGesture(s, { type }, map);
    assert.equal(finishRelation(map, next).map, map);
    assert.equal(next.phase, type === 'cleanup' ? 'idle' : 'cancelled');
  }
  assert.equal(finishRelation(map, start(map)).map, map);
  for (const id of ['A', 'B']) {
    const deleted = { ...map, objects: map.objects.filter((o) => o.id !== id) };
    assert.equal(
      relationGesture(s, { type: 'reconcile' }, deleted).phase,
      'cancelled',
    );
    assert.equal(finishRelation(deleted, s).map, deleted);
  }
});

test('D-043: removing the new relation preserves both Nodes', () => {
  const map = fixture();
  const next = finishRelation(map, target(start(map), map, 'B')).map;
  assert.deepEqual(
    removeEdge(next, next.relationships[0].id).objects.map(
      ({ id, x, y, text }) => ({ id, x, y, text }),
    ),
    map.objects.map(({ id, x, y, text }) => ({ id, x, y, text })),
  );
});

test('commit revalidates against graph changes made after the preview', () => {
  const map = fixture(),
    s = target(start(map), map, 'B');
  const duplicate = connect(map, 'A', 'B');
  assert.equal(finishRelation(duplicate, s).map, duplicate);
  const cycle = connect(connect(map, 'B', 'C'), 'C', 'A');
  assert.equal(
    relationGesture(s, { type: 'reconcile' }, cycle).validity,
    'invalid',
  );
  assert.equal(finishRelation(cycle, s).map, cycle);
  assert.equal(
    relationGesture(
      { phase: 'idle' },
      { type: 'start', pointer: { x: 0, y: 0 } },
      map,
    ).phase,
    'idle',
  );
});

test('preview wire begins at the connect handle in the source centre and reaches a Node center', () => {
  const [a, b] = fixture().objects;
  b.y = a.y;
  const from = `M${a.x + a.width / 2},${a.y + objectHeight(a) / 2} C`;
  for (const side of ['left', 'right']) {
    const d = relationPreviewPath(a, side, { x: 2, y: 3 }, b);
    assert.ok(d.startsWith(from), d);
    assert.ok(d.endsWith(`${b.x + b.width / 2},${b.y + objectHeight(b) / 2}`));
  }
  // Without a target it sets off toward the pointer, whichever side was hovered.
  const left = relationPreviewPath(a, 'right', { x: a.x - 300, y: a.y }, undefined);
  const firstControl = Number(left.split(' C')[1].split(',')[0]);
  assert.ok(firstControl < a.x + a.width / 2);
});
