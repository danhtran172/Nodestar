import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { VisionMap } from '../../lib/graph';

test.use({
  viewport: { width: 1440, height: 1000 },
  video: { mode: 'on', size: { width: 1440, height: 1000 } },
});
const evidence = 'evidence/node-connections';
const object = (
  id: string,
  x: number,
  y: number,
  type: 'NODE' | 'IMAGINATION' | 'SEED_BOX' = 'NODE',
) => ({
  id,
  type,
  role: 'NORMAL' as const,
  text: id,
  note: `Content ${id}`,
  x,
  y,
  width: type === 'NODE' ? 210 : 310,
  height: type === 'NODE' ? 90 : 220,
  images: [],
  seeds: [],
  tier: 10,
  shuffle: 0.25,
  focal: 50,
  createdAt: 1,
  updatedAt: 1,
});
const fixture: VisionMap = {
  version: 1,
  title: 'Direct Node connections',
  anchorId: 'A',
  objects: [
    object('A', 100, 100),
    object('B', 520, 100),
    object('C', 940, 100),
    object('Seeds', 100, 350, 'SEED_BOX'),
    object('Image', 520, 350, 'IMAGINATION'),
  ],
  relationships: [{ id: 'B-C', sourceId: 'B', targetId: 'C', type: 'PATH' }],
};
const node = (page: Page, id: string) => page.locator(`[data-object="${id}"]`);
const dot = (page: Page) => page.locator('[data-relation-dot]');
async function center(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('Expected visible object');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function load(page: Page, map = fixture) {
  await page.addInitScript((map) => {
    localStorage.clear();
    // These specs cover free canvas placement; graph mode is exercised by
    // graph-layout.spec.ts.
    localStorage.setItem('nodestar-layout-mode', 'canvas');
    localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
    localStorage.setItem(
      'nodestar-viewport',
      JSON.stringify({ x: 80, y: 130, zoom: 1 }),
    );
  }, map);
  await page.goto('/');
  await expect(node(page, 'A')).toBeVisible();
  await page.locator('.zoom-value').click();
  await expect(page.locator('.zoom-value')).toHaveText('100%');
}
async function persisted(page: Page): Promise<VisionMap> {
  return page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('nodestar-recovery-v1')!);
    return saved.map || saved;
  });
}
async function enter(page: Page, id: string, side: 'left' | 'right' = 'left') {
  await page.mouse.move(30, 500);
  const b = (await node(page, id).boundingBox())!;
  await page.mouse.move(
    side === 'left' ? b.x + 8 : b.x + b.width - 8,
    b.y + b.height / 2,
  );
  await expect(dot(page)).toHaveAttribute('data-relation-dot', id);
  await expect(dot(page)).toHaveAttribute('data-side', side);
}
async function begin(page: Page, id: string, side: 'left' | 'right' = 'left') {
  await enter(page, id, side);
  const p = await center(dot(page));
  await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.down();
  // A press only becomes a path once it moves; until then it is a click.
  await expect(page.locator('[data-relation-preview]')).toHaveCount(0);
  await page.mouse.move(p.x + 10, p.y, { steps: 2 });
  await expect(page.locator('[data-relation-preview]')).toHaveCount(1);
}
async function moveTo(page: Page, id: string) {
  const p = await center(node(page, id));
  await page.mouse.move(p.x, p.y, { steps: 16 });
}
async function connectTo(
  page: Page,
  a: string,
  b: string,
  side: 'left' | 'right' = 'left',
) {
  await begin(page, a, side);
  await moveTo(page, b);
  await expect(node(page, b)).toHaveAttribute('data-relation-target', 'valid');
  await page.mouse.up();
  await expect(page.locator('[data-relation-preview]')).toHaveCount(0);
}
async function selectedIds(page: Page) {
  return page
    .locator('.canvas-object.selected')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.object));
}
async function boxes(page: Page) {
  return page.locator('[data-object]').evaluateAll((els) =>
    els.map((el) => ({
      id: (el as HTMLElement).dataset.object,
      x: (el as HTMLElement).style.left,
      y: (el as HTMLElement).style.top,
    })),
  );
}

