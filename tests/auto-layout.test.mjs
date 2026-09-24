import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoLayout,
  columnGap,
  branchGap,
  siblingGap,
  graphSnapPlan,
  graphDropIntent,
  graphDropOrder,
  graphHierarchy,
  applyGraphDrop,
  graphParentEdge,
  siblingBand,
  sideImbalanceLimit,
  sameMap,
} from '../lib/auto-layout.ts';
import { edgePath, objectHeight } from '../lib/graph.ts';

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
const map = (objects, relationships, anchorId = 'root') => ({
  version: 1,
  title: 'Auto layout',
  anchorId,
  objects,
  relationships,
});
const at = (result, id) => result.objects.find((o) => o.id === id);
const centerY = (o) => o.y + objectHeight(o) / 2;

/** Anchor with two branches left, two right, and grandchildren on one of them. */
function spread() {
  return map(
    [
      object('root', 0, 0, 'GOAL'),
      object('left-a', -600, -200),
      object('left-b', -600, 200),
      object('right-a', 600, -200),
      object('right-b', 600, 200),
      object('right-a1', 1200, -300),
      object('right-a2', 1200, -100),
    ],
    [
      path('e1', 'root', 'left-a'),
      path('e2', 'root', 'left-b'),
      path('e3', 'root', 'right-a'),
      path('e4', 'root', 'right-b'),
      path('e5', 'right-a', 'right-a1'),
      path('e6', 'right-a', 'right-a2'),
    ],
  );
}

test('the anchor keeps the position it already had', () => {
  const before = spread();
  const after = autoLayout(before);
  assert.deepEqual(
    { x: at(after, 'root').x, y: at(after, 'root').y },
    { x: 0, y: 0 },
  );
});

test('same-depth objects on a side share one column', () => {
  const after = autoLayout(spread());
  assert.equal(at(after, 'left-a').x, at(after, 'left-b').x);
  assert.equal(at(after, 'right-a').x, at(after, 'right-b').x);
  assert.equal(at(after, 'right-a1').x, at(after, 'right-a2').x);
});

test('branches stay on the side of the anchor they were drawn on', () => {
  const after = autoLayout(spread());
  const root = at(after, 'root');
  for (const id of ['left-a', 'left-b'])
    assert.ok(at(after, id).x + at(after, id).width <= root.x);
  for (const id of ['right-a', 'right-b', 'right-a1'])
    assert.ok(at(after, id).x >= root.x + root.width);
});

test('columns are spaced by one uniform gap on both sides', () => {
  const after = autoLayout(spread());
  const root = at(after, 'root');
  const rightFirst = at(after, 'right-a');
  const rightSecond = at(after, 'right-a1');
  const leftFirst = at(after, 'left-a');
  assert.equal(rightFirst.x - (root.x + root.width), columnGap);
  assert.equal(rightSecond.x - (rightFirst.x + rightFirst.width), columnGap);
  assert.equal(root.x - (leftFirst.x + leftFirst.width), columnGap);
});

test('a parent is centred on the children it fans out to', () => {
  const after = autoLayout(spread());
  assert.equal(
    centerY(at(after, 'right-a')),
    (centerY(at(after, 'right-a1')) + centerY(at(after, 'right-a2'))) / 2,
  );
});

test('a branch with children is given more room than two leaves', () => {
  const after = autoLayout(spread());
  const leafGap =
    at(after, 'right-a2').y -
    (at(after, 'right-a1').y + objectHeight(at(after, 'right-a1')));
  const branchedGap =
    at(after, 'right-b').y -
    (at(after, 'right-a').y + objectHeight(at(after, 'right-a')));
  assert.equal(leafGap, siblingGap);
  assert.ok(branchedGap >= branchGap);
  assert.ok(branchedGap > leafGap);
});

test('nothing overlaps once the map is sorted', () => {
  const after = autoLayout(spread());
  for (const a of after.objects)
    for (const b of after.objects) {
      if (a.id >= b.id) continue;
      const apart =
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + objectHeight(a) <= b.y ||
        b.y + objectHeight(b) <= a.y;
      assert.ok(apart, `${a.id} overlaps ${b.id}`);
    }
});

