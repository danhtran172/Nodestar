import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { VisionMap } from '../../lib/graph';

const node = (id: string, x: number, y: number) => ({
  id,
  type: 'NODE',
  role: 'NORMAL',
  text: id,
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
  title: 'Graph layout fixture',
  anchorId: 'root',
  objects: [
    { ...node('root', 0, 0), role: 'GOAL', width: 280 },
    node('left-a', -900, -260),
    node('left-b', -880, 240),
    node('right-a', 880, -260),
    node('right-b', 900, 240),
    node('right-a1', 1700, -420),
    node('right-a2', 1680, -60),
  ],
  relationships: [
    { id: 'e1', sourceId: 'root', targetId: 'left-a', type: 'PATH' },
    { id: 'e2', sourceId: 'root', targetId: 'left-b', type: 'PATH' },
    { id: 'e3', sourceId: 'root', targetId: 'right-a', type: 'PATH' },
    { id: 'e4', sourceId: 'root', targetId: 'right-b', type: 'PATH' },
    { id: 'e5', sourceId: 'right-a', targetId: 'right-a1', type: 'PATH' },
    { id: 'e6', sourceId: 'right-a', targetId: 'right-a2', type: 'PATH' },
  ],
};
// Branch attachments, the way `connect` writes them for an authored map.
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

async function parentOf(page: Page, id: string) {
  const map = await persistedMap(page);
  const edge = map.relationships.find(
    (e) => e.type === 'PATH' && e.targetId === id,
  );
  return edge?.sourceId;
}

async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  const start = await center(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 14 });
  return async () => {
    await page.mouse.up();
  };
}

async function positions(page: Page) {
  const map = await persistedMap(page);
  return Object.fromEntries(
    map.objects.map((o) => [o.id, { x: o.x, y: o.y, width: o.width }]),
  );
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Object is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The snap frame glides to its slot, so read it once it has stopped moving. */
async function settledBox(locator: Locator) {
  let previous = await locator.boundingBox();
  for (let attempt = 0; attempt < 20; attempt++) {
    await locator.page().waitForTimeout(50);
    const current = await locator.boundingBox();
    if (
      previous &&
      current &&
      Math.abs(previous.x - current.x) < 0.5 &&
      Math.abs(previous.y - current.y) < 0.5
    )
      return current;
    previous = current;
  }
  throw new Error('The snap frame never settled.');
}

async function seed(page: Page, mode: 'graph' | 'canvas') {
  // Seeding only on a fresh origin lets a reload keep what the app wrote.
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
}

test('graph mode ranks the map into columns on open', async ({ page }) => {
  await seed(page, 'graph');
  await expect
    .poll(async () => (await positions(page))['left-a'].x)
    .not.toBe(-900);
  const at = await positions(page);
  expect(at['left-a'].x).toBe(at['left-b'].x);
  expect(at['right-a'].x).toBe(at['right-b'].x);
  expect(at['right-a1'].x).toBe(at['right-a2'].x);
  expect(at['left-a'].x + at['left-a'].width).toBeLessThanOrEqual(at.root.x);
  expect(at['right-a'].x).toBeGreaterThanOrEqual(at.root.x + at.root.width);
  // The anchor is the fixed point the branches fan out from.
  expect({ x: at.root.x, y: at.root.y }).toEqual({ x: 0, y: 0 });
});

test('canvas mode leaves the authored positions alone', async ({ page }) => {
  await seed(page, 'canvas');
  await expect(page.locator('[data-object="left-a"]')).toBeVisible();
  const at = await positions(page);
  expect({ x: at['left-a'].x, y: at['left-a'].y }).toEqual({
    x: -900,
    y: -260,
  });
});

test('a drop in graph mode previews its frame and snaps back to it', async ({
  page,
}) => {
  await seed(page, 'graph');
  await expect.poll(async () => (await positions(page))['right-a1'].x).toBe(
    (await positions(page))['right-a2'].x,
  );
  const before = await positions(page);
  const card = page.locator('[data-object="right-a1"]');
  const from = await center(card);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Small enough to stay inside its own frame, so the branch order is kept.
  await page.mouse.move(from.x - 22, from.y + 16, { steps: 12 });
  const frame = page.locator('.snap-frame');
  await expect(frame).toBeVisible();
  const previewed = await settledBox(frame);
  await page.mouse.up();
  await expect(frame).toHaveCount(0);
  const landed = await card.boundingBox();
  expect(Math.round(landed!.x)).toBe(Math.round(previewed.x));
  expect(Math.round(landed!.y)).toBe(Math.round(previewed.y));
  // A nudge inside its own frame is not a move, so the columns are unchanged.
  expect(await positions(page)).toEqual(before);
});

test('dropping above a sibling reorders that branch', async ({ page }) => {
  await seed(page, 'graph');
  await expect
    .poll(async () => (await positions(page))['right-a1'].x)
    .toBe((await positions(page))['right-a2'].x);
  const before = await positions(page);
  expect(before['right-a1'].y).toBeLessThan(before['right-a2'].y);
  const lower = page.locator('[data-object="right-a2"]');
  const upper = (await page
    .locator('[data-object="right-a1"]')
    .boundingBox())!;
  const release = await drag(page, lower, {
    x: upper.x + upper.width / 2,
    y: upper.y - 6,
  });
  await release();
  await expect
    .poll(async () => {
      const at = await positions(page);
      return at['right-a2'].y < at['right-a1'].y;
    })
    .toBe(true);
  const after = await positions(page);
  expect(after['right-a1'].x).toBe(after['right-a2'].x);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await positions(page))['right-a1'].y)
    .toBe(before['right-a1'].y);
});

