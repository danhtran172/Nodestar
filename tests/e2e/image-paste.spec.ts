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
    // These specs cover free canvas placement; graph mode is exercised by
    // graph-layout.spec.ts.
    localStorage.setItem('nodestar-layout-mode', 'canvas');
    localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
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

test('Imagination collage is gapless and its frame fits the image grid', async ({
  page,
}) => {
  const imagination = page.locator('[data-object="imagination"]');
  const tiles = imagination.locator('.image-slot');
  await imagination.focus();
  await page.keyboard.press(' ');
  let firstLargeWidth = 0;
  for (let count = 1; count <= 6; count++) {
    await pasteImage(page);
    await expect(tiles).toHaveCount(count);
    if (count === 1) {
      const large = await tiles.nth(0).boundingBox();
      if (!large) throw new Error('Expected the initial large tile');
      firstLargeWidth = large.width;
    }
    if (count === 4) {
      const large = await tiles.nth(0).boundingBox();
      const side = await tiles.nth(1).boundingBox();
      const lowerCenter = await tiles.nth(2).boundingBox();
      if (!large || !side || !lowerCenter)
        throw new Error('Expected four-image collage');
      expect(side.y).toBeGreaterThan(large.y + large.height * 0.45);
      expect(lowerCenter.x).toBeGreaterThan(large.x + large.width * 0.45);
      expect(lowerCenter.y).toBeCloseTo(large.y + large.height, 0);
    }
  }
  await expect(tiles).toHaveCount(6);
  const large = await tiles.nth(0).boundingBox();
  const small = await tiles.nth(1).boundingBox();
  const frame = await imagination.boundingBox();
  if (!large || !small || !frame) throw new Error('Expected Imagination collage');
  expect(large.width).toBeCloseTo(large.height, 0);
  expect(small.width).toBeCloseTo(small.height, 0);
  // The 1px card border can contribute a fractional device pixel when the
  // frame grows from two to three columns; the primary tile stays stable.
  expect(Math.abs(large.width - firstLargeWidth)).toBeLessThan(1);
  expect(small.x).toBeCloseTo(large.x + large.width, 0);
  expect(small.width / large.width).toBeCloseTo(0.5, 2);
  expect(frame.width).toBeCloseTo(frame.height, 0);
});

test('Imagination switches between equal tiles and the collage layout', async ({
  page,
}) => {
  const imagination = page.locator('[data-object="imagination"]');
  await imagination.focus();
  await page.keyboard.press(' ');
  const tiles = imagination.locator('.image-slot');
  for (let count = 1; count <= 3; count++) {
    await pasteImage(page);
    await expect(tiles).toHaveCount(count);
  }

  await imagination.click({ button: 'right' });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const layout = page
    .locator('.field-label')
    .filter({ hasText: 'Image layout' })
    .locator('select');
  await layout.selectOption('uniform');
  await expect(imagination.locator('.image-grid')).toHaveClass(/imagination-layout-uniform/);
  const equalA = await tiles.nth(0).boundingBox();
  const equalB = await tiles.nth(1).boundingBox();
  if (!equalA || !equalB) throw new Error('Expected equal image tiles');
  expect(equalA.width).toBeCloseTo(equalB.width, 0);

  await layout.selectOption('collage');
  await expect(imagination.locator('.image-grid')).toHaveClass(/imagination-layout-collage/);
  const large = await tiles.nth(0).boundingBox();
  const small = await tiles.nth(1).boundingBox();
  if (!large || !small) throw new Error('Expected collage image tiles');
  expect(large.width).toBeGreaterThan(small.width);
});

for (const [id, label] of [
  ['node', 'Node'],
  ['goal', 'Goal'],
  ['imagination', 'Imagination'],
] as const) {
  test(`${label} single selection accepts image paste`, async ({ page }) => {
    const target = page.locator(`[data-object="${id}"]`);
    if (id === 'imagination') {
      await target.focus();
      await page.keyboard.press(' ');
      await expect(target).toHaveClass(/selected/);
    } else await select(target);
    await pasteImage(page);
    await expect(target.locator('img')).toHaveCount(1);
    if (id === 'imagination') {
      const tile = await target.locator('.image-slot').boundingBox();
      if (!tile) throw new Error('Expected an Imagination image tile');
      expect(tile.width).toBeCloseTo(tile.height, 0);
    }
  });
}

