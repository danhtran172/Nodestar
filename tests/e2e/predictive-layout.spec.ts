import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { VisionMap } from '../../lib/graph';

const object = (id: string, x: number, y: number, type = 'NODE') => ({
  id,
  type,
  role: 'NORMAL',
  text: id,
  note: '',
  x,
  y,
  width: type === 'NODE' ? 210 : 310,
  height: type === 'NODE' ? 90 : 240,
  images: [],
  seeds: [],
  tier: 10,
  shuffle: 0.25,
  focal: 50,
  createdAt: 1,
  updatedAt: 1,
});

const fixture = {
  version: 1,
  title: 'Predictive fixture',
  anchorId: 'parent',
  objects: [
    object('parent', -360, 0),
    object('other-parent', -360, 220),
    { ...object('root', 0, 0), attachment: 'old-root' },
    object('child', 360, 0),
    object('target', 0, 330),
    object('obstacle', 350, 330, 'SEED_BOX'),
    object('distant', 1600, 1000),
  ],
  relationships: [
    { id: 'old-root', sourceId: 'parent', targetId: 'root', type: 'PATH' },
    {
      id: 'extra-incoming',
      sourceId: 'other-parent',
      targetId: 'root',
      type: 'PATH',
    },
    { id: 'root-child', sourceId: 'root', targetId: 'child', type: 'PATH' },
    {
      id: 'related',
      sourceId: 'root',
      targetId: 'obstacle',
      type: 'RELATED',
    },
  ],
};

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Object is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function persistedMap(page: Page): Promise<VisionMap> {
  return page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('spread-recovery-v1') || 'null');
    return value.map || value;
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((map) => {
    localStorage.clear();
    localStorage.setItem('spread-recovery-v1', JSON.stringify(map));
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="root"]')).toBeVisible();
});

test('re-parent commit exactly matches preview and undo restores semantics', async ({
  page,
}) => {
  const root = page.locator('[data-object="root"]');
  const target = page.locator('[data-object="target"]');
  const from = await center(root);
  const to = await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(target).toHaveClass(/drop-target/);
  const preview = await root.boundingBox();
  await page.mouse.up();
  const committed = await root.boundingBox();
  expect(committed).toEqual(preview);

  const map = await persistedMap(page);
  expect(map.relationships.some(({ id }) => id === 'old-root')).toBe(false);
  expect(map.relationships.some(({ id }) => id === 'extra-incoming')).toBe(true);
  expect(
    map.relationships.some(
      ({ sourceId, targetId, type }) =>
        sourceId === 'target' && targetId === 'root' && type === 'PATH',
    ),
  ).toBe(true);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () =>
      (await persistedMap(page)).relationships.some(
        ({ id }) => id === 'old-root',
      ),
    )
    .toBe(true);
});

test('invalid circular re-parent previews error and commits nothing', async ({
  page,
}) => {
  const root = page.locator('[data-object="root"]');
  const child = page.locator('[data-object="child"]');
  const before = await root.boundingBox();
  const beforeMap = await persistedMap(page);
  const from = await center(root);
  const to = await center(child);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(child).toHaveClass(/invalid-target/);
  await expect(page.getByText('This would create a circular path.')).toBeVisible();
  await page.mouse.up();
  await expect(root).not.toHaveClass(/dragging/);
  expect(await root.boundingBox()).toEqual(before);
  expect((await persistedMap(page)).relationships).toEqual(
    beforeMap.relationships,
  );
});

test('object bounds collision is resolved even when pointer misses obstacle', async ({
  page,
}) => {
  const root = page.locator('[data-object="root"]');
  const obstacle = page.locator('[data-object="obstacle"]');
  const from = await center(root);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 180, from.y + 330, { steps: 10 });
  const preview = await root.boundingBox();
  const fixed = await obstacle.boundingBox();
  if (!preview || !fixed) throw new Error('Expected visible objects');
  expect(
    preview.x + preview.width <= fixed.x ||
      preview.x >= fixed.x + fixed.width ||
      preview.y + preview.height <= fixed.y ||
      preview.y >= fixed.y + fixed.height,
  ).toBe(true);
  await page.mouse.up();
  expect(await root.boundingBox()).toEqual(preview);
});
