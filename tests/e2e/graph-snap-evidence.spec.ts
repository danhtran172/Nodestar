import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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
  title: 'Snap preview',
  anchorId: 'root',
  objects: [
    { ...node('root', 'My New Mind Map', 0, 0), role: 'GOAL', width: 280 },
    node('left-a', 'A quieter week', -900, -300),
    node('left-b', 'Room to read', -880, 220),
    node('right-a', 'Make meaningful work', 880, -300),
    node('right-b', 'Find my people', 900, 220),
    node('right-a1', 'Ship the first version', 1700, -460),
    node('right-a2', 'Share what I make', 1680, -120),
    node('right-a3', 'Learn from the result', 1700, 60),
  ],
  relationships: [
    { id: 'e1', sourceId: 'root', targetId: 'left-a', type: 'PATH' },
    { id: 'e2', sourceId: 'root', targetId: 'left-b', type: 'PATH' },
    { id: 'e3', sourceId: 'root', targetId: 'right-a', type: 'PATH' },
    { id: 'e4', sourceId: 'root', targetId: 'right-b', type: 'PATH' },
    { id: 'e5', sourceId: 'right-a', targetId: 'right-a1', type: 'PATH' },
    { id: 'e6', sourceId: 'right-a', targetId: 'right-a2', type: 'PATH' },
    { id: 'e7', sourceId: 'right-a', targetId: 'right-a3', type: 'PATH' },
  ],
};

async function seed(page: Page) {
  await page.addInitScript((map) => {
    localStorage.clear();
    localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
    localStorage.setItem('nodestar-layout-mode', 'graph');
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="root"]')).toBeVisible();
}

// Labelled like a real map so the captured evidence reads as one.
async function left(page: Page) {
  return page.evaluate(() => {
    const value = JSON.parse(
      localStorage.getItem('nodestar-recovery-v1') || 'null',
    );
    return (value.map || value).objects.find(
      (o: { id: string }) => o.id === 'left-a',
    ).x as number;
  });
}

test('a graph-mode drag predicts its slot and the connection into it', async ({
  page,
}) => {
  await seed(page);
  await expect.poll(async () => (await left(page)) !== -900).toBe(true);
  await page.locator('[title="Reset zoom to 100%"]').click();
  const card = page.locator('[data-object="right-a3"]');
  const box = (await card.boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Open canvas: nothing to re-parent to, so only the slot it keeps is shown.
  await page.mouse.move(from.x + 60, from.y + 300, { steps: 16 });
  await expect(page.locator('.snap-frame')).toBeVisible();
  // One predicted connection: the one that ties the dragged card to its parent.
  await expect(page.locator('.snap-edge')).toHaveCount(1);
  // Its pointer-following copy is faded out rather than drawn twice.
  await expect(page.locator('g:has(path[data-edge="e7"])')).toHaveCSS(
    'opacity',
    '0.12',
  );
  await page.waitForTimeout(200);
  await page.screenshot({
    path: 'evidence/graph-snap-preview/drag-predicted-position.png',
  });
  await page.mouse.up();
});

test('a drop onto a card predicts the child slot it would take', async ({
  page,
}) => {
  await seed(page);
  await expect
    .poll(async () => (await left(page)) !== -900)
    .toBe(true);
  await page.locator('[title="Reset zoom to 100%"]').click();
  const parent = page.locator('[data-object="right-a1"]');
  const onto = (await parent.boundingBox())!;
  const box = (await page.locator('[data-object="right-a3"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(onto.x + onto.width / 2, onto.y + onto.height / 2, {
    steps: 16,
  });
  await expect(parent).toHaveClass(/drop-target/);
  await expect(page.locator('.snap-frame')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: 'evidence/graph-snap-preview/drop-onto-card-child.png',
  });
  await page.mouse.up();
});

test('a drop between two cards predicts the rank it would take', async ({
  page,
}) => {
  await seed(page);
  await expect
    .poll(async () => (await left(page)) !== -900)
    .toBe(true);
  await page.locator('[title="Reset zoom to 100%"]').click();
  const upper = (await page
    .locator('[data-object="right-a1"]')
    .boundingBox())!;
  const lower = (await page
    .locator('[data-object="right-a2"]')
    .boundingBox())!;
  const box = (await page.locator('[data-object="right-a3"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    lower.x + lower.width / 2,
    (upper.y + upper.height + lower.y) / 2,
    { steps: 16 },
  );
  await expect(page.locator('.insertion-bar')).toBeVisible();
  await expect(page.locator('.snap-frame')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: 'evidence/graph-snap-preview/drop-between-cards-sibling.png',
  });
  await page.mouse.up();
});
