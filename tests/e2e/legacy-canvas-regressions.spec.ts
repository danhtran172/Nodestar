import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { VisionMap } from '../../lib/graph';

const seed = { id: 'seed-1', text: 'Keep this loose', visualSeed: 0.2 };
const fixture: VisionMap = {
  version: 1,
  title: 'Legacy canvas',
  anchorId: 'node',
  objects: [
    {
      id: 'node',
      type: 'NODE',
      role: 'NORMAL',
      text: 'Existing Node',
      note: '',
      x: 80,
      y: 80,
      width: 210,
      height: 90,
      images: [],
      seeds: [],
      tier: 10,
      shuffle: 0.25,
      focal: 50,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'box',
      type: 'SEED_BOX',
      role: 'NORMAL',
      text: 'Loose ideas',
      note: '',
      x: 80,
      y: 300,
      width: 310,
      height: 240,
      images: [],
      seeds: [seed],
      tier: 10,
      shuffle: 0.25,
      focal: 50,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'image',
      type: 'IMAGINATION',
      role: 'NORMAL',
      text: 'Mood board',
      note: '',
      x: 460,
      y: 300,
      width: 310,
      height: 240,
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

async function mapOnDisk(page: Page): Promise<VisionMap> {
  return page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem('nodestar-recovery-v1') || 'null',
    );
    return stored.map || stored;
  });
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
  await expect(page.locator('[data-object="box"]')).toBeVisible();
});

test('All Maps remains available from the canvas menu', async ({ page }) => {
  await page.getByRole('button', { name: 'Legacy canvas' }).click();
  await page.getByRole('menuitem', { name: 'All Maps' }).click();
  await expect(page.getByRole('dialog')).toContainText('All Maps');
  await expect(page.getByRole('dialog')).toContainText('Legacy canvas');
});

test('non-Node kind labels reveal on hover while titles stay below the card', async ({
  page,
}) => {
  for (const [id, type, title] of [
    ['box', 'SEED_BOX', 'Loose ideas'],
    ['image', 'IMAGINATION', 'Mood board'],
  ]) {
    const card = page.locator(`[data-object="${id}"]`);
    const badge = card.locator(`[data-object-kind="${type}"]`);
    const name = badge.locator('.object-kind-name');
    const objectTitle = card.locator(`[data-object-title="${id}"]`);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveCSS('opacity', '0');
    await card.hover();
    await expect(badge).toHaveCSS('opacity', '1');
    await expect(name).toBeVisible();
    await expect(objectTitle).toHaveText(title);
    await expect(objectTitle).toHaveCSS('opacity', '1');
  }
  await page.mouse.move(20, 700);
  const boxBadge = page.locator(
    '[data-object="box"] [data-object-kind="SEED_BOX"]',
  );
  await page.locator('[data-object="box"]').click();
  await expect(boxBadge).toHaveCSS('opacity', '1');
});

test('a hidden non-Node title appears only while its card is hovered', async ({ page }) => {
  const hiddenTitleFixture = structuredClone(fixture);
  hiddenTitleFixture.objects.find((object) => object.id === 'box')!.displayTitle = false;
  await page.addInitScript((map) => {
    localStorage.clear();
    // These specs cover free canvas placement; graph mode is exercised by
    // graph-layout.spec.ts.
    localStorage.setItem('nodestar-layout-mode', 'canvas');
    localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
  }, hiddenTitleFixture);
  await page.reload();

  const card = page.locator('[data-object="box"]');
  const title = card.locator('[data-object-title="box"]');
  await page.mouse.move(20, 700);
  await expect(title).toHaveCSS('opacity', '0');
  await card.hover();
  await expect(title).toHaveCSS('opacity', '1');
});

test('Details can hide or clear a non-Node title', async ({ page }) => {
  const card = page.locator('[data-object="box"]');
  const title = card.locator('[data-object-title="box"]');
  await card.click({ button: 'right' });
  await page.getByRole('button', { name: 'Details', exact: true }).click();

  const visibility = page.getByLabel('Display title below card');
  await expect(visibility).toBeChecked();
  await visibility.uncheck();
  await page.mouse.move(20, 700);
  await expect(title).toHaveCSS('opacity', '0');

  const titleInput = page.locator('.detail-panel textarea.detail-input').first();
  await titleInput.fill('');
  await titleInput.blur();
  await expect(title).toHaveCount(0);
  expect(
    (await mapOnDisk(page)).objects.find((object) => object.id === 'box')!.text,
  ).toBe('');
});

test('dragging a Seed body does not turn it into a Node; only its conversion handle does', async ({
  page,
}) => {
  const body = page.locator('[data-seed]');
  const before = await mapOnDisk(page);
  const box = await body.boundingBox();
  if (!box) throw new Error('Seed is not visible');
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 120, { steps: 12 });
  await page.mouse.up();
  const afterBodyDrag = await mapOnDisk(page);
  expect(afterBodyDrag.objects).toEqual(
    before.objects.map((object) =>
      object.id === 'box'
        ? {
            ...object,
            shuffle: afterBodyDrag.objects.find((item) => item.id === 'box')!
              .shuffle,
          }
        : object,
    ),
  );
  expect(afterBodyDrag.relationships).toEqual(before.relationships);
  await expect(page.locator('[data-object]')).toHaveCount(3);
  await expect(body).toHaveCount(1);

  const handle = page.locator('[data-seed-convert]');
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error('Seed conversion handle is not visible');
  // The strip above the Imagination is the one stretch of this fixture that
  // no card covers, so a drop there is unambiguously "onto the canvas".
  const moodBoard = await page.locator('[data-object="image"]').boundingBox();
  if (!moodBoard) throw new Error('Imagination is not visible');
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(moodBoard.x + moodBoard.width / 2, moodBoard.y - 40, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(async () => (await mapOnDisk(page)).objects.length).toBe(4);
  expect(
    (await mapOnDisk(page)).objects.some(
      (object) => object.text === seed.text && object.type === 'NODE',
    ),
  ).toBe(true);
});
