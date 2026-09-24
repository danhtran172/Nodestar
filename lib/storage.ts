import type { WorkspaceSnapshot } from './workspace-snapshot';
import type { VisionMap } from './graph';
export type MapEntry = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  map: VisionMap;
  viewport?: { x: number; y: number; zoom: number };
};
export type MapCatalog = {
  version: 1;
  activeId: string;
  entries: MapEntry[];
};
export type Asset = {
  id: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  preview: string;
  full: string;
  status: 'saved' | 'error';
  error?: string;
};
const DATABASE = 'nodestar-workspace';
// The product shipped as SPREAD. A renamed database is a different database, so
// anything saved under the old name has to be copied across once, or the first
// launch after the rename looks like total data loss.
const LEGACY_DATABASE = 'spread-workspace';

function open(name: string, version?: number) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      const { objectStoreNames } = request.result;
      if (!objectStoreNames.contains('maps'))
        request.result.createObjectStore('maps');
      if (!objectStoreNames.contains('assets'))
        request.result.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('Close the other tabs using this map, then reload.'));
  });
}

const all = <T,>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * Copy a pre-rename database into the current one.
 *
 * The copy runs only while the current database still holds no map, so real
 * work can never be overwritten by a stale copy, and an interrupted copy is
 * simply retried on the next launch instead of stranding the old data. The
 * legacy database is left in place as a fallback.
 */
async function adoptLegacyData(current: IDBDatabase) {
  const existing = await Promise.all([
    all(current.transaction('maps').objectStore('maps').get('current')),
    all(current.transaction('maps').objectStore('maps').get('catalog')),
  ]);
  if (existing.some((value) => value !== undefined)) return;
  if (typeof indexedDB.databases !== 'function') return;
  let names: (string | undefined)[];
  try {
    names = (await indexedDB.databases()).map((entry) => entry.name);
  } catch {
    return;
  }
  if (!names.includes(LEGACY_DATABASE)) return;
  let legacy: IDBDatabase | undefined;
  try {
    // No version: open whatever exists without triggering an upgrade.
    legacy = await open(LEGACY_DATABASE);
    const stores = legacy.objectStoreNames;
    const map = stores.contains('maps')
      ? await all(legacy.transaction('maps').objectStore('maps').get('current'))
      : undefined;
    const catalog = stores.contains('maps')
      ? await all(legacy.transaction('maps').objectStore('maps').get('catalog'))
      : undefined;
    const assets = stores.contains('assets')
      ? ((await all(
          legacy.transaction('assets').objectStore('assets').getAll(),
        )) as Asset[])
      : [];
    if (map === undefined && catalog === undefined && !assets.length) return;
    // One transaction over both stores, so a failure leaves the current
    // database empty and the next launch tries again.
    await new Promise<void>((resolve, reject) => {
      const tx = current.transaction(['maps', 'assets'], 'readwrite');
      const mapStore = tx.objectStore('maps');
      if (map !== undefined) mapStore.put(map, 'current');
      if (catalog !== undefined) mapStore.put(catalog, 'catalog');
      const assetStore = tx.objectStore('assets');
      for (const asset of assets) assetStore.put(asset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* Start clean rather than block the app on an unreadable old database. */
  } finally {
    legacy?.close();
  }
}

let adopted: Promise<void> | undefined;
/**
 * Resolves once pre-rename data has been adopted, if there was any. Reads go
 * through this so they never observe a half-migrated workspace; the first
 * caller should await it *before* starting any read deadline, because copying
 * image assets takes far longer than a steady-state read.
 */
export function storageReady() {
  return (adopted ??= db()
    .then(adoptLegacyData)
    .catch(() => {}));
}

let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= (async () => {
    try {
      // Version 1 was released before image assets had their own store. Opening
      // that database at the same version leaves it permanently unable to save
      // images, because `onupgradeneeded` never runs. Bump the version and make
      // the upgrade additive so existing maps stay untouched.
      return await open(DATABASE, 2);
    } catch (error) {
      database = undefined;
      throw error;
    }
  })());
}
async function put(store: string, value: unknown, key?: string) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    const table = tx.objectStore(store);
    if (key) table.put(value, key);
    else table.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function saveAssetsAndMap(
  assets: readonly Asset[],
  snapshot: WorkspaceSnapshot,
) {
  const database = await db();
  return new Promise<boolean>((resolve, reject) => {
    const tx = database.transaction(['assets', 'maps'], 'readwrite');
    const maps = tx.objectStore('maps');
    const current = maps.get('current');
    let committed = false;
    current.onsuccess = () => {
      try {
        const stored = current.result as Partial<WorkspaceSnapshot> | undefined;
        const storedRevision =
          stored?.schemaVersion === 1 && Number.isSafeInteger(stored.revision)
            ? stored.revision!
            : 0;
        if (snapshot.revision < storedRevision) return;
        const assetStore = tx.objectStore('assets');
        for (const asset of assets)
          assetStore.put({ ...asset, status: 'saved', error: undefined });
        maps.put(snapshot, 'current');
        committed = true;
      } catch {
        tx.abort();
      }
    };
    current.onerror = () => tx.abort();
    tx.oncomplete = () => resolve(committed);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error || current.error || new Error('Storage transaction failed.'));
  });
}
export async function saveMap(snapshot: WorkspaceSnapshot) {
  await saveAssetsAndMap([], snapshot);
}
export async function loadMap(): Promise<unknown> {
  await storageReady();
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction('maps')
      .objectStore('maps')
      .get('current');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
export async function loadMapCatalog(): Promise<unknown> {
  await storageReady();
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction('maps')
      .objectStore('maps')
      .get('catalog');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
export async function saveMapCatalog(catalog: MapCatalog) {
  await put('maps', catalog, 'catalog');
}
export async function loadAssets(): Promise<Record<string, Asset>> {
  await storageReady();
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction('assets')
      .objectStore('assets')
      .getAll();
    request.onsuccess = () =>
      resolve(
        Object.fromEntries((request.result as Asset[]).map((a) => [a.id, a])),
      );
    request.onerror = () => reject(request.error);
  });
}
export const saveAsset = (asset: Asset) =>
  put('assets', { ...asset, status: 'saved', error: undefined });
export async function processImage(file: File): Promise<Asset> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 30 * 1024 * 1024)
    throw new Error('Choose an image smaller than 30 MB.');
  const full = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Could not read image.'));
    reader.onerror = () =>
      reject(new Error('Could not read this image. Try adding it again.'));
    reader.readAsDataURL(file);
  });
  const img = new Image();
  img.src = full;
  await img.decode();
  const ratio = Math.min(
    1,
    900 / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    id: crypto.randomUUID(),
    filename: file.name || 'Pasted image',
    mimeType: file.type,
    width: img.naturalWidth,
    height: img.naturalHeight,
    full,
    preview: canvas.toDataURL('image/webp', 0.83),
    status: 'saved',
  };
}
