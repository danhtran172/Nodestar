import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const object = (id: string, type = 'NODE') => ({
  id,
  type,
  role: 'NORMAL',
  text: id,
  note: '',
  x: type === 'NODE' ? 0 : 360,
  y: 0,
  width: type === 'NODE' ? 210 : 310,
  height: type === 'NODE' ? 90 : 240,
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
  title: 'Asset integrity',
  anchorId: 'node',
  objects: [object('node'), object('imagination', 'IMAGINATION')],
  relationships: [],
};

const imageBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function pasteImages(page: Page, count = 1, valid = true) {
  await page.evaluate(
    ({ base64, amount, isValid }) => {
      const bytes = isValid
        ? Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
        : new Uint8Array([1, 2, 3, 4]);
      const transfer = new DataTransfer();
      for (let index = 0; index < amount; index++)
        transfer.items.add(
          new File([bytes], `pixel-${index}.png`, { type: 'image/png' }),
        );
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: transfer });
      window.dispatchEvent(event);
    },
    { base64: imageBase64, amount: count, isValid: valid },
  );
}

async function failNextAtomicTransaction(page: Page) {
  await page.evaluate(() => {
    const scope = window as unknown as {
      restoreTransaction?: () => void;
    };
    // oxlint-disable-next-line typescript/unbound-method -- Restored with call().
    const original = IDBDatabase.prototype.transaction;
    let failed = false;
    IDBDatabase.prototype.transaction = function (stores, ...rest) {
      const names = typeof stores === 'string' ? [stores] : [...stores];
      if (!failed && names.includes('assets') && names.includes('maps')) {
        failed = true;
        throw new DOMException('Injected quota failure', 'QuotaExceededError');
      }
      return original.call(this, stores, ...rest);
    };
    scope.restoreTransaction = () => {
      IDBDatabase.prototype.transaction = original;
    };
  });
}

async function restoreTransactions(page: Page) {
  await page.evaluate(() => {
    const scope = window as unknown as {
      restoreTransaction?: () => void;
    };
    scope.restoreTransaction?.();
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((map) => {
    if (sessionStorage.getItem('spread-fixture-loaded') === '1') return;
    localStorage.clear();
    localStorage.setItem('spread-recovery-v1', JSON.stringify(map));
  }, fixture);
  await page.goto('/');
  await expect(page.locator('[data-object="node"]')).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem('spread-fixture-loaded', '1'),
  );
});

test('asset transaction failure leaves no canonical reference and retry survives reload', async ({
  page,
}) => {
  const node = page.locator('[data-object="node"]');
  await node.click({ position: { x: 6, y: 6 } });
  await failNextAtomicTransaction(page);
  await pasteImages(page);

  await expect(node.locator('img')).toHaveCount(0);
  await expect(page.getByText('Storage full or unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.screenshot({
    path: 'evidence/wp05-assets/asset-error-retry.png',
    fullPage: true,
  });

  await restoreTransactions(page);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(node.locator('img')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await page.screenshot({
    path: 'evidence/wp05-assets/retry-success.png',
    fullPage: true,
  });
  await page.reload();
  await expect(node.locator('img')).toHaveCount(1);
});

test('failed replacement keeps the old canonical image', async ({ page }) => {
  const node = page.locator('[data-object="node"]');
  await node.click({ position: { x: 6, y: 6 } });
  await pasteImages(page);
  await expect(node.locator('img')).toHaveCount(1);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('spread-recovery-v1') || 'null'),
  );

  await failNextAtomicTransaction(page);
  await pasteImages(page);
  await expect(node.locator('img')).toHaveCount(1);
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('spread-recovery-v1') || 'null'),
  );
  expect(after.map.objects[0].images).toEqual(before.map.objects[0].images);
});

