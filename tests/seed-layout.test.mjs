import assert from 'node:assert/strict';
import test from 'node:test';
import { nextVisualShuffle, seedLayout, shuffleSeeds } from '../lib/graph.ts';

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

const mapWith = (object) => ({
  version: 1,
  title: 'Seeds',
  anchorId: object.id,
  objects: [object],
  relationships: [],
});

function overlaps(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

for (const count of [1, 10, 11, 20, 21, 30]) {
  for (const width of [240, 480]) {
    test(`${count} chips flow in reading order, bounded and collision-free at ${width}px`, () => {
      const box = seedBox(count, width, count === 30);
      const layout = seedLayout(box);
      assert.deepEqual(seedLayout(box), layout);
      assert.deepEqual(
        layout.positions.map(({ seed }) => seed.id),
        box.seeds.map(({ id }) => id),
      );
      const available = width - 28;
      for (let index = 0; index < layout.positions.length; index++) {
        const chip = layout.positions[index];
        assert.ok(chip.x >= 0);
        assert.ok(chip.x + chip.width <= available + 0.001);
        assert.ok(chip.y >= 0);
        assert.ok(chip.y + chip.height <= layout.height + 0.001);
        // A chip is one text line tall unless it genuinely wrapped.
        assert.equal(chip.multiline, chip.height > 32);
        for (let other = index + 1; other < layout.positions.length; other++)
          assert.equal(overlaps(chip, layout.positions[other]), false);
      }
    });
  }
}

test('chips are packed left to right with a small, fixed gap', () => {
  const layout = seedLayout(seedBox(10, 480));
  const firstRow = layout.positions.filter(({ y }) => y === 0);
  assert.ok(firstRow.length > 1);
  assert.equal(firstRow[0].x, 0);
  for (let index = 1; index < firstRow.length; index++)
    assert.equal(
      firstRow[index].x,
      firstRow[index - 1].x + firstRow[index - 1].width + 6,
    );
});

test('layout does not depend on the shuffle value or the box height', () => {
  const box = seedBox(12);
  assert.deepEqual(
    seedLayout({ ...box, shuffle: nextVisualShuffle(box.shuffle) }),
    seedLayout(box),
  );
  assert.deepEqual(seedLayout({ ...box, height: box.height + 240 }), seedLayout(box));
});

test('Shuffle reorders the seeds themselves and advances deterministically', () => {
  const box = seedBox(10);
  const before = mapWith(box);
  const after = shuffleSeeds(before, 'box').objects[0];
  assert.equal(after.shuffle, nextVisualShuffle(box.shuffle));
  const byId = (a, b) => a.localeCompare(b);
  assert.deepEqual(
    after.seeds.map(({ id }) => id).sort(byId),
    box.seeds.map(({ id }) => id).sort(byId),
  );
  assert.notDeepEqual(
    after.seeds.map(({ id }) => id),
    box.seeds.map(({ id }) => id),
  );
  assert.deepEqual(shuffleSeeds(before, 'box'), shuffleSeeds(before, 'box'));
});

test('Shuffle leaves a box with fewer than two seeds untouched', () => {
  for (const count of [0, 1]) {
    const before = mapWith(seedBox(count));
    assert.equal(shuffleSeeds(before, 'box'), before);
  }
});
