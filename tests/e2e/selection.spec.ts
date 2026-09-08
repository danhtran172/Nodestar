import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

const canvasObject = (id: string, text: string, x: number, y: number) => ({
  id,
  type: 'NODE',
  role: 'NORMAL',
  text,
  note: '',
  x,
  y,
  width: 210,
  height: 90,
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
  title: 'Selection fixture',
  anchorId: 'root',
  objects: [
    canvasObject('root', 'Make meaningful work', 0, 0),
    canvasObject('child', 'Ship the first version', 360, 0),
    canvasObject('shared', 'Learn from the result', 720, 0),
    canvasObject('related', 'Protect recovery time', 0, 260),
  ],
  relationships: [
    {
      id: 'root-child',
      sourceId: 'root',
      targetId: 'child',
      type: 'PATH',
    },
    {
      id: 'child-shared',
      sourceId: 'child',
      targetId: 'shared',
      type: 'PATH',
    },
    {
      id: 'root-related',
      sourceId: 'root',
      targetId: 'related',
      type: 'RELATED',
    },
  ],
};

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Object is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((map) => {
    localStorage.clear();
    localStorage.setItem('spread-recovery-v1', JSON.stringify(map));
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="root"]')).toBeVisible();
});

test('single selection stays visible while implicit PATH branch moves', async ({
  page,
}) => {
  const root = page.locator('[data-object="root"]');
  const child = page.locator('[data-object="child"]');
  const shared = page.locator('[data-object="shared"]');
  const related = page.locator('[data-object="related"]');

  await root.click();
  await expect(page.locator('.canvas-object.selected')).toHaveCount(1);
  await expect(root).toHaveClass(/selected/);
  await expect(child).not.toHaveClass(/selected/);

  const before = {
    root: await center(root),
    child: await center(child),
    shared: await center(shared),
    related: await center(related),
  };
  await page.mouse.move(before.root.x, before.root.y);
  await page.mouse.down();
  await page.mouse.move(before.root.x + 70, before.root.y + 35, { steps: 8 });
  await page.mouse.up();

  const after = {
    root: await center(root),
    child: await center(child),
    shared: await center(shared),
    related: await center(related),
  };
  for (const id of ['root', 'child', 'shared'] as const) {
    expect(after[id].x - before[id].x).toBeCloseTo(70, 0);
    expect(after[id].y - before[id].y).toBeCloseTo(35, 0);
  }
  expect(after.related.x).toBeCloseTo(before.related.x, 0);
  expect(after.related.y).toBeCloseTo(before.related.y, 0);
});

test('explicit selection moves exactly the selected objects', async ({ page }) => {
  const root = page.locator('[data-object="root"]');
  const child = page.locator('[data-object="child"]');
  const related = page.locator('[data-object="related"]');

  await root.click();
  await related.click({ modifiers: ['Control'] });
  await expect(page.locator('.canvas-object.selected')).toHaveCount(2);

  const before = {
    root: await center(root),
    child: await center(child),
    related: await center(related),
  };
  await page.mouse.move(before.root.x, before.root.y);
  await page.mouse.down();
  await page.mouse.move(before.root.x + 55, before.root.y + 30, { steps: 8 });
  await page.mouse.up();

  const after = {
    root: await center(root),
    child: await center(child),
    related: await center(related),
  };
  for (const id of ['root', 'related'] as const) {
    expect(after[id].x - before[id].x).toBeCloseTo(55, 0);
    expect(after[id].y - before[id].y).toBeCloseTo(30, 0);
  }
  expect(after.child.x).toBeCloseTo(before.child.x, 0);
  expect(after.child.y).toBeCloseTo(before.child.y, 0);
});
