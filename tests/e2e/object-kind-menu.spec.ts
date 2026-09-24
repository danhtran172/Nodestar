import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { VisionMap } from '../../lib/graph';

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
  title: 'Object kind fixture',
  anchorId: 'goal',
  objects: [
    { ...node('goal', 'A life with room', 0, 0), role: 'GOAL', width: 280 },
    node('middle', 'Make meaningful work', 420, 0),
    { ...node('leaf', 'Share what I make', 840, 0), attachment: 'e2' },
  ],
  relationships: [
    { id: 'e1', sourceId: 'goal', targetId: 'middle', type: 'PATH' },
    { id: 'e2', sourceId: 'middle', targetId: 'leaf', type: 'PATH' },
  ],
};
// `connect` records the branch a node hangs from; the fixture matches it.
Object.assign(fixture.objects[1], { attachment: 'e1' });

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
    // These menus are about what an object is, not where it sits.
    localStorage.setItem('nodestar-layout-mode', 'canvas');
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="goal"]')).toBeVisible();
}

const menu = (page: Page) => page.locator('.object-context-menu');
const item = (page: Page, label: string) =>
  menu(page).getByRole('button', { name: label, exact: true });

/** The add handle only shows on a selected or hovered card. */
async function addHandle(page: Page, id: string) {
  const card = page.locator(`[data-object="${id}"]`);
  await card.click();
  return card.locator('[data-branch-plus]');
}

test('right-clicking the add handle offers every kind', async ({ page }) => {
  await seed(page);
  const handle = await addHandle(page, 'middle');
  await handle.click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('button')).toHaveText([
    'Node',
    'Goal',
    'Seed Box',
    'Imagination',
    'Graph',
  ]);
  await item(page, 'Seed Box').click();
  await expect(menu(page)).toHaveCount(0);
  const map = await persistedMap(page);
  const made = map.objects.find((o) => o.type === 'SEED_BOX');
  expect(made?.text).toBe('Loose ideas');
  // A Seed Box cannot sit on a path, so the new branch is a relation.
  const edge = map.relationships.find(
    (e) => e.sourceId === made!.id || e.targetId === made!.id,
  );
  expect(edge?.type).toBe('RELATED');
  expect([edge!.sourceId, edge!.targetId]).toContain('middle');
});

test('the add handle still adds a node on a plain click', async ({ page }) => {
  await seed(page);
  const handle = await addHandle(page, 'middle');
  await handle.click();
  await expect(page.locator('.inline-editor')).toBeVisible();
  await page.keyboard.type('A steady rhythm');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () =>
      (await persistedMap(page)).objects.some(
        (o) => o.text === 'A steady rhythm' && o.type === 'NODE',
      ),
    )
    .toBe(true);
});

test('right-clicking a card offers the kind it can change into', async ({
  page,
}) => {
  await seed(page);
  await page.locator('[data-object="middle"]').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('button')).toHaveText([
    'Edit title',
    'Details',
    'Connect',
    'Node',
    'Goal',
    'Seed Box',
    'Imagination',
    'Graph',
  ]);
  // The kind it already is reads as the current state, and cannot be re-picked.
  await expect(item(page, 'Node')).toBeDisabled();
  await expect(item(page, 'Goal')).toBeEnabled();
  await item(page, 'Goal').click();
  await expect
    .poll(async () =>
      (await persistedMap(page)).objects.find((o) => o.id === 'middle')?.role,
    )
    .toBe('GOAL');
  await page.locator('[data-object="middle"]').click({ button: 'right' });
  await expect(item(page, 'Goal')).toBeDisabled();
  await expect(item(page, 'Node')).toBeEnabled();
});

test('changing a node into a Seed Box keeps the map loadable', async ({
  page,
}) => {
  await seed(page);
  await page.locator('[data-object="middle"]').click({ button: 'right' });
  await item(page, 'Seed Box').click();
  await expect
    .poll(async () =>
      (await persistedMap(page)).objects.find((o) => o.id === 'middle')?.type,
    )
    .toBe('SEED_BOX');
  const map = await persistedMap(page);
  // Nothing may still call a Seed Box connection a path.
  expect(
    map.relationships
      .filter((e) => e.sourceId === 'middle' || e.targetId === 'middle')
      .map((e) => e.type),
  ).toEqual(['RELATED', 'RELATED']);
  expect(map.objects.find((o) => o.id === 'leaf')?.attachment).toBeUndefined();
  // A map that fails to validate is dropped for the demo map on the way back in.
  await page.reload();
  await expect(page.locator('[data-object="middle"]')).toBeVisible();
  await expect(page.locator('[data-object="middle"]')).toHaveClass(/seed_box/);
});

test('an undo puts the object back the way it was', async ({ page }) => {
  await seed(page);
  await page.locator('[data-object="middle"]').click({ button: 'right' });
  await item(page, 'Imagination').click();
  await expect
    .poll(async () =>
      (await persistedMap(page)).objects.find((o) => o.id === 'middle')?.type,
    )
    .toBe('IMAGINATION');
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const map = await persistedMap(page);
      return map.objects.find((o) => o.id === 'middle')?.type;
    })
    .toBe('NODE');
  const map = await persistedMap(page);
  expect(map.relationships.map((e) => e.type)).toEqual(['PATH', 'PATH']);
});

test('the menu closes without choosing anything', async ({ page }) => {
  await seed(page);
  await page.locator('[data-object="middle"]').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await page.locator('[data-object="middle"]').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await page.locator('.canvas').click({ position: { x: 30, y: 30 } });
  await expect(menu(page)).toHaveCount(0);
  expect(
    (await persistedMap(page)).objects.find((o) => o.id === 'middle')?.type,
  ).toBe('NODE');
});

test('changing a card into a Graph object asks which graph first', async ({
  page,
}) => {
  await seed(page);
  await page.locator('[data-object="middle"]').click({ button: 'right' });
  await item(page, 'Graph').click();
  // Nothing is converted until a graph is chosen.
  await expect(page.locator('.graph-link-dialog')).toBeVisible();
  expect(
    (await persistedMap(page)).objects.find((o) => o.id === 'middle')?.type,
  ).toBe('NODE');
  await page
    .locator('.graph-link-dialog')
    .getByLabel('New graph goal')
    .fill('A parallel plan');
  await page
    .locator('.graph-link-dialog')
    .getByRole('button', { name: 'Create graph' })
    .click();
  await expect
    .poll(async () =>
      (await persistedMap(page)).objects.find((o) => o.id === 'middle')?.type,
    )
    .toBe('GRAPH');
  const converted = (await persistedMap(page)).objects.find(
    (o) => o.id === 'middle',
  );
  expect(converted?.mapRef).toBeTruthy();
  expect(converted?.text).toBe('A parallel plan');
  // It was on a path before and it still is.
  expect(
    (await persistedMap(page)).relationships.map((e) => e.type),
  ).toEqual(['PATH', 'PATH']);
});
