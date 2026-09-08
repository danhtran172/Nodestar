import type { WorkspaceSnapshot } from './workspace-snapshot';
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
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('spread-workspace', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('maps');
      request.result.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
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
export async function saveMap(snapshot: WorkspaceSnapshot) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction('maps', 'readwrite');
    const table = tx.objectStore('maps');
    const current = table.get('current');
    current.onsuccess = () => {
      const stored = current.result as Partial<WorkspaceSnapshot> | undefined;
      const storedRevision =
        stored?.schemaVersion === 1 && Number.isSafeInteger(stored.revision)
          ? stored.revision!
          : 0;
      if (snapshot.revision >= storedRevision) table.put(snapshot, 'current');
    };
    current.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || current.error);
  });
}
export async function loadMap(): Promise<unknown> {
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
export async function loadAssets(): Promise<Record<string, Asset>> {
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
