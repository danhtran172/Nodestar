import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeObject,
  connect,
  reachable,
  branch,
  relationError,
  deleteObjects,
  duplicate,
  copySelection,
  reparent,
  moveSeed,
  addSeed,
  editEdge,
  validateMap,
  reflowBranch,
  moveObjects,
  seedLayout,
  seedBedInset,
  seedBoxChrome,
  objectHeight,
  imaginationDimensions,
  imaginationWidth,
  minPanelWidth,
  panelHeight,
  seedBoxWidth,
  seedBoxHeight,
} from '../lib/graph.ts';

test('Imagination supports both collage and equal-tile geometry', () => {
  const collage = imaginationDimensions(6, 'small', 'collage');
  const uniform = imaginationDimensions(6, 'small', 'uniform');
  // A collage widens the frame around its primary tile; equal tiles keep the
  // preset width and grow downward instead.
  assert.equal(collage.width, 336);
  assert.equal(collage.height, 336);
  assert.equal(uniform.width, imaginationWidth);
  assert.equal(uniform.height, 147);
});

test('a Seed Box and an Imagination start as compact panels', () => {
  const box = makeObject('SEED_BOX', { x: 0, y: 0 });
  const mood = makeObject('IMAGINATION', { x: 0, y: 0 });
  // A Seed Box starts landscape so its chips read across, not down.
  assert.equal(box.width, seedBoxWidth);
  assert.equal(box.height, seedBoxHeight);
  assert.equal(objectHeight(box), seedBoxHeight);
  assert.ok(box.width > box.height);
  assert.equal(mood.width, imaginationWidth);
  assert.equal(mood.height, panelHeight);
  assert.equal(objectHeight(mood), panelHeight);
  for (const o of [box, mood]) {
    // The floor sits below the starting size, so a panel that was widened can
    // be brought back down to the size it was created at.
    assert.ok(o.width > minPanelWidth);
  }
  // An empty Imagination is exactly its preset, so being created and having
  // its size re-derived agree.
  assert.deepEqual(imaginationDimensions(0, 'small'), {
    width: imaginationWidth,
    height: panelHeight,
  });
});

