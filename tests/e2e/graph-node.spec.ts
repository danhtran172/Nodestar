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

const mainMap = {
  version: 1,
  title: 'My next chapter',
  anchorId: 'goal',
  objects: [
    { ...node('goal', 'A life with room', 0, 0), role: 'GOAL', width: 280 },
    { ...node('middle', 'Make meaningful work', 420, 0), attachment: 'e1' },
  ],
  relationships: [
    { id: 'e1', sourceId: 'goal', targetId: 'middle', type: 'PATH' },
  ],
};
const sideMap = {
  version: 1,
  title: 'Studio plans',
  anchorId: 'studio-goal',
  objects: [
    {
      ...node('studio-goal', 'Build my own studio', 0, 0),
      role: 'GOAL',
      width: 280,
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

async function seed(page: Page, { withSideMap = true } = {}) {
  await page.addInitScript(
    ({ main, side, second }) => {
      if (localStorage.getItem('nodestar-recovery-v1')) return;
      localStorage.clear();
      localStorage.setItem('nodestar-recovery-v1', JSON.stringify(main));
      localStorage.setItem('nodestar-layout-mode', 'canvas');
      const now = Date.now();
      const entries = [
        {
          id: 'entry-main',
          title: main.title,
          createdAt: now,
          updatedAt: now,
          archived: false,
          map: main,
        },
      ];
      if (second)
        entries.push({
          id: 'entry-side',
          title: side.title,
          createdAt: now,
          updatedAt: now,
          archived: false,
          map: side,
        });
      localStorage.setItem(
        'nodestar-catalog-seed',
        JSON.stringify({ version: 1, activeId: 'entry-main', entries }),
      );
    },
    { main: mainMap, side: sideMap, second: withSideMap },
  );
  // The catalog lives in the `maps` store under the `catalog` key; plant it
  // before the app reads it, and wait so the read cannot win the race.
  await page.addInitScript(() => {
    const raw = localStorage.getItem('nodestar-catalog-seed');
    if (!raw) return;
    (
      window as unknown as { __catalogSeeded: Promise<void> }
    ).__catalogSeeded = new Promise<void>((resolve) => {
      const open = indexedDB.open('nodestar-workspace', 2);
      open.onupgradeneeded = () => {
        const { objectStoreNames } = open.result;
        if (!objectStoreNames.contains('maps'))
          open.result.createObjectStore('maps');
        if (!objectStoreNames.contains('assets'))
          open.result.createObjectStore('assets');
      };
      open.onsuccess = () => {
        const write = open.result
          .transaction('maps', 'readwrite')
          .objectStore('maps')
          .put(JSON.parse(raw), 'catalog');
        write.onsuccess = () => resolve();
        write.onerror = () => resolve();
      };
      open.onerror = () => resolve();
    });
  });
  await page.goto('/');
  await expect(page.locator('[data-object="goal"]')).toBeVisible();
}

const picker = (page: Page) => page.locator('.graph-link-dialog');
const graphCard = (page: Page) => page.locator('.canvas-object.graph');

/** Maps are switched from All Maps, which is where the catalog is listed. */
async function openAllMaps(page: Page) {
  await page.locator('.map-title').click();
  await page.getByRole('menuitem', { name: 'All Maps' }).click();
  return page.locator('.all-maps-list');
}
async function switchTo(page: Page, title: string) {
  const list = await openAllMaps(page);
  await list.locator('.map-row-open', { hasText: title }).click();
}

async function openAddMenu(page: Page, id: string) {
  const card = page.locator(`[data-object="${id}"]`);
  await card.click();
  await card.locator('[data-branch-plus]').click({ button: 'right' });
  await page
    .locator('.object-context-menu')
    .getByRole('button', { name: 'Graph', exact: true })
    .click();
}

test('creating a Graph object offers the graphs already here', async ({
  page,
}) => {
  await seed(page);
  await openAddMenu(page, 'middle');
  await expect(picker(page)).toBeVisible();
  const row = picker(page).locator('.graph-link-row');
  await expect(row).toHaveCount(1);
  // Each row names the central goal, then the map it belongs to.
  await expect(row).toContainText('Build my own studio');
  await expect(row).toContainText('Studio plans');
  await row.click();
  await expect(picker(page)).toHaveCount(0);
  await expect(graphCard(page)).toBeVisible();
  // Only the linked map's central goal is shown.
  await expect(graphCard(page)).toContainText('Build my own studio');
  const map = await persistedMap(page);
  const made = map.objects.find((o) => o.type === 'GRAPH');
  expect(made?.mapRef).toBe('entry-side');
  // It stands on a path, like the node it represents.
  expect(
    map.relationships.find(
      (e) => e.sourceId === made!.id || e.targetId === made!.id,
    )?.type,
  ).toBe('PATH');
});

test('creating a new graph makes the map it will open', async ({ page }) => {
  await seed(page, { withSideMap: false });
  await openAddMenu(page, 'middle');
  await expect(picker(page)).toBeVisible();
  await expect(picker(page).locator('.graph-link-row')).toHaveCount(0);
  await picker(page).getByLabel('New graph goal').fill('A studio of my own');
  await picker(page).getByRole('button', { name: 'Create graph' }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(graphCard(page)).toContainText('A studio of my own');
  // The new graph is in the workspace, holding just that central goal.
  const list = await openAllMaps(page);
  const made = list.locator('.map-row', { hasText: 'A studio of my own' });
  await expect(made).toHaveCount(1);
  await expect(made).toContainText('1 objects');
  await made.locator('.map-row-open').click();
  await expect
    .poll(async () => (await persistedMap(page)).objects.length)
    .toBe(1);
  const only = (await persistedMap(page)).objects[0];
  expect({ type: only.type, role: only.role, text: only.text }).toEqual({
    type: 'NODE',
    role: 'GOAL',
    text: 'A studio of my own',
  });
});

test('clicking a Graph object asks before moving across', async ({ page }) => {
  await seed(page);
  await openAddMenu(page, 'middle');
  await picker(page).locator('.graph-link-row').click();
  await expect(graphCard(page)).toBeVisible();
  await graphCard(page).click();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('Move to Build my own studio?');
  // Declining leaves this map exactly where it was.
  await ask.getByRole('button', { name: 'Stay here' }).click();
  await expect(ask).toHaveCount(0);
  expect((await persistedMap(page)).title).toBe('My next chapter');
  await graphCard(page).click();
  await page.getByRole('button', { name: 'Open graph' }).click();
  await expect
    .poll(async () => (await persistedMap(page)).title)
    .toBe('Studio plans');
  await expect(page.locator('[data-object="studio-goal"]')).toBeVisible();
});

test('a Graph object follows the goal of the map it opens', async ({
  page,
}) => {
  await seed(page);
  await openAddMenu(page, 'middle');
  await picker(page).locator('.graph-link-row').click();
  await expect(graphCard(page)).toContainText('Build my own studio');
  // Rename the goal over there, and the card here reads the new name.
  await graphCard(page).click();
  await page.getByRole('button', { name: 'Open graph' }).click();
  await expect(page.locator('[data-object="studio-goal"]')).toBeVisible();
  await page.locator('[data-object="studio-goal"]').dblclick();
  await page.locator('.inline-editor').fill('A studio by the water');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await persistedMap(page)).objects[0].text)
    .toBe('A studio by the water');
  await switchTo(page, 'My next chapter');
  await expect(graphCard(page)).toContainText('A studio by the water');
});

test('dragging a Graph object ranks it like any other node', async ({
  page,
}) => {
  await seed(page);
  await openAddMenu(page, 'middle');
  await picker(page).locator('.graph-link-row').click();
  await expect(graphCard(page)).toBeVisible();
  // The picker overlay swallows raw pointer events until it is fully gone.
  await graphCard(page).hover();
  const before = await graphCard(page).boundingBox();
  await page.mouse.move(before!.x + 40, before!.y + 20);
  await page.mouse.down();
  await page.mouse.move(before!.x + 200, before!.y + 160, { steps: 10 });
  await page.mouse.up();
  const after = await graphCard(page).boundingBox();
  expect(after!.y).toBeGreaterThan(before!.y + 80);
  // Canvas mode keeps it exactly where it was dropped, link intact.
  const map = await persistedMap(page);
  expect(map.objects.find((o) => o.type === 'GRAPH')?.mapRef).toBe(
    'entry-side',
  );
});

test('captures a Graph object standing in for another map', async ({
  page,
}) => {
  await seed(page);
  await openAddMenu(page, 'middle');
  await picker(page).locator('.graph-link-row').click();
  await expect(graphCard(page)).toBeVisible();
  await graphCard(page).hover();
  await page.locator('[title="Reset zoom to 100%"]').click();
  await page.locator('.canvas').click({ position: { x: 30, y: 30 } });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'evidence/graph-node/linked-graph-card.png' });
  await graphCard(page).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'evidence/graph-node/open-graph-prompt.png' });
  await page.getByRole('button', { name: 'Stay here' }).click();
});
