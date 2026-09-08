import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const object = (
  id: string,
  text: string,
  x: number,
  y: number,
  type = 'NODE',
  role = 'NORMAL',
) => ({
  id,
  type,
  role,
  text,
  note: '',
  x,
  y,
  width: role === 'GOAL' ? 280 : type === 'NODE' ? 210 : 310,
  height: type === 'NODE' ? 90 : 240,
  images: [],
  seeds:
    type === 'SEED_BOX'
      ? [{ id: `${id}-seed`, text: 'A loose idea', visualSeed: 0.3 }]
      : [],
  tier: 10,
  shuffle: 0.25,
  focal: 50,
  createdAt: 1,
  updatedAt: 1,
});

const fixture = {
  version: 1,
  title: 'Image fixture',
  anchorId: 'node',
  objects: [
    object('node', 'Node', 0, 0),
    object('other', 'Other node', 360, 0),
    object('goal', 'Goal', 720, 0, 'NODE', 'GOAL'),
    object('imagination', 'Imagination', 0, 300, 'IMAGINATION'),
    object('seed-box', 'Seed Box', 420, 300, 'SEED_BOX'),
  ],
  relationships: [],
};

const imageBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function imageDataTransfer(page: Page) {
  return page.evaluateHandle((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'pixel.png', { type: 'image/png' }));
    return transfer;
  }, imageBase64);
}

async function pasteImage(page: Page) {
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'pixel.png', { type: 'image/png' }));
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    window.dispatchEvent(event);
  }, imageBase64);
}

async function select(locator: Locator) {
  await locator.click({ position: { x: 6, y: 6 } });
  await expect(locator).toHaveClass(/selected/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((map) => {
    localStorage.clear();
    localStorage.setItem('spread-recovery-v1', JSON.stringify(map));
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="node"]')).toBeVisible();
});

test('D-077 rejects image paste for multi-selection without mutation', async ({
  page,
}) => {
  await select(page.locator('[data-object="node"]'));
  await page.locator('[data-object="other"]').click({ modifiers: ['Control'] });
  await expect(page.locator('.canvas-object.selected')).toHaveCount(2);
  const before = await page.locator('.canvas-object').count();

  await pasteImage(page);

  await expect(
    page.getByText(
      'Select one object to add this image, or clear selection to create an Imagination.',
      { exact: true },
    ),
  ).toHaveCount(1);
  await expect(page.locator('.canvas-object')).toHaveCount(before);
  await expect(page.locator('.canvas-object.selected')).toHaveCount(2);
  await expect(page.getByLabel('Undo')).toBeDisabled();
  await expect(page.getByText('Saving image…')).toHaveCount(0);
});

test('clear selection paste creates an unconnected Imagination', async ({ page }) => {
  const before = await page.locator('.canvas-object.imagination').count();
  await pasteImage(page);
  await expect(page.locator('.canvas-object.imagination')).toHaveCount(
    before + 1,
  );
  await expect(page.locator('.edge')).toHaveCount(0);
});

for (const [id, label] of [
  ['node', 'Node'],
  ['goal', 'Goal'],
  ['imagination', 'Imagination'],
] as const) {
  test(`${label} single selection accepts image paste`, async ({ page }) => {
    const target = page.locator(`[data-object="${id}"]`);
    await select(target);
    await pasteImage(page);
    await expect(target.locator('img')).toHaveCount(1);
  });
}

test('Seed Box paste creates a nearby Imagination', async ({ page }) => {
  const before = await page.locator('.canvas-object.imagination').count();
  await select(page.locator('[data-object="seed-box"]'));
  await pasteImage(page);
  await expect(page.locator('.canvas-object.imagination')).toHaveCount(
    before + 1,
  );
});

test('direct drop target overrides current multi-selection', async ({ page }) => {
  const target = page.locator('[data-object="node"]');
  await select(target);
  await page.locator('[data-object="other"]').click({ modifiers: ['Control'] });
  const transfer = await imageDataTransfer(page);
  await target.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(target.locator('img')).toHaveCount(1);
  await expect(page.locator('.canvas-object.imagination')).toHaveCount(1);
});