test('sorting an already sorted map returns the same map', () => {
  const once = autoLayout(spread());
  assert.equal(autoLayout(once), once);
});

test('dragging a card above a sibling reorders the branch', () => {
  const before = autoLayout(spread());
  const dragged = at(before, 'right-a2');
  const sibling = at(before, 'right-a1');
  const moved = {
    ...before,
    objects: before.objects.map((o) =>
      o.id === 'right-a2' ? { ...o, y: sibling.y - 40 } : o,
    ),
  };
  const after = autoLayout(moved);
  assert.ok(at(after, 'right-a2').y < at(after, 'right-a1').y);
  assert.equal(at(after, 'right-a2').x, dragged.x);
});

/** Anchor with `leftCount` branches on its left and `rightCount` on its right. */
function lopsided(leftCount, rightCount) {
  const objects = [object('root', 0, 0, 'GOAL')];
  const relationships = [];
  for (let i = 0; i < leftCount; i++) {
    objects.push(object(`l${i}`, -600, i * 300));
    relationships.push(path(`el${i}`, 'root', `l${i}`));
  }
  for (let i = 0; i < rightCount; i++) {
    objects.push(object(`r${i}`, 600, i * 300));
    relationships.push(path(`er${i}`, 'root', `r${i}`));
  }
  return map(objects, relationships);
}
const onLeft = (after, ids) =>
  ids.filter((id) => at(after, id).x < at(after, 'root').x);

test('two branches may both sit on the same side', () => {
  const after = autoLayout(lopsided(0, 2));
  assert.deepEqual(onLeft(after, ['r0', 'r1']), []);
});

test('a side may lead the other by up to the imbalance limit', () => {
  assert.equal(sideImbalanceLimit, 3);
  const after = autoLayout(lopsided(1, 4));
  assert.deepEqual(onLeft(after, ['l0', 'r0', 'r1', 'r2', 'r3']), ['l0']);
});

test('past the limit the newest branch crosses to the lighter side', () => {
  const after = autoLayout(lopsided(1, 5));
  assert.deepEqual(onLeft(after, ['l0', 'r0', 'r1', 'r2', 'r3', 'r4']), [
    'l0',
    'r4',
  ]);
  // Re-flowing the settled map changes nothing.
  assert.deepEqual(autoLayout(after), after);
});

test('a map stacked far to one side crosses just enough branches over', () => {
  const after = autoLayout(lopsided(0, 8));
  const ids = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'];
  assert.deepEqual(onLeft(after, ids), ['r5', 'r6', 'r7']);
});

test('connections are read in either direction', () => {
  const reversed = map(
    [object('root', 0, 0, 'GOAL'), object('child', 600, 0)],
    [path('e1', 'child', 'root')],
  );
  const after = autoLayout(reversed);
  assert.equal(at(after, 'child').x, 280 + columnGap);
});

test('a Seed Box hangs off its node without adopting it', () => {
  const withSeeds = map(
    [
      object('root', 0, 0, 'GOAL'),
      object('child', 600, 0),
      object('box', 1200, 0, 'NORMAL', 'SEED_BOX'),
      object('grandchild', 1800, 0),
    ],
    [
      path('e1', 'root', 'child'),
      path('e2', 'box', 'child', 'RELATED'),
      path('e3', 'child', 'grandchild'),
    ],
  );
  const after = autoLayout(withSeeds);
  // Both hang off `child`, so they share the next column and neither ranks
  // the other deeper.
  assert.equal(at(after, 'box').x, at(after, 'grandchild').x);
});

