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
  title: 'Folding fixture',
  anchorId: 'root',
  objects: [
    { ...node('root', 'A life with room', 0, 0), role: 'GOAL', width: 280 },
    node('right-a', 'Make meaningful work', 700, -200),
    node('right-a1', 'Ship the first version', 1400, -300),
    node('right-a2', 'Share what I make', 1400, -100),
    node('deeper', 'Find my people', 2100, -100),
    node('left-a', 'A quieter week', -700, 200),
  ],
  relationships: [
    { id: 'e1', sourceId: 'root', targetId: 'right-a', type: 'PATH' },
    { id: 'e2', sourceId: 'right-a', targetId: 'right-a1', type: 'PATH' },
    { id: 'e3', sourceId: 'right-a', targetId: 'right-a2', type: 'PATH' },
    { id: 'e4', sourceId: 'right-a2', targetId: 'deeper', type: 'PATH' },
    { id: 'e5', sourceId: 'root', targetId: 'left-a', type: 'PATH' },
  ],
};
for (const edge of fixture.relationships) {
  const target = fixture.objects.find((o) => o.id === edge.targetId);
  if (target) Object.assign(target, { attachment: edge.id });
}

async function persistedMap(page: Page): Promise<VisionMap> {
  return page.evaluate(() => {
    const value = JSON.parse(
      localStorage.getItem('nodestar-recovery-v1') || 'null',
    );
    return value.map || value;
  });
}

async function seed(page: Page, mode: 'graph' | 'canvas' = 'graph') {
  await page.addInitScript(
    ({ map, layoutMode }) => {
      if (localStorage.getItem('nodestar-recovery-v1')) return;
      localStorage.clear();
      localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
      localStorage.setItem('nodestar-layout-mode', layoutMode);
    },
    { map: fixture, layoutMode: mode },
  );
  await page.goto('/');
  await expect(page.locator('[data-object="root"]')).toBeVisible();
  if (mode === 'graph')
    await expect
      .poll(async () => (await persistedMap(page)).objects[5].x)
      .not.toBe(-700);
}

const fold = (page: Page, id: string) => page.locator(`[data-fold="${id}"]`);
const card = (page: Page, id: string) => page.locator(`[data-object="${id}"]`);

test('only a card with a branch under it carries a fold control', async ({
  page,
}) => {
  await seed(page);
  await expect(fold(page, 'right-a')).toBeVisible();
  await expect(fold(page, 'right-a2')).toBeVisible();
  // A leaf has nothing to fold.
  await expect(fold(page, 'deeper')).toHaveCount(0);
  await expect(fold(page, 'left-a')).toHaveCount(0);
  // Folding the centre would leave one card and no way back to the rest.
  await expect(fold(page, 'root')).toHaveCount(0);
});

test('the control sits at the head of the paths leaving the card', async ({
  page,
}) => {
  await seed(page);
  const box = (await card(page, 'right-a').boundingBox())!;
  const control = (await fold(page, 'right-a').boundingBox())!;
  const centre = control.x + control.width / 2;
  // On the outboard edge: the side its children fan out to.
  expect(Math.abs(centre - (box.x + box.width))).toBeLessThan(14);
  expect(control.y + control.height / 2).toBeCloseTo(box.y + box.height / 2, 0);
  // It reads as a fold, never as a minus: an icon while open, a count while
  // folded.
  await expect(fold(page, 'right-a').locator('svg')).toHaveCount(1);
  await expect(fold(page, 'right-a')).toHaveText('');
});