test('switching modes sorts on the way in and frees placement on the way out', async ({
  page,
}) => {
  await seed(page, 'canvas');
  const canvasPlacement = await positions(page);
  expect(canvasPlacement['left-a'].x).toBe(-900);
  await page.locator('[aria-label="Graph mode"]').click();
  await expect
    .poll(async () => (await positions(page))['left-a'].x)
    .not.toBe(-900);
  await expect(page.locator('[aria-label="Graph mode"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const sorted = await positions(page);
  await page.locator('[aria-label="Canvas mode"]').click();
  const card = page.locator('[data-object="right-a2"]');
  const from = await center(card);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 220, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await positions(page))['right-a2'].y)
    .toBeGreaterThan(sorted['right-a2'].y + 100);
});

test('G toggles the mode and the choice survives a reload', async ({
  page,
}) => {
  await seed(page, 'graph');
  await page.locator('.canvas').click({ position: { x: 40, y: 40 } });
  await page.keyboard.press('g');
  await expect(page.locator('[aria-label="Canvas mode"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('nodestar-layout-mode')))
    .toBe('canvas');
  await page.reload();
  await expect(page.locator('[aria-label="Canvas mode"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('dropping onto a card makes the dragged node its child', async ({
  page,
}) => {
  await seed(page, 'graph');
  await expect
    .poll(async () => (await positions(page))['left-a'].x)
    .not.toBe(-900);
  expect(await parentOf(page, 'right-b')).toBe('root');
  const newParent = page.locator('[data-object="left-a"]');
  const onto = await center(newParent);
  const release = await drag(page, page.locator('[data-object="right-b"]'), onto);
  await expect(newParent).toHaveClass(/drop-target/);
  await expect(page.getByText('Release to make it a child')).toBeVisible();
  await release();
  await expect.poll(() => parentOf(page, 'right-b')).toBe('left-a');
  const at = await positions(page);
  // One rank further out than its new parent, on the same side.
  expect(at['right-b'].x).toBeLessThan(at['left-a'].x);
});

test('dropping between two cards makes the dragged node their sibling', async ({
  page,
}) => {
  await seed(page, 'graph');
  await expect
    .poll(async () => (await positions(page))['left-a'].x)
    .not.toBe(-900);
  expect(await parentOf(page, 'right-b')).toBe('root');
  const upper = (await page
    .locator('[data-object="right-a1"]')
    .boundingBox())!;
  const lower = (await page
    .locator('[data-object="right-a2"]')
    .boundingBox())!;
  const release = await drag(page, page.locator('[data-object="right-b"]'), {
    x: lower.x + lower.width / 2,
    y: (upper.y + upper.height + lower.y) / 2,
  });
  await expect(page.locator('.insertion-bar')).toBeVisible();
  await expect(
    page.getByText('Release to place it at the same level'),
  ).toBeVisible();
  await release();
  await expect.poll(() => parentOf(page, 'right-b')).toBe('right-a');
  const at = await positions(page);
  // Same rank as its new siblings, ranked between the two it was dropped into.
  expect(at['right-b'].x).toBe(at['right-a2'].x);
  expect(at['right-b'].y).toBeGreaterThan(at['right-a1'].y);
  expect(at['right-b'].y).toBeLessThan(at['right-a2'].y);
});

test('dropping below the last card ranks the dragged node after it', async ({
  page,
}) => {
  await seed(page, 'graph');
  await expect
    .poll(async () => (await positions(page))['left-a'].x)
    .not.toBe(-900);
  const last = (await page.locator('[data-object="right-a2"]').boundingBox())!;
  const release = await drag(page, page.locator('[data-object="right-b"]'), {
    x: last.x + last.width / 2,
    y: last.y + last.height + 6,
  });
  await expect(page.locator('.insertion-bar')).toBeVisible();
  await release();
  await expect.poll(() => parentOf(page, 'right-b')).toBe('right-a');
  const at = await positions(page);
  expect(at['right-b'].x).toBe(at['right-a2'].x);
  expect(at['right-b'].y).toBeGreaterThan(at['right-a2'].y);
});

test('a card cannot be dropped into its own branch', async ({ page }) => {
  await seed(page, 'graph');
  await expect
    .poll(async () => (await positions(page))['left-a'].x)
    .not.toBe(-900);
  const child = page.locator('[data-object="right-a1"]');
  const release = await drag(
    page,
    page.locator('[data-object="right-a"]'),
    await center(child),
  );
  await expect(child).not.toHaveClass(/drop-target/);
  await expect(page.locator('.insertion-bar')).toHaveCount(0);
  await release();
  await expect.poll(() => parentOf(page, 'right-a')).toBe('root');
  await expect.poll(() => parentOf(page, 'right-a1')).toBe('right-a');
});
