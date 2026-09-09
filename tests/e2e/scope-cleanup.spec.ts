import { expect, test } from '@playwright/test';

const fixture = {
  version: 1,
  title: 'Scope cleanup',
  anchorId: 'node',
  objects: [
    {
      id: 'node',
      type: 'NODE',
      role: 'NORMAL',
      text: 'Existing node',
      note: '',
      x: 0,
      y: 0,
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
  ],
  relationships: [],
};

test('runtime registers no model tools while normal creation remains available', async ({
  page,
}) => {
  await page.addInitScript((map) => {
    localStorage.clear();
    localStorage.setItem('spread-recovery-v1', JSON.stringify(map));
    const names: string[] = [];
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: { name?: string }) {
          if (tool.name) names.push(tool.name);
        },
      },
    });
    Object.assign(window, { registeredModelTools: names });
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="node"]')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { registeredModelTools: string[] })
          .registeredModelTools,
    ),
  ).toEqual([]);

  await page.locator('.canvas').dblclick({ position: { x: 80, y: 160 } });
  await expect(page.getByRole('textbox', { name: 'Object text' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Object text' }).fill('New idea');
  await page.getByRole('textbox', { name: 'Object text' }).press('Enter');
  await expect(page.getByText('New idea', { exact: true })).toBeVisible();
});