test('D-093/D-094: one adaptive dot, stable hover, selected fallback, Node-only scope', async ({
  page,
}) => {
  await load(page);
  await expect(dot(page)).toHaveCount(0);
  await enter(page, 'A');
  const b = (await node(page, 'A').boundingBox())!;
  await page.mouse.move(b.x + b.width - 8, b.y + b.height / 2, { steps: 10 });
  await expect(dot(page)).toHaveAttribute('data-side', 'left');
  await enter(page, 'A', 'right');
  await node(page, 'A').click();
  await page.mouse.move(30, 500);
  await expect(dot(page)).toHaveCount(1);
  await expect(dot(page)).toHaveAttribute('data-relation-dot', 'A');
  await enter(page, 'B');
  await expect(dot(page)).toHaveCount(1);
  await page.mouse.click(30, 500);
  await expect(dot(page)).toHaveCount(0);
  for (const id of ['Seeds', 'Image']) {
    await node(page, id).hover();
    await expect(dot(page)).toHaveCount(0);
  }
});

test('D-008/D-041/D-095: direct gesture owns pointerdown and one undo/redo transaction', async ({
  page,
}) => {
  await load(page);
  await node(page, 'C').click();
  const selection = await selectedIds(page),
    before = await boxes(page);
  await page.keyboard.down('Shift');
  await page.keyboard.down('Control');
  await connectTo(page, 'A', 'B', 'right');
  await page.keyboard.up('Control');
  await page.keyboard.up('Shift');
  expect(await boxes(page)).toEqual(before);
  expect(await selectedIds(page)).toEqual(selection);
  await expect(
    page.locator('.marquee,.inline-editor,[role="dialog"]'),
  ).toHaveCount(0);
  const after = await persisted(page);
  expect(after.relationships).toHaveLength(2);
  const edge = after.relationships.find((e) => e.id !== 'B-C')!;
  expect(edge).toMatchObject({ sourceId: 'A', targetId: 'B', type: 'PATH' });
  await expect(
    page.locator(`[data-edge="${edge.id}"]`).locator('..').locator('.edge'),
  ).toHaveAttribute('marker-end', 'url(#arrow)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await persisted(page)).toEqual(fixture);
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await persisted(page)).toEqual(after);
  await expect(
    page.getByRole('button', { name: 'Redo', exact: true }),
  ).toBeDisabled();
  expect(await boxes(page)).toEqual(before);
});

test('D-012: invalid drops and Escape preserve map, history, selection and positions', async ({
  page,
}) => {
  await load(page);
  await connectTo(page, 'A', 'B');
  await node(page, 'B').click();
  const before = await persisted(page),
    positions = await boxes(page),
    selection = await selectedIds(page);
  const snapshot = await page.evaluate(() =>
    localStorage.getItem('nodestar-recovery-v1'),
  );
  for (const [from, to, reason] of [
    ['A', 'A', 'itself'],
    ['A', 'B', 'already'],
    ['C', 'A', 'circular'],
  ]) {
    await begin(page, from);
    await moveTo(page, to);
    await expect(node(page, to)).toHaveAttribute(
      'data-relation-target',
      'invalid',
    );
    await expect(page.locator('.drag-message[role="status"]')).toContainText(
      reason,
    );
    await page.mouse.up();
    expect(await persisted(page)).toEqual(before);
  }
  await begin(page, 'A');
  await page.mouse.move(40, 700, { steps: 8 });
  await page.mouse.up();
  await begin(page, 'C');
  await moveTo(page, 'Image');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(
    page.locator('[data-relation-preview],[data-relation-target]'),
  ).toHaveCount(0);
  expect(await selectedIds(page)).toEqual(selection);
  expect(await boxes(page)).toEqual(positions);
  expect(
    await page.evaluate(() => localStorage.getItem('nodestar-recovery-v1')),
  ).toEqual(snapshot);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await persisted(page)).toEqual(fixture);
});

