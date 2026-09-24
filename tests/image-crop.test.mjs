import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampImageCrop,
  defaultImageCrop,
  imageCrop,
  imageCropPatch,
  imageCropStyle,
  maxImageScale,
  minImageScale,
  panImageCrop,
  validateMap,
  zoomImageCrop,
} from '../lib/graph.ts';
import { sameMap } from '../lib/auto-layout.ts';

const object = (extra = {}) => ({
  id: 'node',
  type: 'NODE',
  role: 'NORMAL',
  text: 'node',
  note: '',
  x: 0,
  y: 0,
  width: 210,
  height: 90,
  images: ['pic'],
  seeds: [],
  tier: 10,
  shuffle: 0,
  focal: 50,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const map = (objects) => ({
  version: 1,
  title: 'Crops',
  anchorId: 'node',
  objects,
  relationships: [],
});

test('an image without a stored crop falls back to the older focal point', () => {
  assert.deepEqual(imageCrop(object({ focal: 30, focalX: 70 }), 'pic'), {
    x: 70,
    y: 30,
    scale: 1,
  });
  assert.deepEqual(imageCrop(object(), 'pic'), { x: 50, y: 50, scale: 1 });
  const stored = { x: 10, y: 20, scale: 2 };
  assert.equal(imageCrop(object({ crops: { pic: stored } }), 'pic'), stored);
});

test('storing a crop keeps the focal fields of a node in step', () => {
  const patch = imageCropPatch(object(), 'pic', { x: 80, y: 20, scale: 1.5 });
  assert.deepEqual(patch, {
    crops: { pic: { x: 80, y: 20, scale: 1.5 } },
    focal: 20,
    focalX: 80,
  });
  const imagination = imageCropPatch(
    object({ type: 'IMAGINATION', images: ['a', 'b'], crops: { a: { x: 1, y: 2, scale: 3 } } }),
    'b',
    { x: 5, y: 6, scale: 1 },
  );
  assert.deepEqual(imagination, {
    crops: { a: { x: 1, y: 2, scale: 3 }, b: { x: 5, y: 6, scale: 1 } },
  });
});

test('a crop is held inside the frame and the zoom range', () => {
  assert.deepEqual(clampImageCrop({ x: -5, y: 140, scale: 0.1 }), {
    x: 0,
    y: 100,
    scale: minImageScale,
  });
  assert.equal(clampImageCrop({ x: 50, y: 50, scale: 99 }).scale, maxImageScale);
  assert.deepEqual(clampImageCrop({ x: NaN, y: 50, scale: 1 }), {
    x: 0,
    y: 50,
    scale: 1,
  });
});

test('dragging moves the picture by the distance dragged', () => {
  // A 2:1 image in a 100x100 frame covers 200x100: 100px of overflow sideways
  // and none vertically, so a 25px drag to the right is a quarter of the way.
  const moved = panImageCrop(defaultImageCrop, 25, 30, 100, 100, 2);
  assert.equal(moved.x, 25);
  assert.equal(moved.y, 50);
  // Zoomed to 2x, the same frame hides 300px sideways and 100px vertically.
  const zoomed = panImageCrop({ x: 50, y: 50, scale: 2 }, -30, 10, 100, 100, 2);
  assert.equal(zoomed.x, 60);
  assert.equal(zoomed.y, 40);
});

test('the wheel zooms around the pointer, not the frame centre', () => {
  // Zooming in at the frame centre with the crop point already there moves
  // nothing but the scale.
  const centred = zoomImageCrop(defaultImageCrop, 2, 50, 50, 100, 100, 1);
  assert.deepEqual(centred, { x: 50, y: 50, scale: 2 });
  // Zooming in over the top-left corner drags the crop point toward it so
  // that corner stays under the pointer.
  const corner = zoomImageCrop(defaultImageCrop, 2, 0, 0, 100, 100, 1);
  assert.equal(corner.scale, 2);
  assert.equal(corner.x, 0);
  assert.equal(corner.y, 0);
  // Zooming out below the cover fit shrinks the picture inside the frame.
  assert.equal(zoomImageCrop(defaultImageCrop, 0.5, 50, 50, 100, 100, 1).scale, 0.5);
  assert.equal(zoomImageCrop(defaultImageCrop, 0.01, 50, 50, 100, 100, 1).scale, minImageScale);
});

test('a picture smaller than its frame can be dragged about inside it', () => {
  // A square picture at half size leaves 50px of frame free on each axis, so
  // a 25px drag right and down moves it halfway across that room.
  const small = { x: 50, y: 50, scale: 0.5 };
  const moved = panImageCrop(small, 25, 25, 100, 100, 1);
  assert.equal(moved.x, 100);
  assert.equal(moved.y, 100);
  const back = panImageCrop(small, -12.5, 0, 100, 100, 1);
  assert.equal(back.x, 25);
  assert.equal(back.y, 50);
  // Dragging past the frame edge stops at it.
  assert.equal(panImageCrop(small, 500, 0, 100, 100, 1).x, 100);
});

test('a crop renders as an object position and a matching scale origin', () => {
  assert.deepEqual(imageCropStyle({ x: 25, y: 75, scale: 1 }), {
    objectPosition: '25% 75%',
    transformOrigin: '25% 75%',
    transform: undefined,
  });
  assert.equal(imageCropStyle({ x: 25, y: 75, scale: 2 }).transform, 'scale(2)');
});

test('maps with crops load and malformed crops are refused', () => {
  const good = map([object({ crops: { pic: { x: 10, y: 20, scale: 2 } } })]);
  assert.deepEqual(validateMap(good).objects[0].crops, good.objects[0].crops);
  assert.ok(validateMap(map([object()])));
  assert.throws(() =>
    validateMap(map([object({ crops: { pic: { x: 'left', y: 0, scale: 1 } } })])),
  );
  assert.throws(() => validateMap(map([object({ crops: [] })])));
});

test('a changed crop makes the map a different map', () => {
  const before = map([object({ crops: { pic: { x: 10, y: 20, scale: 2 } } })]);
  const same = map([object({ crops: { pic: { x: 10, y: 20, scale: 2 } } })]);
  const after = map([object({ crops: { pic: { x: 10, y: 20, scale: 3 } } })]);
  assert.ok(sameMap(before, same));
  assert.ok(!sameMap(before, after));
  assert.ok(!sameMap(before, map([object()])));
});
