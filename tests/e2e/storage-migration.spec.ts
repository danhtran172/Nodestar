import { expect, test } from '@playwright/test';

test('upgrades a legacy maps-only database so images can be stored', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const remove = indexedDB.deleteDatabase('nodestar-workspace');
        remove.onerror = () => reject(remove.error);
        remove.onsuccess = () => {
          const open = indexedDB.open('nodestar-workspace', 1);
          open.onerror = () => reject(open.error);
          open.onupgradeneeded = () => {
            open.result.createObjectStore('maps');
          };
          open.onsuccess = () => {
            const transaction = open.result.transaction('maps', 'readwrite');
            transaction.objectStore('maps').put(
              {
                schemaVersion: 1,
                revision: 7,
                savedAt: 700,
                map: {
                  version: 1,
                  title: 'Kept legacy map',
                  anchorId: '',
                  objects: [],
                  relationships: [],
                },
              },
              'current',
            );
            transaction.oncomplete = () => {
              open.result.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
          };
        };
      }),
  );

  await page.reload();
  await expect(page.getByLabel('Map title')).toHaveValue('Kept legacy map');
  await expect(page.getByText('Saved on this device')).toBeVisible();

  const stores = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('nodestar-workspace', 2);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          resolve(Array.from(open.result.objectStoreNames));
          open.result.close();
        };
      }),
  );
  expect(stores).toEqual(expect.arrayContaining(['maps', 'assets']));
});

test('adopts a workspace saved under the pre-rename SPREAD name', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const drop = (name: string) =>
          new Promise<void>((done) => {
            const remove = indexedDB.deleteDatabase(name);
            remove.onsuccess = remove.onerror = remove.onblocked = () => done();
          });
        void Promise.all([
          drop('nodestar-workspace'),
          drop('spread-workspace'),
        ]).then(() => {
          localStorage.clear();
          const map = {
            version: 1,
            title: 'Map from SPREAD',
            anchorId: '',
            objects: [],
            relationships: [],
          };
          const open = indexedDB.open('spread-workspace', 2);
          open.onerror = () => reject(open.error);
          open.onupgradeneeded = () => {
            open.result.createObjectStore('maps');
            open.result.createObjectStore('assets', { keyPath: 'id' });
          };
          open.onsuccess = () => {
            const tx = open.result.transaction(
              ['maps', 'assets'],
              'readwrite',
            );
            tx.objectStore('maps').put(
              { schemaVersion: 1, revision: 4, savedAt: 400, map },
              'current',
            );
            tx.objectStore('maps').put(
              {
                version: 1,
                activeId: 'legacy-1',
                entries: [
                  {
                    id: 'legacy-1',
                    title: 'Map from SPREAD',
                    createdAt: 1,
                    updatedAt: 2,
                    archived: false,
                    map,
                  },
                ],
              },
              'catalog',
            );
            tx.objectStore('assets').put({
              id: 'legacy-asset',
              filename: 'old.png',
              mimeType: 'image/png',
              width: 1,
              height: 1,
              preview: 'data:image/png;base64,AAA',
              full: 'data:image/png;base64,AAA',
              status: 'saved',
            });
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
      }),
  );

  await page.reload();
  await expect(page.getByLabel('Map title')).toHaveValue('Map from SPREAD');

  const adopted = await page.evaluate(
    () =>
      new Promise<{ title: unknown; catalog: unknown; assets: number }>(
        (resolve, reject) => {
          const open = indexedDB.open('nodestar-workspace', 2);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction(['maps', 'assets']);
            const current = tx.objectStore('maps').get('current');
            const catalog = tx.objectStore('maps').get('catalog');
            const assets = tx.objectStore('assets').getAll();
            tx.oncomplete = () => {
              open.result.close();
              resolve({
                title: current.result?.map?.title,
                catalog: catalog.result?.entries?.[0]?.title,
                assets: assets.result.length,
              });
            };
            tx.onerror = () => reject(tx.error);
          };
        },
      ),
  );
  expect(adopted.title).toBe('Map from SPREAD');
  expect(adopted.catalog).toBe('Map from SPREAD');
  expect(adopted.assets).toBe(1);

  // The old database stays put as a fallback until the user clears site data.
  const names = await page.evaluate(async () =>
    (await indexedDB.databases()).map((entry) => entry.name),
  );
  expect(names).toContain('spread-workspace');
});
