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
/**
 * Where a card is picked up to move it: its left side. The centre carries the
 * connect handle, which draws a path instead of moving the card.
 */
async function grip(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Object is not visible');
  return { x: box.x + 24, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((map) => {
    localStorage.clear();
    // These specs cover free canvas placement; graph mode is exercised by
    // graph-layout.spec.ts.
    localStorage.setItem('nodestar-layout-mode', 'canvas');
    localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="root"]')).toBeVisible();
});

test('ordinary drag moves only the clicked Node', async ({ page }) => {
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
  const from = await grip(root);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 70, from.y + 35, { steps: 8 });
  await page.mouse.up();

  const after = {
    root: await center(root),
    child: await center(child),
    shared: await center(shared),
    related: await center(related),
  };
  expect(after.root.x - before.root.x).toBeCloseTo(70, 0);
  expect(after.root.y - before.root.y).toBeCloseTo(35, 0);
  for (const id of ['child', 'shared', 'related'] as const) {
    expect(after[id].x).toBeCloseTo(before[id].x, 0);
    expect(after[id].y).toBeCloseTo(before[id].y, 0);
  }
});

test('selected nodes expose an external curved grip that still resizes by drag', async ({
  page,
}) => {
  const root = page.locator('[data-object="root"]');
  await root.click();
  const grip = root.locator('[data-resize]');
  await expect(grip.locator('path')).toHaveAttribute(
    'd',
    'M18 6C17 12 12 17 6 18',
  );
  await expect(root).toHaveCSS('border-right-color', 'rgb(69, 104, 185)');
  expect(
    await grip.evaluate((element) => getComputedStyle(element).color),
  ).toBe(await root.evaluate((element) => getComputedStyle(element).borderRightColor));

  const before = await root.boundingBox();
  const handle = await grip.boundingBox();
  if (!before || !handle) throw new Error('Expected selected resize grip');
  expect(handle.x + handle.width).toBeGreaterThan(before.x + before.width);
  expect(handle.y + handle.height).toBeGreaterThan(before.y + before.height);

  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 80, handle.y + handle.height / 2 + 20, {
    steps: 8,
  });
  await page.mouse.up();

  const after = await root.boundingBox();
  if (!after) throw new Error('Expected resized Node to remain visible');
  expect(after.width - before.width).toBeCloseTo(80, 0);
  expect(after.height).toBeGreaterThan(before.height + 10);

  const resizedHandle = await grip.boundingBox();
  if (!resizedHandle) throw new Error('Expected resize grip after resizing');
  await page.mouse.move(
    resizedHandle.x + resizedHandle.width / 2,
    resizedHandle.y + resizedHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    resizedHandle.x + resizedHandle.width / 2,
    resizedHandle.y - 400,
    { steps: 8 },
  );
  await page.mouse.up();

  const minimum = await root.boundingBox();
  if (!minimum) throw new Error('Expected Node after minimum-height resize');
  expect(minimum.height).toBeGreaterThan(80);
  expect(minimum.height).toBeLessThan(after.height);
  const savedRoot = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('nodestar-recovery-v1') || '{}');
    const map = saved.map || saved;
    return map.objects.find((object: { id: string }) => object.id === 'root');
  });
  expect(savedRoot).toMatchObject({ manualHeight: true });
  expect(savedRoot.height).toBeGreaterThanOrEqual(70);
});

test('Shift drag moves the clicked Node and its outgoing PATH dependencies', async ({
  page,
}) => {
  const root = page.locator('[data-object="root"]');
  const child = page.locator('[data-object="child"]');
  const shared = page.locator('[data-object="shared"]');
  const related = page.locator('[data-object="related"]');
  const before = {
    root: await center(root),
    child: await center(child),
    shared: await center(shared),
    related: await center(related),
  };
  await page.keyboard.down('Shift');
  const from = await grip(root);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 70, from.y + 35, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

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

test('explicit selection moves exactly the selected objects', async ({
  page,
}) => {
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
  const from = await grip(root);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 55, from.y + 30, { steps: 8 });
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
