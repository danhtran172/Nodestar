import { expect, test } from '@playwright/test';

const node = (id: string, text: string, x: number, y: number) => ({
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
  title: 'Overlay fixture',
  anchorId: 'root',
  objects: [
    node('root', 'Make meaningful work', 0, 0),
    node('child', 'Ship the first version', 380, 0),
    {
      ...node('seed-box', 'Loose ideas', 0, 260),
      type: 'SEED_BOX',
      width: 310,
      height: 240,
      seeds: [{ id: 'seed-1', text: 'Try a workshop', visualSeed: 0.4 }],
    },
  ],
  relationships: [
    {
      id: 'root-child',
      sourceId: 'root',
      targetId: 'child',
      type: 'PATH',
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((map) => {
    localStorage.clear();
    localStorage.setItem('spread-recovery-v1', JSON.stringify(map));
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="root"]')).toBeVisible();
  await page.locator('[data-object="root"]').click();
});

test('More Details opens the panel without clearing selection', async ({
  page,
}) => {
  await page.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Details' }).click();
  await expect(page.locator('[data-object="root"]')).toHaveClass(/selected/);
  await expect(page.getByText('Make meaningful work').last()).toBeVisible();
  await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
});

test('More Fit selection changes viewport and preserves selection', async ({
  page,
}) => {
  const root = page.locator('[data-object="root"]');
  const before = await root.boundingBox();
  await page.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Fit selection' }).click();
  await expect(root).toHaveClass(/selected/);
  await expect
    .poll(async () => (await root.boundingBox())?.x)
    .not.toBeCloseTo(before?.x || 0, 0);
});

test('context menu actions run once without canvas gestures', async ({ page }) => {
  const root = page.locator('[data-object="root"]');

  await page.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Connect' }).click();
  await expect(page.getByText('Select another object to connect')).toBeVisible();
  await expect(root).toHaveClass(/selected/);
  await page.keyboard.press('Escape');

  await root.click();
  await page.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Edit text' }).click();
  await expect(page.getByRole('textbox', { name: 'Object text' })).toBeVisible();
  await page.keyboard.press('Escape');

  await root.click();
  await page.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Select branch' }).click();
  await expect(page.locator('.canvas-object.selected')).toHaveCount(2);

  await page.locator('.canvas').click({ position: { x: 10, y: 110 } });
  await root.click();
  await page.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Copy' }).click();
  await expect(page.getByText('1 object copied')).toBeVisible();

  const beforeDuplicate = await page.locator('.canvas-object').count();
  await page.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page.locator('.canvas-object')).toHaveCount(beforeDuplicate + 1);
});

test('Seed Box delete opens confirmation and overlay Escape is non-mutating', async ({
  page,
}) => {
  const objects = page.locator('.canvas-object');
  const before = await objects.count();
  await page.locator('[data-object="seed-box"]').click();
  await page.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(
    page.getByText('Delete this Seed Box and its seeds?'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Delete this Seed Box and its seeds?')).toBeHidden();
  await expect(objects).toHaveCount(before);
});

test('clicking outside overlays clears selection', async ({ page }) => {
  await expect(page.locator('.canvas-object.selected')).toHaveCount(1);
  await page.locator('.canvas').click({ position: { x: 10, y: 110 } });
  await expect(page.locator('.canvas-object.selected')).toHaveCount(0);
});
