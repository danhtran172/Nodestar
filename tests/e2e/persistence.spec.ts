import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const map = (title: string) => ({
  version: 1,
  title,
  anchorId: '',
  objects: [],
  relationships: [],
});

const snapshot = (title: string, revision: number) => ({
  schemaVersion: 1,
  revision,
  savedAt: revision * 100,
  map: map(title),
});

async function seed(
  page: Page,
  localValue: unknown,
  databaseValue: unknown,
) {
  await page.goto('/');
  await page.evaluate(
    async ({ local, database }) => {
      localStorage.clear();
      if (local !== null)
        localStorage.setItem(
          'spread-recovery-v1',
          typeof local === 'string' ? local : JSON.stringify(local),
        );
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('spread-workspace', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('maps'))
            request.result.createObjectStore('maps');
          if (!request.result.objectStoreNames.contains('assets'))
            request.result.createObjectStore('assets', { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          if (database === null) {
            request.result.close();
            resolve();
            return;
          }
          const transaction = request.result.transaction('maps', 'readwrite');
          transaction.objectStore('maps').put(database, 'current');
          transaction.oncomplete = () => {
            request.result.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    { local: localValue, database: databaseValue },
  );
}

async function expectWorkspace(page: Page, title: string) {
  await page.reload();
  await expect(page.getByLabel('Map title')).toHaveValue(title);
}

test('database revision 5 beats local revision 4', async ({ page }) => {
  await seed(page, snapshot('local-4', 4), snapshot('database-5', 5));
  await expectWorkspace(page, 'database-5');
});

test('local revision 6 beats database revision 5', async ({ page }) => {
  await seed(page, snapshot('local-6', 6), snapshot('database-5', 5));
  await expectWorkspace(page, 'local-6');
});

test('corrupt local recovery does not hide a valid database map', async ({
  page,
}) => {
  await seed(page, '{broken json', snapshot('database-valid', 5));
  await expectWorkspace(page, 'database-valid');
});

test('legacy raw map is migrated and loaded', async ({ page }) => {
  await seed(page, map('legacy-local'), null);
  await expectWorkspace(page, 'legacy-local');
});

test('map-store failure keeps valid local recovery and reports degraded', async ({
  page,
}) => {
  await seed(page, snapshot('local-recovery', 8), snapshot('database-old', 7));
  await page.addInitScript(() => {
    // oxlint-disable-next-line typescript/unbound-method -- The wrapper restores the database receiver with call().
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, ...rest) {
      const names = typeof stores === 'string' ? [stores] : [...stores];
      if (names.includes('maps')) throw new DOMException('Injected map failure');
      return original.call(this, stores, ...rest);
    };
  });
  await expectWorkspace(page, 'local-recovery');
  await expect(page.getByText('Storage issue — export a backup')).toBeVisible();
});

test('asset-store failure keeps valid map and reports degraded', async ({
  page,
}) => {
  await seed(page, snapshot('local-old', 2), snapshot('database-map', 3));
  await page.addInitScript(() => {
    // oxlint-disable-next-line typescript/unbound-method -- The wrapper restores the database receiver with call().
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, ...rest) {
      const names = typeof stores === 'string' ? [stores] : [...stores];
      if (names.includes('assets'))
        throw new DOMException('Injected asset failure');
      return original.call(this, stores, ...rest);
    };
  });
  await expectWorkspace(page, 'database-map');
  await expect(page.getByText('Storage issue — export a backup')).toBeVisible();
});

test('no stored data falls back to the demo map', async ({ page }) => {
  await seed(page, null, null);
  await expectWorkspace(page, 'My next chapter');
});

test('rapid writes keep local and database on the latest revision', async ({
  page,
}) => {
  await seed(page, snapshot('start', 10), snapshot('start', 10));
  await expectWorkspace(page, 'start');
  const title = page.getByLabel('Map title');
  await title.fill('first write');
  await title.press('Enter');
  await title.fill('latest write');
  await title.press('Enter');
  await expect(page.getByText('Saved on this device')).toBeVisible();

  const persisted = await page.evaluate(async () => {
    const local = JSON.parse(localStorage.getItem('spread-recovery-v1') || 'null');
    const database = await new Promise<unknown>((resolve, reject) => {
      const request = indexedDB.open('spread-workspace', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const get = request.result
          .transaction('maps')
          .objectStore('maps')
          .get('current');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      };
    });
    return { local, database };
  });
  expect(persisted.local.revision).toBeGreaterThan(10);
  expect(persisted.database).toMatchObject({
    revision: persisted.local.revision,
    map: { title: 'latest write' },
  });
  expect(persisted.local.map.title).toBe('latest write');
});