test('a detached component stacks below the anchored one', () => {
  const split = map(
    [
      object('root', 0, 0, 'GOAL'),
      object('child', 600, 0),
      object('loose-a', 40, 60),
      object('loose-b', 300, 60),
    ],
    [path('e1', 'root', 'child'), path('e2', 'loose-a', 'loose-b')],
  );
  const after = autoLayout(split);
  const anchored = Math.max(
    ...['root', 'child'].map((id) => at(after, id).y + objectHeight(at(after, id))),
  );
  for (const id of ['loose-a', 'loose-b'])
    assert.ok(at(after, id).y > anchored);
});

test('the snap plan reports where the dragged card lands', () => {
  const before = autoLayout(spread());
  const moved = {
    ...before,
    objects: before.objects.map((o) =>
      o.id === 'right-a2' ? { ...o, x: o.x + 37, y: o.y - 140 } : o,
    ),
  };
  const [ghost] = graphSnapPlan(moved, new Set(['right-a2'])).frames;
  const settled = at(autoLayout(moved), 'right-a2');
  assert.deepEqual(
    { x: ghost.x, y: ghost.y },
    { x: settled.x, y: settled.y },
  );
});

test('the snap plan draws only the connections the drag touches', () => {
  const moved = autoLayout(spread());
  const plan = graphSnapPlan(moved, new Set(['right-a2']));
  assert.deepEqual(
    plan.edges.map((edge) => edge.id),
    ['e6'],
  );
  assert.ok(plan.edges[0].path.startsWith('M'));
});

test('a predicted connection is drawn at the settled slot, not the drop', () => {
  const sorted = autoLayout(spread());
  const dropped = {
    ...sorted,
    objects: sorted.objects.map((o) =>
      o.id === 'right-a2' ? { ...o, x: o.x + 260, y: o.y + 180 } : o,
    ),
  };
  const plan = graphSnapPlan(dropped, new Set(['right-a2']));
  const settled = autoLayout(dropped);
  const parent = at(settled, 'right-a');
  const child = at(settled, 'right-a2');
  assert.equal(plan.edges[0].path, edgePath(parent, child));
  // The card is still under the pointer, so the drawn path is not its own.
  assert.notEqual(
    plan.edges[0].path,
    edgePath(at(dropped, 'right-a'), at(dropped, 'right-a2')),
  );
});

test('a multi-card drag reports one frame per card', () => {
  const sorted = autoLayout(spread());
  const moving = new Set(['right-a1', 'right-a2']);
  const plan = graphSnapPlan(sorted, moving);
  assert.deepEqual(new Set(plan.frames.map((frame) => frame.id)), moving);
  assert.deepEqual(
    new Set(plan.edges.map((edge) => edge.id)),
    new Set(['e5', 'e6']),
  );
});

test('an empty drag has nothing to predict', () => {
  const plan = graphSnapPlan(autoLayout(spread()), new Set());
  assert.deepEqual(plan, { frames: [], edges: [] });
});

test('a drag that re-flows to the same frames is not a change', () => {
  const sorted = autoLayout(spread());
  const nudged = {
    ...sorted,
    objects: sorted.objects.map((o) =>
      o.id === 'right-a2' ? { ...o, x: o.x + 11, y: o.y + 6 } : o,
    ),
  };
  const settled = autoLayout(nudged);
  assert.notEqual(settled, sorted);
  assert.ok(sameMap(sorted, settled));
});

test('a real edit is still reported as a change', () => {
  const sorted = autoLayout(spread());
  for (const edit of [
    (o) => ({ ...o, text: 'renamed' }),
    (o) => ({ ...o, width: o.width + 40 }),
    (o) => ({ ...o, updatedAt: o.updatedAt + 1 }),
  ]) {
    const changed = {
      ...sorted,
      objects: sorted.objects.map((o) => (o.id === 'right-a2' ? edit(o) : o)),
    };
    assert.equal(sameMap(sorted, changed), false);
  }
  assert.equal(
    sameMap(sorted, {
      ...sorted,
      relationships: sorted.relationships.slice(1),
    }),
    false,
  );
});

