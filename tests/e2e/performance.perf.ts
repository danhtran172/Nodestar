import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { performanceFixture } from './performance-fixture';

type Metric = { name: string; value: number };
type InteractionResult = {
  frames: number[];
  longTasks: number[];
  objectRenders: number;
  edgeRenders: number;
  commits: { actualDuration: number; baseDuration: number }[];
  layoutMs: number;
  styleMs: number;
};

const percentile = (values: number[], value: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] || 0;
};

async function performanceMetrics(session: CDPSession) {
  const result = (await session.send('Performance.getMetrics')) as {
    metrics: Metric[];
  };
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}

async function seed(page: Page, count: number) {
  const fixture = performanceFixture(count);
  await page.goto('/');
  await page.evaluate(async ({ map, assets }) => {
    localStorage.clear();
    // These specs cover free canvas placement; graph mode is exercised by
    // graph-layout.spec.ts.
    localStorage.setItem('nodestar-layout-mode', 'canvas');
    localStorage.setItem(
      'nodestar-recovery-v1',
      JSON.stringify({ schemaVersion: 1, revision: 1, savedAt: 1, map }),
    );
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('nodestar-workspace', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction(['maps', 'assets'], 'readwrite');
        transaction.objectStore('maps').put(
          { schemaVersion: 1, revision: 1, savedAt: 1, map },
          'current',
        );
        for (const asset of assets) transaction.objectStore('assets').put(asset);
        transaction.oncomplete = () => {
          open.result.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, fixture);
  await page.reload();
  await expect(page.locator('[data-object="node-0"]')).toBeVisible();
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function measure(
  page: Page,
  session: CDPSession,
  action: () => Promise<void>,
): Promise<InteractionResult> {
  const before = await performanceMetrics(session);
  await page.evaluate(() => {
    window.__nodestarPerformanceProbe = { objectRenders: 0, edgeRenders: 0, commits: [] };
    const frames: number[] = [];
    const longTasks: number[] = [];
    let previous = performance.now();
    let active = true;
    const frame = (now: number) => {
      if (!active) return;
      frames.push(now - previous);
      previous = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ type: 'longtask' });
    window.setTimeout(() => {
      active = false;
      observer.disconnect();
      window.__nodestarPerfInteraction = { frames, longTasks };
    }, 900);
  });
  await action();
  await page.waitForTimeout(950);
  const after = await performanceMetrics(session);
  return page.evaluate(() => {
    const probe = window.__nodestarPerformanceProbe!;
    const interaction = window.__nodestarPerfInteraction as { frames: number[]; longTasks: number[] };
    return {
      frames: interaction.frames.slice(2),
      longTasks: interaction.longTasks,
      objectRenders: probe.objectRenders,
      edgeRenders: probe.edgeRenders,
      commits: probe.commits.map(({ actualDuration, baseDuration }) => ({ actualDuration, baseDuration })),
      layoutMs: 0,
      styleMs: 0,
    };
  }).then((result) => ({
    ...result,
    layoutMs: ((after.LayoutDuration || 0) - (before.LayoutDuration || 0)) * 1000,
    styleMs: ((after.RecalcStyleDuration || 0) - (before.RecalcStyleDuration || 0)) * 1000,
  }));
}

declare global {
  interface Window {
    __nodestarPerfInteraction?: unknown;
  }
}

test('production interaction budget across 100, 300 and 500-node fixtures', async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const report: Record<string, Record<string, unknown>> = {};

  for (const count of [100, 300, 500]) {
    await seed(page, count);
    const canvas = page.locator('.canvas');
    const node0 = page.locator('[data-object="node-0"]');
    const node1 = page.locator('[data-object="node-1"]');
    const node2 = page.locator('[data-object="node-2"]');
    const center = async (locator: typeof node0) => {
      const box = await locator.boundingBox();
      if (!box) throw new Error('Expected benchmark node to be visible');
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const results: Record<string, InteractionResult> = {};
    results.branchDrag = await measure(page, session, async () => {
      const source = await center(node0);
      await page.mouse.move(source.x, source.y);
      await page.mouse.down();
      await page.mouse.move(source.x + 95, source.y + 75, { steps: 8 });
      await page.mouse.up();
    });
    await page.getByLabel('Fit graph').click();
    await node0.click();
    await node1.click({ modifiers: ['Control'] });
    results.explicitMultiDrag = await measure(page, session, async () => {
      const source = await center(node0);
      await page.mouse.move(source.x, source.y);
      await page.mouse.down();
      await page.mouse.move(source.x + 55, source.y + 40, { steps: 8 });
      await page.mouse.up();
    });
    await page.keyboard.press('Escape');
    results.focus = await measure(page, session, async () => {
      await node0.evaluate((element) => (element as HTMLElement).focus());
      await page.keyboard.press(' ');
      await page.keyboard.press('f');
    });
    await page.keyboard.press('f');
    results.imageNavigation = await measure(page, session, async () => {
      await page.mouse.move(760, 540);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(400, 280, { steps: 24 });
      await page.mouse.up({ button: 'right' });
    });
    results.validReparent = await measure(page, session, async () => {
      const source = await center(node0);
      const destination = await center(node2);
      await page.mouse.move(source.x, source.y);
      await page.mouse.down();
      await page.mouse.move(destination.x, destination.y, { steps: 8 });
      await page.mouse.up();
    });
    results.invalidReparent = await measure(page, session, async () => {
      const current = await node0.boundingBox();
      const descendant = await node1.boundingBox();
      if (!current || !descendant) throw new Error('Expected nodes after reparent');
      await page.mouse.move(current.x + current.width / 2, current.y + current.height / 2);
      await page.mouse.down();
      await page.mouse.move(descendant.x + descendant.width / 2, descendant.y + descendant.height / 2, { steps: 8 });
      await page.mouse.up();
    });
    results.pan = await measure(page, session, async () => {
      await page.mouse.move(760, 540);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(610, 520, { steps: 12 });
      await page.mouse.up({ button: 'right' });
    });
    results.zoom = await measure(page, session, async () => {
      await canvas.hover({ position: { x: 720, y: 450 } });
      await page.mouse.wheel(0, -720);
    });
    report[String(count)] = Object.fromEntries(
      Object.entries(results).map(([name, result]) => [
        name,
        {
          p95FrameMs: Number(percentile(result.frames, 0.95).toFixed(2)),
          maxFrameMs: Number(Math.max(0, ...result.frames).toFixed(2)),
          longTasks: result.longTasks.map((value) => Number(value.toFixed(2))),
          maxReactCommitMs: Number(Math.max(0, ...result.commits.map((commit) => commit.actualDuration)).toFixed(2)),
          objectRenders: result.objectRenders,
          edgeRenders: result.edgeRenders,
          layoutMs: Number(result.layoutMs.toFixed(2)),
          styleMs: Number(result.styleMs.toFixed(2)),
        },
      ]),
    );
  }
  await testInfo.attach('production-performance.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
});
