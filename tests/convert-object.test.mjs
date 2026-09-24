import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  branch,
  connect,
  convertObject,
  makeObject,
  uid,
  validateMap,
} from '../lib/graph.ts';

/** Goal ← node ← leaf, with a Seed Box and an Imagination hanging off `node`. */
function workspace() {
  const goal = makeObject('NODE', { x: 0, y: 0 }, 'GOAL', 'Goal');
  const node = makeObject('NODE', { x: 400, y: 0 }, 'NORMAL', 'Node');
  const leaf = makeObject('NODE', { x: 800, y: 0 }, 'NORMAL', 'Leaf');
  const box = makeObject('SEED_BOX', { x: 400, y: 300 }, 'NORMAL', 'Seeds');
  const mood = makeObject('IMAGINATION', { x: 800, y: 300 }, 'NORMAL', 'Mood');
  box.seeds = [{ id: uid(), text: 'A loose idea', visualSeed: 0.5 }];
  node.images = ['asset-1'];
  let map = {
    version: 1,
    title: 'Convert',
    anchorId: goal.id,
    objects: [goal, node, leaf, box, mood],
    relationships: [],
  };
  map = connect(map, goal.id, node.id);
  map = connect(map, node.id, leaf.id);
  map = connect(map, box.id, node.id);
  map = connect(map, mood.id, leaf.id);
  return { map, goal, node, leaf, box, mood };
}
const find = (map, id) => map.objects.find((o) => o.id === id);
const edgesOf = (map, id) =>
  map.relationships.filter((e) => e.sourceId === id || e.targetId === id);

test('a node becomes a goal and keeps every connection', () => {
  const { map, node } = workspace();
  const next = convertObject(map, node.id, 'NODE', 'GOAL');
  assert.equal(find(next, node.id).role, 'GOAL');
  assert.equal(find(next, node.id).width, 280);
  assert.equal(next.relationships.length, map.relationships.length);
  validateMap(next);
});

test('a node becomes a Seed Box and its paths become relations', () => {
  const { map, node, goal, leaf } = workspace();
  const next = convertObject(map, node.id, 'SEED_BOX');
  const converted = find(next, node.id);
  assert.equal(converted.type, 'SEED_BOX');
  assert.equal(converted.role, 'NORMAL');
  // A Seed Box holds no image, and nothing else may still call it a path.
  assert.deepEqual(converted.images, []);
  assert.deepEqual(
    edgesOf(next, node.id).map((e) => e.type),
    ['RELATED', 'RELATED', 'RELATED'],
  );
  // The connections themselves survive: only what they mean changed.
  assert.equal(next.relationships.length, map.relationships.length);
  assert.equal(find(next, goal.id).attachment, undefined);
  assert.equal(find(next, leaf.id).attachment, undefined);
  validateMap(next);
});

test('a node becomes an Imagination and unreachable relations are dropped', () => {
  const { map, node, box } = workspace();
  const next = convertObject(map, node.id, 'IMAGINATION');
  assert.equal(find(next, node.id).type, 'IMAGINATION');
  // Node connections become references; a Seed Box cannot reference anything.
  assert.deepEqual(
    edgesOf(next, node.id).map((e) => e.type),
    ['REFERENCE', 'REFERENCE'],
  );
  assert.equal(
    next.relationships.some(
      (e) => e.sourceId === box.id || e.targetId === box.id,
    ),
    false,
  );
  // A reference is authored from the Imagination outward.
  for (const edge of edgesOf(next, node.id))
    assert.equal(edge.sourceId, node.id);
  validateMap(next);
});

test('a Seed Box becomes a node and gives up its seeds', () => {
  const { map, box, node } = workspace();
  assert.equal(find(map, box.id).seeds.length, 1);
  const next = convertObject(map, box.id, 'NODE');
  const converted = find(next, box.id);
  assert.equal(converted.type, 'NODE');
  assert.deepEqual(converted.seeds, []);
  assert.equal(converted.width, 210);
  // Two nodes are connected by a path now, and the branch the node already
  // hung from is left pointing where it was.
  const edge = edgesOf(next, box.id)[0];
  assert.equal(edge.type, 'PATH');
  assert.equal(find(next, node.id).attachment, find(map, node.id).attachment);
  validateMap(next);
});

test('an Imagination becomes a node and keeps one image', () => {
  const { map, mood } = workspace();
  const withImages = {
    ...map,
    objects: map.objects.map((o) =>
      o.id === mood.id ? { ...o, images: ['a', 'b', 'c'] } : o,
    ),
  };
  const next = convertObject(withImages, mood.id, 'NODE');
  assert.deepEqual(find(next, mood.id).images, ['a']);
  assert.equal(find(next, mood.id).type, 'NODE');
  assert.deepEqual(
    edgesOf(next, mood.id).map((e) => e.type),
    ['PATH'],
  );
  validateMap(next);
});

test('converting to the kind it already is changes nothing', () => {
  const { map, node, box } = workspace();
  assert.equal(convertObject(map, node.id, 'NODE', 'NORMAL'), map);
  assert.equal(convertObject(map, box.id, 'SEED_BOX'), map);
  // Role is part of the identity of a node.
  assert.notEqual(convertObject(map, node.id, 'NODE', 'GOAL'), map);
});

test('converting a missing object is reported, not silently ignored', () => {
  const { map } = workspace();
  assert.throws(
    () => convertObject(map, 'gone', 'NODE'),
    /no longer exists/,
  );
});

test('a round trip through another kind leaves a loadable map', () => {
  const { map, node } = workspace();
  const next = convertObject(
    convertObject(convertObject(map, node.id, 'IMAGINATION'), node.id, 'SEED_BOX'),
    node.id,
    'NODE',
  );
  assert.equal(find(next, node.id).type, 'NODE');
  validateMap(next);
});

test('the add handle can branch into any kind', () => {
  const { map, node } = workspace();
  for (const [type, relation] of [
    ['NODE', 'PATH'],
    ['SEED_BOX', 'RELATED'],
    ['IMAGINATION', 'REFERENCE'],
  ]) {
    const r = branch(map, node.id, type);
    assert.equal(r.object.type, type);
    const edge = r.map.relationships.at(-1);
    assert.equal(edge.type, relation);
    assert.ok([edge.sourceId, edge.targetId].includes(r.object.id));
    validateMap(r.map);
  }
  assert.equal(branch(map, node.id, 'NODE', 'GOAL').object.role, 'GOAL');
  assert.equal(branch(map, node.id, 'SEED_BOX').object.text, 'Loose ideas');
});