test('a reordered branch is reported as a change', () => {
  const sorted = autoLayout(spread());
  const moved = autoLayout({
    ...sorted,
    objects: sorted.objects.map((o) =>
      o.id === 'right-a2'
        ? { ...o, y: at(sorted, 'right-a1').y - 40 }
        : o,
    ),
  });
  assert.equal(sameMap(sorted, moved), false);
});

const centerOf = (o) => ({ x: o.x + o.width / 2, y: o.y + objectHeight(o) / 2 });
const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

test('the hierarchy reads levels the way the layout draws them', () => {
  const tree = graphHierarchy(autoLayout(spread()));
  assert.equal(tree.parentOf.get('root'), null);
  assert.equal(tree.parentOf.get('right-a'), 'root');
  assert.equal(tree.parentOf.get('right-a1'), 'right-a');
  assert.deepEqual([...tree.childrenOf.get('right-a')].toSorted(compareIds), [
    'right-a1',
    'right-a2',
  ]);
});

test('dropping onto a card makes the dragged node its child', () => {
  const sorted = autoLayout(spread());
  const intent = graphDropIntent(
    sorted,
    'right-b',
    centerOf(at(sorted, 'left-a')),
  );
  assert.deepEqual(intent, { kind: 'child', parentId: 'left-a' });
});

test('dropping above a card makes the dragged node its sibling', () => {
  const sorted = autoLayout(spread());
  const reference = at(sorted, 'right-a2');
  const intent = graphDropIntent(sorted, 'right-b', {
    x: reference.x + reference.width / 2,
    y: reference.y - 12,
  });
  assert.deepEqual(intent, {
    kind: 'sibling',
    referenceId: 'right-a2',
    parentId: 'right-a',
    before: true,
  });
});

test('dropping below a card ranks the dragged node after it', () => {
  const sorted = autoLayout(spread());
  const reference = at(sorted, 'right-a2');
  const intent = graphDropIntent(sorted, 'right-b', {
    x: reference.x + 20,
    y: reference.y + objectHeight(reference) + 12,
  });
  assert.deepEqual(intent, {
    kind: 'sibling',
    referenceId: 'right-a2',
    parentId: 'right-a',
    before: false,
  });
});

test('empty canvas past the band means the branch is left alone', () => {
  const sorted = autoLayout(spread());
  const reference = at(sorted, 'right-a2');
  assert.equal(
    graphDropIntent(sorted, 'right-b', {
      x: reference.x + 20,
      y: reference.y + objectHeight(reference) + siblingBand + 10,
    }),
    undefined,
  );
  assert.equal(
    graphDropIntent(sorted, 'right-b', {
      x: reference.x + reference.width + 400,
      y: reference.y,
    }),
    undefined,
  );
});

test('a node cannot be dropped into its own branch', () => {
  const sorted = autoLayout(spread());
  const child = at(sorted, 'right-a1');
  assert.equal(
    graphDropIntent(sorted, 'right-a', centerOf(child)),
    undefined,
  );
  assert.equal(
    graphDropIntent(sorted, 'right-a', {
      x: child.x + 20,
      y: child.y - 12,
    }),
    undefined,
  );
  // Its own card is never a target either.
  assert.equal(
    graphDropIntent(sorted, 'right-a', centerOf(at(sorted, 'right-a'))),
    undefined,
  );
});

test('a component root has no rank to be a sibling of', () => {
  const sorted = autoLayout(spread());
  const root = at(sorted, 'root');
  assert.equal(
    graphDropIntent(sorted, 'right-b', {
      x: root.x + root.width / 2,
      y: root.y - 12,
    }),
    undefined,
  );
});