test('dropping on Seed Box or Imagination creates its derived relation, while Nodes require their center point', async ({
  page,
}) => {
  await mkdir(evidence, { recursive: true });
  await load(page);
  await begin(page, 'A');
  const b = (await node(page, 'B').boundingBox())!;
  await page.mouse.move(b.x + 18, b.y + 18, { steps: 10 });
  await expect(node(page, 'B')).toHaveAttribute(
    'data-relation-candidate',
    'center',
  );
  await expect(node(page, 'B')).not.toHaveAttribute('data-relation-target');
  await expect(page.locator('[data-relation-target-dot="B"]')).toBeVisible();
  const end = await page.locator('[data-relation-preview]').evaluate((path) =>
    path
      .getAttribute('d')!
      .split(' ')
      .at(-1)!
      .split(',')
      .map(Number),
  );
  // Entering a node reveals its center target, but the preview must still
  // follow the pointer until it actually reaches that target.
  expect(end[0]).toBeCloseTo(538, 3);
  expect(end[1]).toBeCloseTo(118, 3);
  await expect(node(page, 'B').locator('.node-content')).toHaveCSS(
    'opacity',
    '0.22',
  );
  await page.waitForTimeout(220);
  await page.screenshot({
    path: `${evidence}/node-center-target.png`,
    fullPage: true,
  });
  await page.mouse.up();
  expect(await persisted(page)).toEqual(fixture);

  await connectTo(page, 'A', 'Seeds');
  await expect(page.locator('[data-relation-success="true"]')).toHaveCount(2);
  let map = await persisted(page);
  expect(map.relationships.at(-1)).toMatchObject({
    sourceId: 'A',
    targetId: 'Seeds',
    type: 'RELATED',
  });

  await connectTo(page, 'A', 'Image');
  map = await persisted(page);
  expect(map.relationships.at(-1)).toMatchObject({
    sourceId: 'Image',
    targetId: 'A',
    type: 'REFERENCE',
  });
});

test('pointercancel and lost capture clean up without a transaction', async ({
  page,
}) => {
  await load(page);
  for (const kind of ['pointercancel', 'lostpointercapture']) {
    await begin(page, 'A');
    await moveTo(page, 'B');
    await dot(page).evaluate(
      (el, kind) =>
        el.dispatchEvent(
          new PointerEvent(kind, { bubbles: true, pointerId: 1 }),
        ),
      kind,
    );
    await expect(
      page.locator('[data-relation-preview],[data-relation-target]'),
    ).toHaveCount(0);
    await page.mouse.up();
    expect(await persisted(page)).toEqual(fixture);
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true }),
    ).toBeDisabled();
  }
});

test('D-008/D-042: leftward drag remains source → target; dot never reverses an edge', async ({
  page,
}) => {
  await load(page);
  await connectTo(page, 'B', 'A');
  const map = await persisted(page);
  expect(map.relationships.at(-1)).toMatchObject({
    sourceId: 'B',
    targetId: 'A',
    type: 'PATH',
  });
  await begin(page, 'A', 'right');
  await moveTo(page, 'B');
  await expect(node(page, 'B')).toHaveAttribute(
    'data-relation-target',
    'invalid',
  );
  await page.mouse.up();
  expect(await persisted(page)).toEqual(map);
});

test('trackpad-style wheel zoom during mouse pointer capture keeps anchors and drop correct', async ({
  page,
}) => {
  await load(page);
  await begin(page, 'A');
  await page.mouse.move(480, 480);
  await page.mouse.wheel(0, 100);
  await expect(page.locator('.zoom-value')).not.toHaveText('100%');
  await moveTo(page, 'B');
  await expect(node(page, 'B')).toHaveAttribute(
    'data-relation-target',
    'valid',
  );
  await page.mouse.up();
  expect((await persisted(page)).relationships.at(-1)).toMatchObject({
    sourceId: 'A',
    targetId: 'B',
  });
  expect(await boxes(page)).toEqual(
    fixture.objects.map(({ id, x, y }) => ({ id, x: `${x}px`, y: `${y}px` })),
  );
});

