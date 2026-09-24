import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  branch,
  carriesPath,
  connect,
  convertObject,
  makeObject,
  objectHeight,
  relationError,
  validateMap,
} from '../lib/graph.ts';
import { autoLayout, graphDropIntent, graphHierarchy } from '../lib/auto-layout.ts';

function workspace() {
  const goal = makeObject('NODE', { x: 0, y: 0 }, 'GOAL', 'Goal');
  const node = makeObject('NODE', { x: 400, y: 0 }, 'NORMAL', 'Node');
  const linked = makeObject(
    'GRAPH',
    { x: 800, y: 0 },
    'NORMAL',
    'Another vision',
    'map-2',
  );
  let map = {
    version: 1,
    title: 'Graph nodes',
    anchorId: goal.id,
    objects: [goal, node, linked],
    relationships: [],
  };
  map = connect(map, goal.id, node.id);
  map = connect(map, node.id, linked.id);
  return { map, goal, node, linked };
}
const find = (map, id) => map.objects.find((o) => o.id === id);

test('a Graph object stands on a path like the node it represents', () => {
  const { map, linked, node } = workspace();
  assert.equal(carriesPath(find(map, linked.id)), true);
  const edge = map.relationships.at(-1);
  assert.equal(edge.type, 'PATH');
  assert.equal(
    relationError(map, node.id, linked.id, 'PATH', edge.id),
    null,
  );
  validateMap(map);
});

test('a Graph object keeps the link it was made with', () => {
  const { map, linked } = workspace();
  assert.equal(find(map, linked.id).mapRef, 'map-2');
  assert.equal(find(map, linked.id).width, 280);
  // Drawn at goal weight, plus the row naming what opening it does.
  assert.ok(objectHeight(find(map, linked.id)) > 100);
});

test('a Graph object without a link does not describe anything', () => {
  const { map, linked } = workspace();
  const orphan = {
    ...map,
    objects: map.objects.map((o) =>
      o.id === linked.id ? { ...o, mapRef: undefined } : o,
    ),
  };
  assert.throws(() => validateMap(orphan), /object content rules/);
  // And no other kind may carry one.
  const stray = {
    ...map,
    objects: map.objects.map((o) =>
      o.type === 'NODE' && o.role === 'NORMAL' ? { ...o, mapRef: 'map-9' } : o,
    ),
  };
  assert.throws(() => validateMap(stray), /object content rules/);
});

test('a Graph object holds no image', () => {
  const { map, linked } = workspace();
  assert.throws(
    () =>
      validateMap({
        ...map,
        objects: map.objects.map((o) =>
          o.id === linked.id ? { ...o, images: ['a'] } : o,
        ),
      }),
    /object content rules/,
  );
});

test('the add handle can branch into a linked graph', () => {
  const { map, node } = workspace();
  const r = branch(map, node.id, 'GRAPH', 'NORMAL', {
    mapRef: 'map-3',
    title: 'A third vision',
  });
  assert.equal(r.object.type, 'GRAPH');
  assert.equal(r.object.mapRef, 'map-3');
  assert.equal(r.object.text, 'A third vision');
  assert.equal(r.map.relationships.at(-1).type, 'PATH');
  validateMap(r.map);
});

test('a Graph object can carry a branch of its own', () => {
  const { map, linked } = workspace();
  const r = branch(map, linked.id);
  assert.equal(r.map.relationships.at(-1).type, 'PATH');
  validateMap(r.map);
});

test('converting into a Graph object needs the graph it opens', () => {
  const { map, node } = workspace();
  assert.throws(
    () => convertObject(map, node.id, 'GRAPH'),
    /Choose the graph/,
  );
  const next = convertObject(map, node.id, 'GRAPH', 'NORMAL', 'map-4');
  assert.equal(find(next, node.id).mapRef, 'map-4');
  // It was already on paths, and it still is.
  assert.deepEqual(
    next.relationships.map((e) => e.type),
    ['PATH', 'PATH'],
  );
  validateMap(next);
});

test('converting a Graph object away drops the link', () => {
  const { map, linked } = workspace();
  const next = convertObject(map, linked.id, 'NODE');
  assert.equal(find(next, linked.id).mapRef, undefined);
  assert.equal(find(next, linked.id).type, 'NODE');
  validateMap(next);
  // Turning it into a leaf kind retypes the path it used to sit on.
  const box = convertObject(map, linked.id, 'SEED_BOX');
  assert.equal(find(box, linked.id).mapRef, undefined);
  assert.deepEqual(
    box.relationships.map((e) => e.type),
    ['PATH', 'RELATED'],
  );
  validateMap(box);
});

test('a Graph object ranks in the layout like a node', () => {
  const { map, linked, node } = workspace();
  const sorted = autoLayout(map);
  const hierarchy = graphHierarchy(sorted);
  assert.equal(hierarchy.parentOf.get(linked.id), node.id);
  // It is a column further out than its parent, not parked below the tree.
  assert.ok(find(sorted, linked.id).x > find(sorted, node.id).x);
});

test('a Graph object is a drop target and can be dropped', () => {
  const { map, linked, goal } = workspace();
  const sorted = autoLayout(map);
  const card = find(sorted, linked.id);
  assert.deepEqual(
    graphDropIntent(sorted, goal.id, {
      x: card.x + card.width / 2,
      y: card.y + objectHeight(card) / 2,
    }),
    undefined,
    'the anchor is above it, so dropping there would fold the tree',
  );
  const target = find(sorted, goal.id);
  assert.deepEqual(
    graphDropIntent(sorted, linked.id, {
      x: target.x + target.width / 2,
      y: target.y + objectHeight(target) / 2,
    }),
    { kind: 'child', parentId: goal.id },
  );
});
