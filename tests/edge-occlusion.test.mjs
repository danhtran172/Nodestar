import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeOccluders } from '../lib/edge-occlusion.ts';
const path = 'M0,50 C100,50 200,50 300,50';
test('fades a crossing node, but never the source or target', () => {
  const nodes = [
    { id: 'a', x: -20, y: 0, width: 40, height: 100 },
    { id: 'cover', x: 130, y: 10, width: 40, height: 80 },
    { id: 'b', x: 280, y: 0, width: 40, height: 100 },
  ];
  assert.deepEqual(
    edgeOccluders(path, nodes, 'a', 'b').map((o) => o.id),
    ['cover'],
  );
});
test('does not fade nodes that do not cross the curve', () => {
  assert.equal(
    edgeOccluders(
      path,
      [{ id: 'near', x: 100, y: 60, width: 40, height: 40 }],
      'a',
      'b',
    ).length,
    0,
  );
  assert.equal(
    edgeOccluders(
      'M0,0 C0,100 100,100 100,0',
      [{ id: 'inside-bounds', x: 45, y: 15, width: 10, height: 10 }],
      'a',
      'b',
    ).length,
    0,
  );
});
test('finds both covering nodes and a narrow intersection between samples', () => {
  const nodes = [
    { id: 'thin', x: 101, y: 45, width: 0.1, height: 10 },
    { id: 'second', x: 220, y: 20, width: 30, height: 60 },
  ];
  assert.equal(edgeOccluders(path, nodes, 'a', 'b').length, 2);
});