test('touch Pointer Events commit through the same captured gesture', async ({
  page,
  context,
}) => {
  await load(page);
  await node(page, 'A').click();
  await page.mouse.move(30, 500);
  const from = await center(dot(page)),
    to = await center(node(page, 'B'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, id: 0 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: from.x + 12, y: from.y, id: 0 }],
  });
  await expect(page.locator('[data-relation-preview]')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: to.x, y: to.y, id: 0 }],
  });
  await expect(node(page, 'B')).toHaveAttribute(
    'data-relation-target',
    'valid',
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  expect((await persisted(page)).relationships.at(-1)).toMatchObject({
    sourceId: 'A',
    targetId: 'B',
    type: 'PATH',
  });
  expect(await selectedIds(page)).toEqual(['A']);
  await cdp.detach();
});

test('integration: dot bypasses normal canvas callbacks; deletion/unmount release capture', async ({
  page,
}) => {
  await load(page);
  // Vite transforms the test-only fixture, including the real NodestarCanvas and hook.
  await page.evaluate(async (map) => {
    const path = '/tests/fixtures/relation-gesture-harness.tsx';
    const { mountRelationHarness } = await import(/* @vite-ignore */ path);
    const harness = mountRelationHarness(map);
    Object.assign(window, { relationHarness: harness });
  }, fixture);
  const harness = page.locator('#relation-harness');
  await expect(harness.locator('[data-object="A"]')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector('main')!.style.visibility = 'hidden';
  });
  const zeroCalls = {
    select: 0,
    commit: 0,
    branch: 0,
    edit: 0,
    open: 0,
    create: 0,
  };
  const action = async (
    kind: 'calls' | 'replace' | 'unmount',
    map?: VisionMap,
  ) =>
    page.evaluate(
      ({ kind, map }) => {
        const api = (
          window as unknown as {
            relationHarness: {
              calls: typeof zeroCalls;
              replace: (map: VisionMap) => void;
              unmount: () => void;
            };
          }
        ).relationHarness;
        if (kind === 'replace') api.replace(map!);
        if (kind === 'unmount') api.unmount();
        return api.calls;
      },
      { kind, map },
    );
  // Helpers scope to the visible harness once the original app is removed from DOM selectors.
  await page.evaluate(() => document.querySelector('main')?.remove());
  for (const deletedId of ['A', 'B']) {
    await action('replace', fixture);
    await expect(node(page, 'A')).toBeVisible();
    await begin(page, 'A');
    await moveTo(page, 'B');
    expect(await action('calls')).toEqual(zeroCalls);
    const held = await dot(page).elementHandle();
    expect(await held!.evaluate((el) => el.hasPointerCapture(1))).toBe(true);
    await action('replace', {
      ...fixture,
      objects: fixture.objects.filter((o) => o.id !== deletedId),
      relationships: [],
    });
    await expect(
      page.locator('[data-relation-preview],[data-relation-target]'),
    ).toHaveCount(0);
    expect(await held!.evaluate((el) => el.hasPointerCapture(1))).toBe(false);
    await page.mouse.up();
    expect(await action('calls')).toEqual(zeroCalls);
  }
  await action('replace', fixture);
  await begin(page, 'A');
  const held = await dot(page).elementHandle();
  await action('unmount');
  expect(await held!.evaluate((el) => el.hasPointerCapture(1))).toBe(false);
  await page.mouse.up();
  expect(await action('calls')).toEqual(zeroCalls);
});