test('a sibling drop ranks the card beside its reference', () => {
  const sorted = autoLayout(spread());
  const reference = at(sorted, 'right-a1');
  const dropped = {
    ...sorted,
    objects: sorted.objects.map((o) =>
      o.id === 'right-a2' ? { ...o, x: o.x - 400, y: o.y + 500 } : o,
    ),
  };
  const before = autoLayout(
    graphDropOrder(dropped, 'right-a2', {
      kind: 'sibling',
      referenceId: 'right-a1',
      parentId: 'right-a',
      before: true,
    }),
  );
  assert.ok(at(before, 'right-a2').y < at(before, 'right-a1').y);
  const after = autoLayout(
    graphDropOrder(dropped, 'right-a2', {
      kind: 'sibling',
      referenceId: 'right-a1',
      parentId: 'right-a',
      before: false,
    }),
  );
  assert.ok(at(after, 'right-a2').y > at(after, 'right-a1').y);
  assert.equal(reference.x, at(after, 'right-a2').x);
});

test('ordering only rewrites the dragged card', () => {
  const sorted = autoLayout(spread());
  const ranked = graphDropOrder(sorted, 'right-b', {
    kind: 'sibling',
    referenceId: 'right-a2',
    parentId: 'right-a',
    before: true,
  });
  for (const o of ranked.objects)
    if (o.id !== 'right-b')
      assert.equal(o, at(sorted, o.id), `${o.id} was rewritten`);
  assert.equal(graphDropOrder(sorted, 'right-b'), sorted);
  assert.equal(
    graphDropOrder(sorted, 'right-b', { kind: 'child', parentId: 'left-a' }),
    sorted,
  );
});

test('a child drop moves the node under its new parent', () => {
  const sorted = autoLayout(spread());
  const { map: moved, error } = applyGraphDrop(sorted, 'right-b', {
    kind: 'child',
    parentId: 'left-a',
  });
  assert.equal(error, undefined);
  assert.equal(graphHierarchy(moved).parentOf.get('right-b'), 'left-a');
  // The connection that used to rank it is gone, not merely outranked.
  assert.equal(
    moved.relationships.some((edge) => edge.id === 'e4'),
    false,
  );
  assert.equal(
    moved.relationships.filter((edge) => edge.targetId === 'right-b').length,
    1,
  );
  assert.equal(autoLayout(moved).objects.length, sorted.objects.length);
});

test('a sibling drop moves the node under the reference parent', () => {
  const sorted = autoLayout(spread());
  const { map: moved } = applyGraphDrop(sorted, 'right-b', {
    kind: 'sibling',
    referenceId: 'right-a2',
    parentId: 'right-a',
    before: true,
  });
  assert.equal(graphHierarchy(moved).parentOf.get('right-b'), 'right-a');
});

test('a drop that changes nothing leaves the map untouched', () => {
  const sorted = autoLayout(spread());
  assert.equal(applyGraphDrop(sorted, 'right-b').map, sorted);
  assert.equal(
    applyGraphDrop(sorted, 'right-a1', {
      kind: 'child',
      parentId: 'right-a',
    }).map,
    sorted,
  );
  assert.equal(
    applyGraphDrop(sorted, 'right-a1', {
      kind: 'sibling',
      referenceId: 'right-a2',
      parentId: 'right-a',
      before: true,
    }).map,
    sorted,
  );
});

test('the ranking connection is found in either direction', () => {
  const reversed = map(
    [object('root', 0, 0, 'GOAL'), object('child', 600, 0)],
    [path('e1', 'child', 'root')],
  );
  const hierarchy = graphHierarchy(reversed);
  assert.equal(graphParentEdge(reversed, hierarchy, 'child'), 'e1');
  assert.equal(graphParentEdge(reversed, hierarchy, 'root'), undefined);
});

test('a card dropped on itself is not a move', () => {
  const sorted = autoLayout(spread());
  const { map: kept, error } = applyGraphDrop(sorted, 'right-a', {
    kind: 'child',
    parentId: 'right-a',
  });
  assert.equal(kept, sorted);
  assert.equal(error, undefined);
});

test('a drop the graph rejects reports the reason and keeps the map', () => {
  const sorted = autoLayout(spread());
  const { map: kept, error } = applyGraphDrop(sorted, 'root', {
    kind: 'child',
    parentId: 'right-a1',
  });
  assert.equal(kept, sorted);
  assert.equal(error, 'This would create a circular path.');
});
