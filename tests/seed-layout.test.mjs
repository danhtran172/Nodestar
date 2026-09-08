import assert from 'node:assert/strict';
import test from 'node:test';
import { nextVisualShuffle, seedLayout } from '../lib/graph.ts';

const seedBox = (count, width = 310, long = false) => ({
  id: 'box',
  type: 'SEED_BOX',
  role: 'NORMAL',
  text: 'Ideas',
  note: '',
  x: 0,
  y: 0,
  width,
  height: Math.max(240, 115 + count * 48),
  images: [],
  seeds: Array.from({ length: count }, (_, index) => ({
    id: `seed-${index}`,
    text:
      long && index === 0
        ? 'A deliberately long seed that needs several lines while remaining readable '.repeat(
            5,
          )
        : `Idea ${index}`,
    visualSeed: (index + 1) / 37,
  })),
  tier: count > 20 ? 30 : count > 10 ? 20 : 10,
  shuffle: 0.314159,
  focal: 50,
  createdAt: 1,
  updatedAt: 1,
});

function bounds(position) {
  const angle = (Math.abs(position.rotation) * Math.PI) / 180;
  const width =
    Math.abs(Math.cos(angle)) * position.width +
    Math.sin(angle) * position.height;
  const height =
    Math.sin(angle) * position.width +
    Math.abs(Math.cos(angle)) * position.height;
  return {
    left: position.x - (width - position.width) / 2,
    right: position.x + position.width + (width - position.width) / 2,
    top: position.y - (height - position.height) / 2,
    bottom: position.y + position.height + (height - position.height) / 2,
  };
}

function overlaps(a, b) {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

for (const count of [1, 10, 11, 20, 21, 30]) {
  for (const width of [240, 480]) {
    test(`${count} seeds remain deterministic, bounded and collision-free at ${width}px`, () => {
      const box = seedBox(count, width, count === 30);
      const layout = seedLayout(box);
      assert.deepEqual(seedLayout(box), layout);
      assert.deepEqual(
        layout.positions.map(({ seed }) => seed.id),
        box.seeds.map(({ id }) => id),
      );
      const rectangles = layout.positions.map(bounds);
      for (let index = 0; index < layout.positions.length; index++) {
        const position = layout.positions[index];
        const rectangle = rectangles[index];
        assert.ok(Math.abs(position.rotation) <= 35);
        if (position.height <= 64)
          assert.ok(
            Math.abs(position.rotation) >= 5 &&
              Math.abs(position.rotation) <= 15,
          );
        assert.ok(rectangle.left >= -0.001);
        assert.ok(rectangle.right <= width - 44 + 0.001);
        assert.ok(rectangle.top >= -0.001);
        assert.ok(rectangle.bottom <= layout.height + 0.001);
        for (let other = index + 1; other < rectangles.length; other++)
          assert.equal(overlaps(rectangle, rectangles[other]), false);
      }
    });
  }
}

test('shuffle advances deterministically and produces a new composition', () => {
  const box = seedBox(10);
  const next = nextVisualShuffle(box.shuffle);
  assert.equal(nextVisualShuffle(box.shuffle), next);
  assert.notEqual(next, box.shuffle);
  assert.notEqual(nextVisualShuffle(next), next);
  const before = seedLayout(box);
  const after = seedLayout({ ...box, shuffle: next });
  assert.notDeepEqual(
    before.positions.map(({ x, y, rotation }) => ({ x, y, rotation })),
    after.positions.map(({ x, y, rotation }) => ({ x, y, rotation })),
  );
  assert.ok(new Set(after.positions.map(({ x }) => Math.round(x))).size > 1);
});