test('one click folds the whole branch, however deep it runs', async ({
  page,
}) => {
  await seed(page);
  await expect(card(page, 'deeper')).toBeVisible();
  await fold(page, 'right-a').click();
  for (const id of ['right-a1', 'right-a2', 'deeper'])
    await expect(card(page, id)).toHaveCount(0);
  // The card that was folded stays, and so does everything outside the branch.
  await expect(card(page, 'right-a')).toBeVisible();
  await expect(card(page, 'left-a')).toBeVisible();
  // The control now carries what it is holding back.
  await expect(fold(page, 'right-a')).toHaveText('3');
  await expect(fold(page, 'right-a')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.canvas-footer')).toContainText('3 folded');
});

test('folding again brings the branch back to its rank', async ({ page }) => {
  await seed(page);
  const before = Object.fromEntries(
    (await persistedMap(page)).objects.map((o) => [o.id, { x: o.x, y: o.y }]),
  );
  await fold(page, 'right-a').click();
  await expect(card(page, 'deeper')).toHaveCount(0);
  await fold(page, 'right-a').click();
  await expect(card(page, 'deeper')).toBeVisible();
  await expect(fold(page, 'right-a')).toHaveAttribute('aria-expanded', 'true');
  const after = Object.fromEntries(
    (await persistedMap(page)).objects.map((o) => [o.id, { x: o.x, y: o.y }]),
  );
  expect(after).toEqual(before);
});

test('an undo takes a fold back', async ({ page }) => {
  await seed(page);
  await fold(page, 'right-a').click();
  await expect(card(page, 'deeper')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(card(page, 'deeper')).toBeVisible();
});

test('a fold survives a reload', async ({ page }) => {
  await seed(page);
  await fold(page, 'right-a').click();
  await expect
    .poll(
      async () =>
        (await persistedMap(page)).objects.find((o) => o.id === 'right-a')
          ?.collapsed,
    )
    .toBe(true);
  await page.reload();
  await expect(card(page, 'right-a')).toBeVisible();
  await expect(card(page, 'deeper')).toHaveCount(0);
  // Still one press away from coming back.
  await fold(page, 'right-a').click();
  await expect(card(page, 'deeper')).toBeVisible();
});

test('a card folded away is not left selected', async ({ page }) => {
  await seed(page);
  await card(page, 'deeper').click();
  await expect(card(page, 'deeper')).toHaveClass(/selected/);
  await fold(page, 'right-a').click();
  await expect(card(page, 'deeper')).toHaveCount(0);
  // Nothing invisible stays selected, so the context tools cannot act on it.
  await expect(page.locator('.canvas-object.selected')).toHaveCount(0);
});

test('a folded branch is not a drop target', async ({ page }) => {
  await seed(page);
  const hiddenSpot = (await card(page, 'right-a1').boundingBox())!;
  await fold(page, 'right-a').click();
  await expect(card(page, 'right-a1')).toHaveCount(0);
  const dragged = page.locator('[data-object="left-a"]');
  const from = (await dragged.boundingBox())!;
  await page.mouse.move(from.x + 40, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(
    hiddenSpot.x + hiddenSpot.width / 2,
    hiddenSpot.y + hiddenSpot.height / 2,
    { steps: 12 },
  );
  await expect(page.locator('.insertion-bar')).toHaveCount(0);
  await page.mouse.up();
  // Its parent is unchanged: there was nothing there to drop onto.
  const map = await persistedMap(page);
  expect(
    map.relationships.find(
      (e) => e.type === 'PATH' && e.targetId === 'left-a',
    )?.sourceId,
  ).toBe('root');
});

test('folding works the same on a free canvas', async ({ page }) => {
  await seed(page, 'canvas');
  const before = (await card(page, 'right-a').boundingBox())!;
  await fold(page, 'right-a').click();
  await expect(card(page, 'deeper')).toHaveCount(0);
  // Canvas mode never re-flows, so the card that folded has not moved.
  const after = (await card(page, 'right-a').boundingBox())!;
  expect(Math.round(after.x)).toBe(Math.round(before.x));
  expect(Math.round(after.y)).toBe(Math.round(before.y));
});

test('search brings back what it finds inside a fold', async ({ page }) => {
  await seed(page);
  await fold(page, 'right-a').click();
  await expect(card(page, 'deeper')).toHaveCount(0);
  await page.keyboard.press('Control+f');
  await page.getByPlaceholder('Find something in your vision').fill('Find my');
  await page.getByRole('option', { name: /Find my people/ }).click();
  await expect(card(page, 'deeper')).toBeVisible();
  await expect(card(page, 'deeper')).toHaveClass(/selected/);
  await expect(fold(page, 'right-a')).toHaveAttribute('aria-expanded', 'true');
});

test('captures a folded branch', async ({ page }) => {
  await seed(page);
  await page.locator('[title="Reset zoom to 100%"]').click();
  await page.locator('.canvas').click({ position: { x: 30, y: 30 } });
  await fold(page, 'right-a2').click();
  await expect(fold(page, 'right-a2')).toHaveText('1');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'evidence/collapse/folded-branch.png' });
});
