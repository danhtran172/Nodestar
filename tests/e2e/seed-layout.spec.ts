import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

function fixture(count: number, width = 310, long = false) {
  return {
    version: 1,
    title: `Seed layout ${count}`,
    anchorId: 'box',
    objects: [
      {
        id: 'box',
        type: 'SEED_BOX',
        role: 'NORMAL',
        text: 'Ideas worth exploring',
        note: '',
        x: 0,
        y: 0,
        width,
        height: Math.max(240, 115 + count * 48),
        images: [],
        seeds: Array.from({ length: count }, (_, index) => ({
          id: `seed-${index}`,
          text:
            long && index === 0
              ? 'A long seed should remain readable even when it needs several lines of text '.repeat(
                  4,
                )
              : `Loose idea ${index + 1}`,
          visualSeed: (index + 1) / 41,
        })),
        tier: count > 20 ? 30 : count > 10 ? 20 : 10,
        shuffle: 0.314159,
        focal: 50,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    relationships: [],
  };
}

async function seedStyles(box: Locator) {
  return box.locator('[data-seed]').evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).style.cssText),
  );
}

/** Chip reading order, which is what Shuffle rearranges. */
async function seedOrder(box: Locator) {
  return box
    .locator('[data-seed]')
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).dataset.seed),
    );
}

async function persistedShuffle(page: Page) {
  return page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('nodestar-recovery-v1') || 'null');
    const map = value.map || value;
    return map.objects.find(
      (object: { id: string; shuffle: number }) => object.id === 'box',
    ).shuffle as number;
  });
}

const matrix = [
  ['1', 1, 310, false],
  ['10', 10, 310, false],
  ['11', 11, 310, false],
  ['20', 20, 310, false],
  ['21', 21, 310, false],
  ['30', 30, 310, false],
  ['long', 10, 310, true],
  ['narrow', 10, 240, false],
  ['wide', 10, 480, false],
] as const;

for (const [name, count, width, long] of matrix) {
  test(`visual matrix ${name}`, async ({ page }) => {
    await page.addInitScript((map) => {
      localStorage.clear();
      // These specs cover free canvas placement; graph mode is exercised by
      // graph-layout.spec.ts.
      localStorage.setItem('nodestar-layout-mode', 'canvas');
      localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
    }, fixture(count, width, long));
    await page.goto('/');
    const box = page.locator('[data-object="box"]');
    await expect(box).toBeVisible();
    await expect(box.locator('[data-seed]')).toHaveCount(count);
    if (count > 1) {
      // Chips flow left to right and wrap, so every one of them occupies its
      // own slot. A narrow box may only fit one chip per row.
      const slots = await box.locator('[data-seed]').evaluateAll((items) =>
        items.map((item) => {
          const rectangle = item.getBoundingClientRect();
          return `${Math.round(rectangle.x)},${Math.round(rectangle.y)}`;
        }),
      );
      expect(new Set(slots).size).toBe(count);
    }
    await page.screenshot({
      path: `evidence/wp07-seed-layout/matrix-${name}.png`,
      fullPage: true,
    });
  });
}

test('Shuffle reorders the chips and reload keeps that order', async ({
  page,
}) => {
  await page.addInitScript((map) => {
    if (sessionStorage.getItem('nodestar-fixture-loaded') === '1') return;
    localStorage.clear();
    // These specs cover free canvas placement; graph mode is exercised by
    // graph-layout.spec.ts.
    localStorage.setItem('nodestar-layout-mode', 'canvas');
    localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
  }, fixture(10));
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('nodestar-fixture-loaded', '1'));
  const box = page.locator('[data-object="box"]');
  await expect(box.locator('[data-seed]')).toHaveCount(10);
  const before = await seedOrder(box);
  await box.click({ position: { x: 6, y: 6 } });
  await page.getByRole('button', { name: 'Shuffle' }).click();
  const after = await seedOrder(box);
  expect(after).not.toEqual(before);
  const byId = (a?: string, b?: string) => (a || '').localeCompare(b || '');
  expect([...after].sort(byId)).toEqual([...before].sort(byId));
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(box.locator('[data-seed]')).toHaveCount(10);
  expect(await seedOrder(box)).toEqual(after);
});

test('moving a Seed Box leaves its chips exactly where they were', async ({
  page,
}) => {
  await page.addInitScript((map) => {
    localStorage.clear();
    // These specs cover free canvas placement; graph mode is exercised by
    // graph-layout.spec.ts.
    localStorage.setItem('nodestar-layout-mode', 'canvas');
    localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
  }, fixture(10));
  await page.goto('/');
  const box = page.locator('[data-object="box"]');
  await expect(box.locator('[data-seed]')).toHaveCount(10);
  const beforeShuffle = await persistedShuffle(page);
  const beforeStyles = await seedStyles(box);
  const beforeOrder = await seedOrder(box);
  const bounds = await box.boundingBox();
  if (!bounds) throw new Error('Seed Box is not visible');
  await page.mouse.move(bounds.x + 8, bounds.y + 8);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 88, bounds.y + 48, { steps: 8 });
  await page.mouse.up();
  // The box lands somewhere new; the chips inside it are untouched.
  await expect
    .poll(async () => (await box.boundingBox())?.x)
    .not.toBe(bounds.x);
  expect(await persistedShuffle(page)).toBe(beforeShuffle);
  expect(await seedOrder(box)).toEqual(beforeOrder);
  expect(await seedStyles(box)).toEqual(beforeStyles);
});

test('reduced motion disables seed settle animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((map) => {
    localStorage.clear();
    // These specs cover free canvas placement; graph mode is exercised by
    // graph-layout.spec.ts.
    localStorage.setItem('nodestar-layout-mode', 'canvas');
    localStorage.setItem('nodestar-recovery-v1', JSON.stringify(map));
  }, fixture(10));
  await page.goto('/');
  const duration = await page
    .locator('[data-seed]')
    .first()
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
});
