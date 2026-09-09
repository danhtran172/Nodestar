'use client';
/* oxlint-disable react/react-compiler -- Synchronous transaction refs intentionally own undo state; this module does not use the React compiler. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { demoMap, validateMap } from '@/lib/graph';
import type { VisionMap } from '@/lib/graph';
import {
  loadMap,
  loadAssets,
  saveMap,
  saveAssetsAndMap,
  loadMapCatalog,
  saveMapCatalog,
} from '@/lib/storage';
import type { Asset, MapCatalog, MapEntry } from '@/lib/storage';
import {
  chooseWorkspaceSnapshot,
  decodeWorkspaceSnapshot,
  makeWorkspaceSnapshot,
} from '@/lib/workspace-snapshot';
import { quarantineMissingAssetReferences } from '@/lib/image-request';
export function useWorkspace() {
  const [map, setMap] = useState<VisionMap | null>(null),
    [assets, setAssets] = useState<Record<string, Asset>>({}),
    [orphanedAssets, setOrphanedAssets] = useState<string[]>([]),
    [maps, setMaps] = useState<MapEntry[]>([]),
    [activeMapId, setActiveMapId] = useState('');
  const [status, setStatus] = useState('Loading…'),
    [revision, setRevision] = useState(0);
  const current = useRef<VisionMap | null>(null),
    past = useRef<VisionMap[]>([]),
    future = useRef<VisionMap[]>([]);
  const writeQueue = useRef(Promise.resolve()),
    generation = useRef(0),
    assetStoreHealthy = useRef(true),
    catalogRef = useRef<MapCatalog | null>(null);
  const publishCatalog = useCallback((catalog: MapCatalog) => {
    catalogRef.current = catalog;
    setMaps(catalog.entries);
    setActiveMapId(catalog.activeId);
    return catalog;
  }, []);
  const persist = useCallback((next: VisionMap) => {
    const token = ++generation.current;
    const snapshot = makeWorkspaceSnapshot(next, token);
    setRevision(token);
    setStatus('Saving…');
    try {
      localStorage.setItem('spread-recovery-v1', JSON.stringify(snapshot));
    } catch {
      /* IndexedDB is the durable primary store. */
    }
    const now = Date.now();
    const prior = catalogRef.current;
    const catalog = prior && prior.entries.some((entry) => entry.id === prior.activeId)
      ? {
          ...prior,
          entries: prior.entries.map((entry) =>
            entry.id === prior.activeId
              ? { ...entry, title: next.title, updatedAt: now, map: next }
              : entry,
          ),
        }
      : prior;
    if (catalog) publishCatalog(catalog);
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(async () => {
        await saveMap(snapshot);
        if (catalog) await saveMapCatalog(catalog);
      })
      .then(() => {
        if (token === generation.current)
          setStatus(
            assetStoreHealthy.current
              ? 'Saved on this device'
              : 'Storage issue — export a backup',
          );
      })
      .catch(() => {
        if (token === generation.current)
          setStatus('Storage issue — export a backup');
      });
  }, [publishCatalog]);
  useEffect(() => {
    let live = true;
    void (async () => {
      let localSnapshot = null;
      try {
        const raw = localStorage.getItem('spread-recovery-v1');
        if (raw)
          localSnapshot = decodeWorkspaceSnapshot(
            JSON.parse(raw),
            validateMap,
          );
      } catch {
        /* Try database without overwriting the recovery copy. */
      }
      const [mapResult, assetResult, catalogResult] = await Promise.allSettled([
        loadMap(),
        loadAssets(),
        loadMapCatalog(),
      ]);
      if (!live) return;
      let databaseSnapshot = null;
      let mapStoreHealthy = mapResult.status === 'fulfilled';
      if (mapResult.status === 'fulfilled') {
        try {
          databaseSnapshot = decodeWorkspaceSnapshot(
            mapResult.value,
            validateMap,
          );
        } catch {
          mapStoreHealthy = false;
        }
      }
      assetStoreHealthy.current = assetResult.status === 'fulfilled';
      if (assetResult.status === 'fulfilled') setAssets(assetResult.value);
      const snapshot = chooseWorkspaceSnapshot(
        localSnapshot,
        databaseSnapshot,
      );
      generation.current = snapshot?.revision || 0;
      setRevision(generation.current);
      setStatus(
        mapStoreHealthy && assetStoreHealthy.current
          ? 'Saved on this device'
          : 'Storage issue — export a backup',
      );
      let catalog: MapCatalog | null = null;
      if (catalogResult.status === 'fulfilled') {
        const value = catalogResult.value as Partial<MapCatalog> | null;
        if (
          value?.version === 1 &&
          typeof value.activeId === 'string' &&
          Array.isArray(value.entries) &&
          value.entries.every((entry) => {
            try { return typeof entry.id === 'string' && typeof entry.title === 'string' && validateMap(entry.map); }
            catch { return false; }
          })
        ) catalog = value as MapCatalog;
      }
      const active = catalog?.entries.find((entry) => entry.id === catalog?.activeId) ||
        catalog?.entries.find((entry) => !entry.archived) ||
        catalog?.entries[0];
      const loaded = active?.map || snapshot?.map || demoMap();
      if (!catalog) {
        const now = Date.now();
        catalog = {
          version: 1,
          activeId: crypto.randomUUID(),
          entries: [{ id: crypto.randomUUID(), title: loaded.title, createdAt: now, updatedAt: now, archived: false, map: loaded }],
        };
        catalog.activeId = catalog.entries[0].id;
      }
      publishCatalog(catalog);
      if (assetResult.status === 'fulfilled') {
        const checked = quarantineMissingAssetReferences(
          loaded,
          new Set(Object.keys(assetResult.value)),
        );
        current.current = checked.map;
        setOrphanedAssets(checked.missing);
      } else current.current = loaded;
      setMap(current.current);
    })();
    return () => {
      live = false;
    };
  }, [publishCatalog]);
  const commit = useCallback(
    (change: VisionMap | ((m: VisionMap) => VisionMap)) => {
      const before = current.current;
      if (!before) return;
      const next = typeof change === 'function' ? change(before) : change;
      if (next === before) return;
      past.current = [...past.current.slice(-99), before];
      future.current = [];
      current.current = next;
      setMap(next);
      persist(next);
    },
    [persist],
  );
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous || !current.current) return;
    future.current.push(current.current);
    current.current = previous;
    setMap(previous);
    persist(previous);
  }, [persist]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !current.current) return;
    past.current.push(current.current);
    current.current = next;
    setMap(next);
    persist(next);
  }, [persist]);
  const commitWithAssets = useCallback(
    async (
      durableAssets: readonly Asset[],
      change: VisionMap | ((m: VisionMap) => VisionMap),
    ) => {
      const before = current.current;
      if (!before) return false;
      const next = typeof change === 'function' ? change(before) : change;
      if (next === before) return false;
      const token = ++generation.current;
      const snapshot = makeWorkspaceSnapshot(next, token);
      setRevision(token);
      setStatus('Saving…');
      const now = Date.now();
      const prior = catalogRef.current;
      const catalog = prior && prior.entries.some((entry) => entry.id === prior.activeId)
        ? {
            ...prior,
            entries: prior.entries.map((entry) => entry.id === prior.activeId
              ? { ...entry, title: next.title, updatedAt: now, map: next }
              : entry),
          }
        : null;
      if (catalog) publishCatalog(catalog);
      const write = writeQueue.current
        .catch(() => {})
        .then(async () => {
          const saved = await saveAssetsAndMap(durableAssets, snapshot);
          if (catalog) await saveMapCatalog(catalog);
          return saved;
        });
      writeQueue.current = write.then(
        () => {},
        () => {},
      );
      try {
        const saved = await write;
        if (!saved || token !== generation.current) return false;
        try {
          localStorage.setItem('spread-recovery-v1', JSON.stringify(snapshot));
        } catch {
          /* IndexedDB transaction remains the durable source. */
        }
        past.current = [...past.current.slice(-99), before];
        future.current = [];
        current.current = next;
        setMap(next);
        assetStoreHealthy.current = true;
        setStatus('Saved on this device');
        return true;
      } catch {
        if (token === generation.current)
          setStatus('Storage issue — export a backup');
        assetStoreHealthy.current = false;
        return false;
      }
    },
    [publishCatalog],
  );
  const selectMap = useCallback((id: string) => {
    const currentCatalog = catalogRef.current;
    const entry = currentCatalog?.entries.find((item) => item.id === id);
    if (!entry || entry.archived) return;
    past.current = [];
    future.current = [];
    current.current = entry.map;
    setMap(entry.map);
    if (currentCatalog) publishCatalog({ ...currentCatalog, activeId: id });
    persist(entry.map);
  }, [persist, publishCatalog]);
  const createMap = useCallback((next: VisionMap) => {
    const currentCatalog = catalogRef.current;
    const now = Date.now();
    const entry: MapEntry = { id: crypto.randomUUID(), title: next.title, createdAt: now, updatedAt: now, archived: false, map: next };
    const catalog: MapCatalog = currentCatalog
      ? { ...currentCatalog, activeId: entry.id, entries: [...currentCatalog.entries, entry] }
      : { version: 1, activeId: entry.id, entries: [entry] };
    past.current = [];
    future.current = [];
    current.current = next;
    setMap(next);
    publishCatalog(catalog);
    persist(next);
  }, [persist, publishCatalog]);
  const renameMap = useCallback((id: string, title: string) => {
    const currentCatalog = catalogRef.current;
    if (!currentCatalog || !title.trim()) return;
    const entries = currentCatalog.entries.map((entry) => entry.id === id
      ? { ...entry, title: title.trim(), updatedAt: Date.now(), map: { ...entry.map, title: title.trim() } }
      : entry);
    const catalog = publishCatalog({ ...currentCatalog, entries });
    const active = entries.find((entry) => entry.id === catalog.activeId);
    if (active) {
      current.current = active.map;
      setMap(active.map);
    }
    void saveMapCatalog(catalog);
  }, [publishCatalog]);
  const archiveMap = useCallback((id: string, archived = true) => {
    const currentCatalog = catalogRef.current;
    if (!currentCatalog) return;
    const entries = currentCatalog.entries.map((entry) => entry.id === id ? { ...entry, archived } : entry);
    const nextActive = id === currentCatalog.activeId && archived
      ? entries.find((entry) => !entry.archived)?.id || currentCatalog.activeId
      : currentCatalog.activeId;
    const catalog = publishCatalog({ ...currentCatalog, activeId: nextActive, entries });
    void saveMapCatalog(catalog);
    if (nextActive !== currentCatalog.activeId) selectMap(nextActive);
  }, [publishCatalog, selectMap]);
  const deleteMap = useCallback((id: string) => {
    const currentCatalog = catalogRef.current;
    if (!currentCatalog || currentCatalog.entries.length <= 1) return;
    const entries = currentCatalog.entries.filter((entry) => entry.id !== id);
    const nextActive = id === currentCatalog.activeId
      ? entries.find((entry) => !entry.archived)?.id || entries[0].id
      : currentCatalog.activeId;
    const catalog = publishCatalog({ ...currentCatalog, activeId: nextActive, entries });
    void saveMapCatalog(catalog);
    if (nextActive !== currentCatalog.activeId) selectMap(nextActive);
  }, [publishCatalog, selectMap]);
  return {
    map,
    current,
    commit,
    undo,
    redo,
    assets,
    setAssets,
    status,
    saveDraft: persist,
    commitWithAssets,
    orphanedAssets,
    dismissOrphanedAsset: (id: string) =>
      setOrphanedAssets((current) => current.filter((item) => item !== id)),
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    revision,
    maps,
    activeMapId,
    selectMap,
    createMap,
    renameMap,
    archiveMap,
    deleteMap,
  };
}