test('Node image zooms with the wheel and moves by dragging in Details', async ({ page }) => {
  const node = page.locator('[data-object="node"]');
  await select(node);
  await pasteImage(page);
  await expect(node.locator('img')).toHaveCount(1);
  await expect(page.getByText('Saving image…')).toHaveCount(0);

  await node.click({ button: 'right' });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const editor = page.getByRole('button', {
    name: 'Drag to move the image, scroll to zoom',
  });
  await editor.scrollIntoViewIfNeeded();
  const box = await editor.boundingBox();
  if (!box) throw new Error('Expected crop editor');
  // The test picture is square like its frame, so at the cover fit there is
  // nothing to drag into view: zoom in first.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Each wheel notch zooms by a fixed step, so several notches are needed.
  for (let notch = 0; notch < 3; notch++) await page.mouse.wheel(0, -120);
  await expect(editor).toHaveAttribute('data-crop', /^50,50,[2-9]/);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, {
    steps: 8,
  });
  await page.mouse.up();
  // Dragging the picture down and to the right brings its upper-left into view.
  await expect(editor).toHaveAttribute('data-crop', /^[0-3][0-9],[0-3][0-9],/);

  const crop = () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('nodestar-recovery-v1') || '{}');
    const map = saved.map || saved;
    const object = map.objects.find((entry: { id: string }) => entry.id === 'node');
    return { ...object.crops[object.images[0]], focal: object.focal, focalX: object.focalX };
  });
  await expect.poll(async () => (await crop()).scale).toBeGreaterThan(1.5);
  expect((await crop()).x).toBeLessThan(40);
  expect((await crop()).y).toBeLessThan(40);
  // The node card on the canvas is framed by the same crop.
  await expect(node.locator('.node-thumbnail img')).toHaveCSS('transform', /matrix\(/);
  // The older focal fields follow along for anything still reading them.
  expect((await crop()).focalX).toBeLessThan(40);

  await page.getByRole('button', { name: 'Reset crop' }).click();
  await expect(editor).toHaveAttribute('data-crop', '50,50,1');
});

test('Imagination keeps its image tiles square while its external arc resizes the fitted frame', async ({
  page,
}) => {
  const imagination = page.locator('[data-object="imagination"]');
  // Imagination has an external title above its card, so select through the
  // card's keyboard gesture rather than clicking that title area.
  await imagination.focus();
  await page.keyboard.press(' ');
  await expect(imagination).toHaveClass(/selected/);
  await pasteImage(page);
  await expect(page.getByText('Saving image…')).toHaveCount(0);
  // Keep the external lower-right arc clear of the persistent canvas tools.
  await page.keyboard.down(' ');
  await page.mouse.move(1100, 360);
  await page.mouse.down();
  await page.mouse.move(1100, 90, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up(' ');
  const tile = imagination.locator('.image-slot');
  await expect(tile).toBeVisible();
  const before = await imagination.boundingBox();
  const grip = imagination.locator('[data-resize]');
  await expect(grip).toBeVisible();
  const gripBox = await grip.boundingBox();
  if (!before || !gripBox) throw new Error('Expected Imagination resize arc');

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2 + 100, gripBox.y + gripBox.height / 2 + 24, {
    steps: 8,
  });
  await page.mouse.up();

  const after = await imagination.boundingBox();
  const resizedTile = await tile.boundingBox();
  if (!after || !resizedTile) throw new Error('Expected resized Imagination');
  expect(after.width).toBeGreaterThan(before.width + 80);
  expect(resizedTile.width).toBeCloseTo(resizedTile.height, 0);
  expect(Math.abs(after.height - resizedTile.height)).toBeLessThanOrEqual(2);
});

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
