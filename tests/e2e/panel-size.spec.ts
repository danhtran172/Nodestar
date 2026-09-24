import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  imaginationWidth,
  minPanelWidth,
  panelHeight,
  seedBoxHeight,
  seedBoxWidth,
} from '../../lib/graph';
import type { VisionMap } from '../../lib/graph';

const fixture = {
  version: 1,
  title: 'Panel sizes',
  anchorId: 'goal',
  objects: [
    {
      id: 'goal',
      type: 'NODE',
      role: 'GOAL',
      text: 'A life with room',
      note: '',
      x: 0,
      y: 0,
      width: 280,
      height: 90,
      images: [],
      seeds: [],
      tier: 10,
      shuffle: 0.25,
      focal: 50,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  relationships: [],
};

async function persistedMap(page: Page): Promise<VisionMap> {
  return page.evaluate(() => {
    const value = JSON.parse(
      localStorage.getItem('nodestar-recovery-v1') || 'null',
    );
    return value.map || value;
  });
}

async function seed(page: Page) {
  await page.addInitScript((map) => {
    if (localStorage.getItem('nodestar-recovery-v1')) return;
    localStorage.clear();
    localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
    localStorage.setItem('nodestar-layout-mode', 'canvas');
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="goal"]')).toBeVisible();
}

async function create(page: Page, kind: 'Seed Box' | 'Imagination') {
  await page.locator('.create-button').click();
  await page.getByRole('menuitem', { name: kind }).click();
  await expect
    .poll(async () => (await persistedMap(page)).objects.length)
    .toBe(2);
  return (await persistedMap(page)).objects[1];
}

test('a new Seed Box is a landscape panel', async ({ page }) => {
  await seed(page);
  const made = await create(page, 'Seed Box');
  expect({ width: made.width, height: made.height }).toEqual({
    width: seedBoxWidth,
    height: seedBoxHeight,
  });
  expect(made.width).toBeGreaterThan(made.height);
});

test('a new Imagination is a compact panel', async ({ page }) => {
  await seed(page);
  const made = await create(page, 'Imagination');
  expect({ width: made.width, height: made.height }).toEqual({
    width: imaginationWidth,
    height: panelHeight,
  });
});

test('the width a panel starts at is still reachable by hand', async ({
  page,
}) => {
  await seed(page);
  // An Imagination is sized by preset, so the width field belongs to the box.
  // Creating one opens its details straight away.
  await create(page, 'Seed Box');
  // The details panel's own bounds must admit the size it was created at,
  // otherwise touching the control would jump the panel bigger.
  const width = page.getByLabel('Object width');
  await expect(width).toHaveValue(String(seedBoxWidth));
  await expect(width).toHaveAttribute('min', String(minPanelWidth));
  await width.fill(String(minPanelWidth));
  await width.blur();
  await expect
    .poll(async () => (await persistedMap(page)).objects[1].width)
    .toBe(minPanelWidth);
});
