import assert from 'node:assert/strict';
import test from 'node:test';
import { pointerSelectionPlan } from '../lib/graph.ts';

const object = (id, type = 'NODE') => ({
  id,
  type,
  role: 'NORMAL',
  text: id,
  note: '',
  x: 0,
  y: 0,
  width: 200,
  height: 90,
  images: [],
  seeds: [],
  tier: 10,
  shuffle: 0,
  focal: 50,
  createdAt: 0,
  updatedAt: 0,
});

const map = {
  version: 1,
  title: 'Selection',
  anchorId: 'a',
  objects: [
    object('a'),
    object('b'),
    object('c'),
    object('related'),
    object('reference', 'IMAGINATION'),
    object('seed-box', 'SEED_BOX'),
  ],
  relationships: [
    { id: 'ab', sourceId: 'a', targetId: 'b', type: 'PATH' },
    { id: 'bc', sourceId: 'b', targetId: 'c', type: 'PATH' },
    { id: 'ar', sourceId: 'a', targetId: 'related', type: 'RELATED' },
    {
      id: 'ai',
      sourceId: 'a',
      targetId: 'reference',
      type: 'REFERENCE',
    },
  ],
};

test('normal node drag selects and moves only the clicked node', () => {
  const plan = pointerSelectionPlan(map, new Set(), false, 'a', false);
  assert.deepEqual([...plan.clickedSelection], ['a']);
  assert.deepEqual([...plan.visibleSelection], ['a']);
  assert.deepEqual([...plan.movementIds], ['a']);
  assert.equal(plan.explicit, false);
  assert.equal(plan.startDrag, true);
});

test('shift drag moves the downstream PATH branch', () => {
  const plan = pointerSelectionPlan(map, new Set(), false, 'a', false, true);
  assert.deepEqual([...plan.movementIds], ['a', 'b', 'c']);
});

test('single-clicking non-node objects selects and moves exactly one object', () => {
  for (const id of ['reference', 'seed-box']) {
    const plan = pointerSelectionPlan(map, new Set(), false, id, false);
    assert.deepEqual([...plan.visibleSelection], [id]);
    assert.deepEqual([...plan.movementIds], [id]);
  }
});

test('explicit selection suppresses implicit downstream expansion', () => {
  const selected = new Set(['a', 'related']);
  const plan = pointerSelectionPlan(map, selected, true, 'a', false);
  assert.deepEqual([...plan.visibleSelection], ['a', 'related']);
  assert.deepEqual([...plan.movementIds], ['a', 'related']);
  assert.equal(plan.explicit, true);
});

test('ctrl-click toggles a copy and does not start a drag', () => {
  const selected = new Set(['a']);
  const plan = pointerSelectionPlan(map, selected, true, 'b', true);
  assert.deepEqual([...selected], ['a']);
  assert.deepEqual([...plan.visibleSelection], ['a', 'b']);
  assert.deepEqual([...plan.movementIds], []);
  assert.equal(plan.startDrag, false);
});

test('selection callback set is isolated from the movement set', () => {
  const plan = pointerSelectionPlan(map, new Set(), false, 'a', false);
  const received = plan.visibleSelection;
  plan.movementIds.delete('b');
  plan.movementIds.add('related');
  assert.deepEqual([...received], ['a']);
});