test('removing a failed preview leaves the canonical map unchanged', async ({
  page,
}) => {
  const node = page.locator('[data-object="node"]');
  await node.click({ position: { x: 6, y: 6 } });
  const before = await page.evaluate(() =>
    localStorage.getItem('spread-recovery-v1'),
  );
  await failNextAtomicTransaction(page);
  await pasteImages(page);
  await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  await expect(node.locator('img')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('spread-recovery-v1')),
  ).toBe(before);
  await page.screenshot({
    path: 'evidence/wp05-assets/remove-failed-preview.png',
    fullPage: true,
  });
});

test('partial Imagination batch commits successes and isolates one failure', async ({
  page,
}) => {
  const imagination = page.locator('[data-object="imagination"]');
  await imagination.click({ position: { x: 6, y: 6 } });
  await failNextAtomicTransaction(page);
  await pasteImages(page, 2);
  await expect(imagination.locator('img')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(1);
});

test('invalid image decode creates no asset reference or retry action', async ({
  page,
}) => {
  const node = page.locator('[data-object="node"]');
  await node.click({ position: { x: 6, y: 6 } });
  await pasteImages(page, 1, false);
  await expect(node.locator('img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await expect(page.getByLabel('Undo')).toBeDisabled();
});

test('file read failure creates no asset reference or retry action', async ({
  page,
}) => {
  await page.locator('[data-object="node"]').click({ position: { x: 6, y: 6 } });
  await page.evaluate(() => {
    FileReader.prototype.readAsDataURL = function () {
      queueMicrotask(() =>
        this.onerror?.(
          new ProgressEvent('error') as ProgressEvent<FileReader>,
        ),
      );
    };
  });
  await pasteImages(page);
  await expect(page.getByText(/Could not read this image/)).toBeVisible();
  await expect(page.locator('[data-object="node"] img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await expect(page.getByLabel('Undo')).toBeDisabled();
});

test('thumbnail generation failure creates no canonical reference', async ({
  page,
}) => {
  await page.locator('[data-object="node"]').click({ position: { x: 6, y: 6 } });
  await page.evaluate(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });
  await pasteImages(page);
  await expect(page.locator('[data-object="node"] img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await expect(page.getByLabel('Undo')).toBeDisabled();
});

test('map write failure aborts the asset and map transaction', async ({ page }) => {
  const node = page.locator('[data-object="node"]');
  await node.click({ position: { x: 6, y: 6 } });
  await page.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- Restored by the test context teardown.
    const original = IDBObjectStore.prototype.put;
    let failed = false;
    IDBObjectStore.prototype.put = function (value, key) {
      if (!failed && this.name === 'maps') {
        failed = true;
        throw new DOMException('Injected map failure', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });
  await pasteImages(page);
  await expect(node.locator('img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('legacy orphan is quarantined without a broken image or false Retry', async ({
  page,
}) => {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('spread-recovery-v1') || 'null');
    raw.objects[0].images = ['missing-asset'];
    localStorage.setItem('spread-recovery-v1', JSON.stringify(raw));
  });
  await page.reload();
  await expect(page.locator('[data-object="node"] img')).toHaveCount(0);
  await expect(
    page.getByText(/Original image data is no longer available/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText(/Original image data/)).toHaveCount(0);
});

test('successful upload stores asset and referencing map in one revision', async ({
  page,
}) => {
  const node = page.locator('[data-object="node"]');
  await node.click({ position: { x: 6, y: 6 } });
  await pasteImages(page);
  await expect(node.locator('img')).toHaveCount(1);
  const integrity = await page.evaluate(async () => {
    return new Promise<{ referenced: string; assetId: string }>(
      (resolve, reject) => {
        const request = indexedDB.open('spread-workspace', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction(['maps', 'assets']);
          const mapRequest = transaction.objectStore('maps').get('current');
          const assetRequest = transaction.objectStore('assets').getAll();
          transaction.oncomplete = () =>
            resolve({
              referenced: mapRequest.result.map.objects[0].images[0],
              assetId: assetRequest.result[0].id,
            });
          transaction.onerror = () => reject(transaction.error);
        };
      },
    );
  });
  expect(integrity.referenced).toBe(integrity.assetId);
});
