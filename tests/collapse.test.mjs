import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoLayout,
  graphDropIntent,
  graphHierarchy,
  hiddenObjects,
  sameMap,
  visibleMap,
} from '../lib/auto-layout.ts';
import { objectHeight, validateMap } from '../lib/graph.ts';

const object = (id, x, y, role = 'NORMAL', type = 'NODE') => ({
  id,
  type,
  role,
  text: id,
  note: '',
  x,
  y,
  width: type !== 'NODE' ? 310 : role === 'GOAL' ? 280 : 210,
  height: 90,
  images: [],
  seeds: [],
  tier: 10,
  shuffle: 0,
  focal: 50,
  createdAt: 1,
  updatedAt: 1,
});
const path = (id, sourceId, targetId, type = 'PATH') => ({
  id,
  sourceId,
  targetId,
  type,
});
const at = (map, id) => map.objects.find((o) => o.id === id);
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const fold = (map, id) => ({
  ...map,
  objects: map.objects.map((o) =>
    o.id === id ? { ...o, collapsed: true } : o,
  ),
});

/** root → branch → {child, grandchild-bearing deep} plus a second branch. */
function tree() {
  return {
    version: 1,
    title: 'Folding',
    anchorId: 'root',
    objects: [
      object('root', 0, 0, 'GOAL'),
      object('branch', 600, -200),
      object('child', 1200, -300),
      object('deep', 1200, -100),
      object('deeper', 1800, -100),
      object('box', 1200, 100, 'NORMAL', 'SEED_BOX'),
      object('other', 600, 300),
    ],
    relationships: [
      path('e1', 'root', 'branch'),
      path('e2', 'branch', 'child'),
      path('e3', 'branch', 'deep'),
      path('e4', 'deep', 'deeper'),
      path('e5', 'box', 'branch', 'RELATED'),
      path('e6', 'root', 'other'),
    ],
  };
}

test('folding a branch hides everything under it, at any depth', () => {
  const folded = fold(autoLayout(tree()), 'branch');
  assert.deepEqual(
    [...hiddenObjects(folded)].toSorted(byId),
    ['box', 'child', 'deep', 'deeper'],
  );
  // The node that was folded stays, and so does everything outside it.
  const visible = visibleMap(folded);
  assert.deepEqual(
    visible.objects.map((o) => o.id).toSorted(byId),
    ['branch', 'other', 'root'],
  );
});

test('a connection into a folded branch is not drawn', () => {
  const visible = visibleMap(fold(autoLayout(tree()), 'branch'));
  assert.deepEqual(
    visible.relationships.map((e) => e.id).toSorted(byId),
    ['e1', 'e6'],
  );
});

test('an unfolded map hides nothing and is left alone', () => {
  const sorted = autoLayout(tree());
  assert.equal(hiddenObjects(sorted).size, 0);
  assert.equal(visibleMap(sorted), sorted);
});

test('a folded branch gives up the room it was taking', () => {
  const sorted = autoLayout(tree());
  const spread = (map) => {
    const shown = visibleMap(map).objects;
    const top = Math.min(...shown.map((o) => o.y));
    const bottom = Math.max(...shown.map((o) => o.y + objectHeight(o)));
    return bottom - top;
  };
  const folded = autoLayout(fold(sorted, 'branch'));
  assert.ok(spread(folded) < spread(sorted));
  // The folded cards keep the position they had, ready for the way back.
  assert.deepEqual(
    { x: at(folded, 'deeper').x, y: at(folded, 'deeper').y },
    { x: at(sorted, 'deeper').x, y: at(sorted, 'deeper').y },
  );
});

test('unfolding puts the branch back where the re-flow wants it', () => {
  const sorted = autoLayout(tree());
  const folded = autoLayout(fold(sorted, 'branch'));
  const back = autoLayout({
    ...folded,
    objects: folded.objects.map((o) =>
      o.id === 'branch' ? { ...o, collapsed: undefined } : o,
    ),
  });
  for (const id of ['branch', 'child', 'deep', 'deeper', 'box', 'other'])
    assert.deepEqual(
      { x: at(back, id).x, y: at(back, id).y },
      { x: at(sorted, id).x, y: at(sorted, id).y },
      `${id} did not return to its rank`,
    );
});

test('folding two branches at once hides both', () => {
  const sorted = autoLayout(tree());
  const both = fold(fold(sorted, 'branch'), 'deep');
  // `deep` is already inside the folded branch, so it changes nothing.
  assert.deepEqual(
    [...hiddenObjects(both)].toSorted(byId),
    ['box', 'child', 'deep', 'deeper'],
  );
});

test('a card folded out of sight cannot be dropped onto', () => {
  const sorted = autoLayout(tree());
  const folded = autoLayout(fold(sorted, 'branch'));
  const hiddenCard = at(folded, 'child');
  assert.equal(
    graphDropIntent(folded, 'other', {
      x: hiddenCard.x + hiddenCard.width / 2,
      y: hiddenCard.y + objectHeight(hiddenCard) / 2,
    }),
    undefined,
  );
  // The card that is still shown remains a target.
  const shown = at(folded, 'branch');
  assert.deepEqual(
    graphDropIntent(folded, 'other', {
      x: shown.x + shown.width / 2,
      y: shown.y + objectHeight(shown) / 2,
    }),
    { kind: 'child', parentId: 'branch' },
  );
});

test('the branch structure survives folding', () => {
  const folded = autoLayout(fold(autoLayout(tree()), 'branch'));
  const hierarchy = graphHierarchy(folded);
  assert.equal(hierarchy.parentOf.get('deeper'), 'deep');
  assert.equal(hierarchy.parentOf.get('branch'), 'root');
  assert.deepEqual([...hierarchy.childrenOf.get('branch')].toSorted(byId), [
    'box',
    'child',
    'deep',
  ]);
  validateMap(folded);
});

test('folding is a change, and folding twice is not', () => {
  const sorted = autoLayout(tree());
  const folded = autoLayout(fold(sorted, 'branch'));
  assert.equal(sameMap(sorted, folded), false);
  assert.equal(sameMap(folded, autoLayout(folded)), true);
});

test('a map that folds every branch still loads', () => {
  let map = autoLayout(tree());
  for (const id of ['branch', 'deep', 'other']) map = fold(map, id);
  const folded = autoLayout(map);
  validateMap(folded);
  assert.deepEqual(
    visibleMap(folded).objects.map((o) => o.id).toSorted(byId),
    ['branch', 'other', 'root'],
  );
});
