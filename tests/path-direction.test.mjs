import assert from 'node:assert/strict';
import test from 'node:test';
import {
  branch,
  connect,
  deleteObjects,
  downstream,
  makeObject,
  moveSeed,
  pathDirection,
  reparent,
  syncTitleFromGoal,
  validateMap,
} from '../lib/graph.ts';
import { applyGraphDrop, graphHierarchy, sameMap } from '../lib/auto-layout.ts';

/** A central goal with one node hanging off it, arrows as `direction` says. */
function setup(direction) {
  const goal = makeObject('NODE', { x: 0, y: 0 }, 'GOAL', 'Goal');
  const node = makeObject('NODE', { x: 400, y: 0 }, 'NORMAL', 'Node');
  const loose = makeObject('NODE', { x: 400, y: 300 }, 'NORMAL', 'Loose');
  let map = {
    version: 1,
    title: 'Direction',
    anchorId: goal.id,
    objects: [goal, node, loose],
    relationships: [],
    ...(direction ? { pathDirection: direction } : {}),
  };
  map =
    direction === 'inward'
      ? connect(map, node.id, goal.id, 'PATH')
      : connect(map, goal.id, node.id, 'PATH');
  return { map, goal, node, loose };
}
const last = (map) => map.relationships.at(-1);
const points = (edge, from, to) =>
  edge.sourceId === from && edge.targetId === to;

test('a map without the option points its arrows away from the goal', () => {
  const { map, goal } = setup();
  assert.equal(pathDirection(map), 'outward');
  const r = branch(map, goal.id);
  assert.ok(points(last(r.map), goal.id, r.object.id));
});

test('with the option set to inward, new branches point toward their parent', () => {
  const { map, goal, node } = setup('inward');
  const fromGoal = branch(map, goal.id);
  assert.ok(points(last(fromGoal.map), fromGoal.object.id, goal.id));
  const fromNode = branch(map, node.id);
  assert.ok(points(last(fromNode.map), fromNode.object.id, node.id));
  // The child end carries the attachment, and the map still loads.
  const child = fromNode.map.objects.find((o) => o.id === fromNode.object.id);
  assert.equal(child.attachment, last(fromNode.map).id);
  validateMap(fromNode.map);
});

test('switching the option leaves the paths already drawn alone', () => {
  const { map, goal, node } = setup();
  const switched = { ...map, pathDirection: 'inward' };
  assert.ok(points(switched.relationships[0], goal.id, node.id));
  const r = branch(switched, node.id);
  assert.ok(points(last(r.map), r.object.id, node.id));
  assert.ok(points(r.map.relationships[0], goal.id, node.id));
  assert.ok(!sameMap(map, switched));
});

test('a Seed Box or Imagination branch keeps its own arrowless connection', () => {
  const { map, node } = setup('inward');
  const box = branch(map, node.id, 'SEED_BOX');
  assert.equal(last(box.map).type, 'RELATED');
  const mood = branch(map, node.id, 'IMAGINATION');
  assert.equal(last(mood.map).type, 'REFERENCE');
});

test('a path drawn by hand keeps the direction it was drawn in', () => {
  for (const direction of ['outward', 'inward']) {
    const { map, node, loose } = setup(direction);
    assert.ok(points(last(connect(map, loose.id, node.id)), loose.id, node.id));
    assert.ok(points(last(connect(map, node.id, loose.id)), node.id, loose.id));
  }
});

test('turning a seed into a node, reparenting and graph drops follow the option', () => {
  const { map, goal, node, loose } = setup('inward');
  const box = makeObject('SEED_BOX', { x: 0, y: 400 });
  box.seeds = [{ id: 's1', text: 'Idea', visualSeed: 0.5 }];
  const seeded = moveSeed({ ...map, objects: [...map.objects, box] }, box.id, 's1', { x: 800, y: 0 }, node.id);
  assert.ok(points(last(seeded.map), seeded.id, node.id));

  const moved = reparent(map, loose.id, node.id);
  assert.ok(points(last(moved), loose.id, node.id));

  const dropped = applyGraphDrop(map, loose.id, { kind: 'child', parentId: goal.id }, graphHierarchy(map));
  assert.ok(points(last(dropped.map), loose.id, goal.id));
});

test('downstream follows the arrows the way the map draws them', () => {
  const { map, goal, node } = setup('inward');
  const r = branch(map, node.id);
  const below = downstream(r.map, node.id);
  assert.ok(below.has(r.object.id));
  assert.ok(!below.has(goal.id));
});

test('deleting a node in an inward map bridges its child to its parent inward', () => {
  const { map, goal, node } = setup('inward');
  const r = branch(map, node.id);
  const after = deleteObjects(r.map, new Set([node.id]));
  assert.equal(after.relationships.length, 1);
  assert.ok(points(after.relationships[0], r.object.id, goal.id));
  validateMap(after);
});

test('the option only accepts its two directions', () => {
  const { map } = setup();
  assert.ok(validateMap({ ...map, pathDirection: 'inward' }));
  assert.throws(() => validateMap({ ...map, pathDirection: 'sideways' }));
});

test('an unnamed map takes the name its central goal is first given', () => {
  const goal = makeObject('NODE', { x: 0, y: 0 }, 'NORMAL', '');
  const before = {
    version: 1,
    title: 'Untitled vision',
    anchorId: goal.id,
    objects: [goal],
    relationships: [],
  };
  const named = {
    ...before,
    objects: [{ ...goal, text: '  Build a studio ' }],
  };
  assert.equal(syncTitleFromGoal(before, named).title, 'Build a studio');
  // The very first node, typed as it is placed, counts too.
  const empty = { ...before, anchorId: '', objects: [] };
  assert.equal(syncTitleFromGoal(empty, named).title, 'Build a studio');
});

test('a map keeps its name once it has one', () => {
  const goal = makeObject('NODE', { x: 0, y: 0 }, 'NORMAL', '');
  const base = {
    version: 1,
    title: 'Untitled vision',
    anchorId: goal.id,
    objects: [goal],
    relationships: [],
  };
  const typed = (map, text) => ({
    ...map,
    objects: [{ ...goal, text }],
  });
  // Named by hand before the goal had text.
  const renamed = { ...base, title: 'My plan' };
  assert.equal(syncTitleFromGoal(renamed, typed(renamed, 'Goal')).title, 'My plan');
  // Already synced once: renaming the goal later does not rename the map.
  const synced = { ...typed(base, 'First'), title: 'First' };
  assert.equal(syncTitleFromGoal(synced, typed(synced, 'Second')).title, 'First');
  // Editing a goal that already had text is not a first naming.
  const withText = typed(base, 'Old');
  assert.equal(syncTitleFromGoal(withText, typed(withText, 'New')).title, 'Untitled vision');
  // Only the central goal names the map, and only a node does.
  const other = makeObject('NODE', { x: 300, y: 0 }, 'NORMAL', '');
  const two = { ...base, objects: [goal, other] };
  const otherNamed = { ...two, objects: [goal, { ...other, text: 'Side' }] };
  assert.equal(syncTitleFromGoal(two, otherNamed).title, 'Untitled vision');
});