test('pen Pointer Events use source-to-target direction and one transaction', async ({
  page,
  context,
}) => {
  await load(page);
  await enter(page, 'A');
  const from = await center(dot(page)),
    to = await center(node(page, 'B'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: from.x,
    y: from.y,
    pointerType: 'pen',
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: from.x,
    y: from.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'pen',
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: from.x + 12,
    y: from.y,
    buttons: 1,
    pointerType: 'pen',
  });
  await expect(page.locator('[data-relation-preview]')).toHaveCount(1);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: to.x,
    y: to.y,
    buttons: 1,
    pointerType: 'pen',
  });
  await expect(node(page, 'B')).toHaveAttribute(
    'data-relation-target',
    'valid',
  );
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: to.x,
    y: to.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'pen',
  });
  expect((await persisted(page)).relationships.at(-1)).toMatchObject({
    sourceId: 'A',
    targetId: 'B',
    type: 'PATH',
  });
  await cdp.detach();
});

test('continuous QC recording: hover, selection, valid/invalid/cancel, fixed positions, undo/redo', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mkdir(evidence, { recursive: true });
  const dense: VisionMap = {
    ...fixture,
    objects: [
      ...fixture.objects.slice(0, 3),
      ...['D', 'E', 'F', 'G', 'H', 'I'].map((id, i) =>
        object(id, 100 + (i % 3) * 420, 320 + Math.floor(i / 3) * 220),
      ),
    ],
    relationships: [
      ...fixture.relationships,
      ...[
        ['D', 'B'],
        ['E', 'B'],
        ['F', 'C'],
        ['G', 'D'],
        ['H', 'D'],
        ['H', 'E'],
        ['I', 'E'],
        ['I', 'F'],
      ].map(([sourceId, targetId]) => ({
        id: `${sourceId}-${targetId}`,
        sourceId,
        targetId,
        type: 'PATH' as const,
      })),
    ],
  };
  await load(page, dense);
  const note = async (text: string) => {
    await page.evaluate((text) => {
      let el = document.getElementById('qc-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'qc-caption';
        el.style.cssText =
          'position:fixed;left:24px;top:140px;z-index:9999;background:#1e293b;color:white;padding:12px 18px;border-radius:8px;font:15px system-ui;pointer-events:none';
        document.body.appendChild(el);
      }
      el.textContent = text;
    }, text);
    await page.waitForTimeout(800);
  };
  await note('1. Enter A from left; cross A without changing the dot side.');
  await enter(page, 'A');
  const a = (await node(page, 'A').boundingBox())!;
  await page.mouse.move(a.x + a.width - 10, a.y + a.height / 2, { steps: 24 });
  await expect(dot(page)).toHaveAttribute('data-side', 'left');
  await note('2. Leave, then enter from right: exactly one dot on the right.');
  await enter(page, 'A', 'right');
  await note('3. Select A and leave: its dot remains discoverable.');
  await node(page, 'A').click();
  await page.mouse.move(30, 600);
  await expect(dot(page)).toHaveCount(1);
  const before = await boxes(page);
  await note('4. Drag A → B. Green target and preview before release.');
  await begin(page, 'A', 'right');
  await moveTo(page, 'B');
  await expect(node(page, 'B')).toHaveAttribute(
    'data-relation-target',
    'valid',
  );
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${evidence}/valid-preview.png` });
  await page.mouse.up();
  const after = await persisted(page);
  expect(after.relationships.at(-1)).toMatchObject({
    sourceId: 'A',
    targetId: 'B',
    type: 'PATH',
  });
  expect(await boxes(page)).toEqual(before);
  await note(
    'Verified: A → B committed; arrowhead at B; all 9 object x/y unchanged.',
  );
  await note('5. Drop on empty canvas: no edge or history transaction.');
  await begin(page, 'A');
  await page.mouse.move(45, 800, { steps: 22 });
  await page.waitForTimeout(800);
  await page.mouse.up();
  expect(await persisted(page)).toEqual(after);
  await note('6. Escape cancels a valid preview and preserves selected A.');
  await begin(page, 'A');
  await moveTo(page, 'F');
  await expect(node(page, 'F')).toHaveAttribute(
    'data-relation-target',
    'valid',
  );
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await selectedIds(page)).toEqual(['A']);
  expect(await persisted(page)).toEqual(after);
  for (const [from, to, label] of [
    ['A', 'A', '7. Self target is invalid; release cancels.'],
    ['C', 'A', '8. C → A would close A → B → C: invalid cycle.'],
  ]) {
    await note(label);
    await begin(page, from);
    await moveTo(page, to);
    await expect(node(page, to)).toHaveAttribute(
      'data-relation-target',
      'invalid',
    );
    await page.waitForTimeout(1100);
    if (from === 'C')
      await page.screenshot({ path: `${evidence}/invalid-cycle.png` });
    await page.mouse.up();
    expect(await persisted(page)).toEqual(after);
  }
  await note('9. Undo removes only A → B.');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await persisted(page)).toEqual(dense);
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeDisabled();
  await note(
    '10. Redo restores the same edge ID; content and positions unchanged.',
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await persisted(page)).toEqual(after);
  expect(await boxes(page)).toEqual(before);
  await page.evaluate(() => document.getElementById('qc-caption')?.remove());
  await page.mouse.move(40, 800);
  await page.screenshot({ path: `${evidence}/paths-100-percent.png` });
  for (let i = 0; i < 7; i++)
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.locator('.zoom-value')).toHaveText('38%');
  await page.mouse.move(40, 800);
  await page.screenshot({ path: `${evidence}/paths-38-percent.png` });
  await page.waitForTimeout(1500);
  const video = page.video()!;
  await page.close();
  await video.saveAs(`${evidence}/continuous-node-connection.webm`);
});

test('node handles: faded on hover, lit when the pointer is near, click passes through', async ({
  page,
}) => {
  await load(page);
  const card = node(page, 'A');
  const add = card.locator('[data-branch-plus]');
  await expect(add).toHaveCSS('opacity', '0');
  const b = (await card.boundingBox())!;
  // Anywhere on the card away from both handles: the add handle is faded
  // and the connect handle stays out of sight.
  await page.mouse.move(b.x + 12, b.y + 10, { steps: 4 });
  await expect(dot(page)).toHaveCSS('opacity', '0');
  await expect(add).toHaveCSS('opacity', '0.35');
  await expect(card).not.toHaveAttribute('data-near');
  // Close to the centre: the connect handle shows faded, the text steps back.
  await page.mouse.move(b.x + b.width / 2 + 26, b.y + b.height / 2, {
    steps: 4,
  });
  await expect(card).toHaveAttribute('data-near', 'connect');
  await expect(dot(page)).toHaveCSS('opacity', '0.35');
  await expect(card.locator('.node-content')).toHaveCSS('opacity', '0.35');
  // Right on the handle: fully up.
  const p = await center(dot(page));
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await expect(dot(page)).toHaveCSS('opacity', '1');
  // Near the right edge: the add handle lights up and the connect one hides.
  await page.mouse.move(b.x + b.width - 4, b.y + b.height / 2, { steps: 4 });
  await expect(card).toHaveAttribute('data-near', 'add');
  await expect(add).toHaveCSS('opacity', '1');
  await expect(dot(page)).toHaveCSS('opacity', '0');
  // A plain click on the centre handle selects the node and draws nothing.
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.up();
  expect(await selectedIds(page)).toEqual(['A']);
  expect(await persisted(page)).toEqual(fixture);
  // A double-click on it still edits the node's text.
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.locator('.inline-editor')).toHaveCount(1);
  await page.keyboard.press('Escape');
  // Leaving the card hides both again.
  await page.mouse.move(30, 700, { steps: 4 });
  await page.mouse.click(30, 700);
  await expect(add).toHaveCSS('opacity', '0');
  await expect(dot(page)).toHaveCount(0);
});