test('a copied selection is a valid independent map', () => {
  let m = setup();
  const [a, b, c] = m.objects;
  m = connect(connect(m, a.id, b.id), b.id, c.id);
  const copied = copySelection(m, new Set([b.id, c.id]));
  assert.equal(validateMap(copied), copied);
  assert.equal(copied.objects[0].attachment, undefined);
});
test('import rejects invalid IDs, roles, capacities and missing endpoints', () => {
  const m = setup();
  assert.equal(validateMap(m), m);
  const bad = structuredClone(m);
  bad.objects[1].id = bad.objects[0].id;
  assert.throws(() => validateMap(bad));
  const role = structuredClone(m);
  role.objects[0].role = 'TASK';
  assert.throws(() => validateMap(role));
  const edge = structuredClone(m);
  edge.relationships.push({
    id: 'bad',
    type: 'PATH',
    sourceId: m.objects[0].id,
    targetId: 'missing',
  });
  assert.throws(() => validateMap(edge));
});
test('local reflow preserves other branches and goal anchors', () => {
  const m = setup();
  m.objects[1].x = m.objects[0].x;
  m.objects[1].role = 'GOAL';
  const n = reflowBranch(m, new Set([m.objects[0].id, m.objects[1].id]));
  assert.deepEqual(n.objects[1], m.objects[1]);
  assert.deepEqual(n.objects.slice(2), m.objects.slice(2));
  assert.notEqual(n.objects[0].y, m.objects[0].y);
});
test('seed chips are stable, bounded and accommodate long text', () => {
  let m = setup();
  const b = makeObject('SEED_BOX', { x: 0, y: 0 });
  m.objects.push(b);
  for (let i = 0; i < 12; i++)
    m = addSeed(
      m,
      b.id,
      i === 0 ? 'A very long idea '.repeat(25) : `Idea ${i}`,
    );
  const box = m.objects.find((o) => o.id === b.id),
    layout = seedLayout(box);
  assert.deepEqual(seedLayout(box), layout);
  for (const s of layout.positions) {
    assert.ok(s.x >= 0);
    assert.ok(s.x + s.width <= box.width - seedBedInset * 2);
    assert.ok(s.y + s.height <= layout.height);
  }
  assert.ok(objectHeight(box) >= layout.height + seedBoxChrome);
});
test('500-node shared downstream traversal and movement remain exact', (t) => {
  const m = setup(500);
  m.relationships = m.objects
    .slice(1)
    .map((o, i) => ({
      id: `e${i}`,
      sourceId: m.objects[i].id,
      targetId: o.id,
      type: 'PATH',
    }));
  const start = performance.now(),
    ids = reachable(m, m.objects[0].id),
    moved = moveObjects(m, ids, { x: 15, y: 30 });
  assert.equal(ids.size, 500);
  assert.equal(moved.objects[499].x, m.objects[499].x + 15);
  assert.equal(moved.relationships, m.relationships);
  t.diagnostic(
    `500-node traversal and movement: ${(performance.now() - start).toFixed(2)} ms (domain engine only).`,
  );
});
function setup(n = 5) {
  const objects = Array.from({ length: n }, (_, i) =>
    makeObject('NODE', { x: i * 300, y: 0 }, 'NORMAL', String(i)),
  );
  return {
    version: 1,
    title: 'Test',
    anchorId: objects[0].id,
    objects,
    relationships: [],
  };
}
test('reject cycles, self relations and mixed duplicates', () => {
  let m = setup();
  const [a, b, c] = m.objects;
  m = connect(connect(m, a.id, b.id), b.id, c.id);
  assert.match(relationError(m, c.id, a.id, 'PATH'), /circular/);
  assert.ok(relationError(m, a.id, a.id, 'RELATED'));
  assert.ok(relationError(m, a.id, b.id, 'RELATED'));
  assert.equal(reachable(m, a.id).size, 3);
});
test('plus points away from the goal by default, goal and node alike', () => {
  const m = setup();
  m.objects[0].role = 'GOAL';
  const g = branch(m, m.objects[0].id);
  assert.equal(g.map.relationships[0].sourceId, m.objects[0].id);
  assert.equal(g.map.relationships[0].targetId, g.object.id);
  const n = branch(m, m.objects[1].id);
  assert.equal(n.map.relationships[0].sourceId, m.objects[1].id);
});
test('delete reconnects surviving boundaries through multi-deletion', () => {
  let m = setup();
  const [a, b, c, d] = m.objects;
  for (const [x, y] of [
    [a, b],
    [b, c],
    [c, d],
  ])
    m = connect(m, x.id, y.id);
  m = deleteObjects(m, new Set([b.id, c.id]));
  assert.ok(
    m.relationships.some((e) => e.sourceId === a.id && e.targetId === d.id),
  );
  assert.equal(m.relationships.length, 1);
});
test('ambiguous deletion is rejected', () => {
  let m = setup();
  const [a, b, x, c, d] = m.objects;
  for (const [p, q] of [
    [a, x],
    [b, x],
    [x, c],
    [x, d],
  ])
    m = connect(m, p.id, q.id);
  assert.throws(() => deleteObjects(m, new Set([x.id])), /multiple/);
});
test('duplicate only includes internal edges', () => {
  let m = setup();
  const [a, b, c] = m.objects;
  m = connect(connect(m, a.id, b.id), b.id, c.id);
  const r = duplicate(m, copySelection(m, new Set([a.id, b.id])));
  assert.equal(r.map.relationships.length, 3);
  assert.equal(r.ids.length, 2);
});
test('reparent preserves additional incoming and downstream edges', () => {
  let m = setup();
  const [a, b, c, d, x] = m.objects;
  for (const [p, q] of [
    [a, b],
    [x, b],
    [b, c],
  ])
    m = connect(m, p.id, q.id);
  const n = reparent(m, b.id, d.id);
  assert.ok(
    n.relationships.some((e) => e.sourceId === x.id && e.targetId === b.id),
  );
  assert.ok(
    n.relationships.some((e) => e.sourceId === b.id && e.targetId === c.id),
  );
  assert.ok(
    !n.relationships.some((e) => e.sourceId === a.id && e.targetId === b.id),
  );
  assert.throws(() => reparent(m, b.id, c.id), /circular/);
});
test('reverse checks alternate route for cycles', () => {
  let m = setup();
  const [a, b, c] = m.objects;
  m = connect(connect(connect(m, a.id, b.id), b.id, c.id), a.id, c.id);
  assert.throws(() => editEdge(m, m.relationships[2].id, true), /circular/);
});
test('seed capacity promotion, transfer, and conversion preserve content', () => {
  let m = setup();
  const box = makeObject('SEED_BOX', { x: 0, y: 0 });
  m.objects.push(box);
  for (let i = 0; i < 30; i++) m = addSeed(m, box.id, `seed ${i}`);
  const b = m.objects.find((o) => o.id === box.id);
  assert.equal(b.tier, 30);
  assert.throws(() => addSeed(m, box.id, '31'), /Maximum/);
  const r = moveSeed(m, box.id, b.seeds[0].id, { x: 0, y: 300 });
  assert.equal(r.map.objects.find((o) => o.id === r.id).text, 'seed 0');
  assert.equal(r.map.objects.find((o) => o.id === box.id).seeds.length, 29);
});
test('type restrictions and reference direction', () => {
  let m = setup();
  const im = makeObject('IMAGINATION', { x: 0, y: 0 }),
    box = makeObject('SEED_BOX', { x: 0, y: 0 });
  m.objects.push(im, box);
  assert.throws(() => connect(m, box.id, im.id));
  m = connect(m, m.objects[0].id, im.id);
  assert.equal(m.relationships[0].sourceId, im.id);
  assert.equal(m.relationships[0].type, 'REFERENCE');
});
