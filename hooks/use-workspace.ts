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
} from '@/lib/storage';
import type { Asset } from '@/lib/storage';
import {
  chooseWorkspaceSnapshot,
  decodeWorkspaceSnapshot,
  makeWorkspaceSnapshot,
} from '@/lib/workspace-snapshot';
import { quarantineMissingAssetReferences } from '@/lib/image-request';
export function useWorkspace() {
  const [map, setMap] = useState<VisionMap | null>(null),
    [assets, setAssets] = useState<Record<string, Asset>>({}),
    [orphanedAssets, setOrphanedAssets] = useState<string[]>([]);
  const [status, setStatus] = useState('Loading…'),
    [revision, setRevision] = useState(0);
  const current = useRef<VisionMap | null>(null),
    past = useRef<VisionMap[]>([]),
    future = useRef<VisionMap[]>([]);
  const writeQueue = useRef(Promise.resolve()),
    generation = useRef(0),
    assetStoreHealthy = useRef(true);
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
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(() => saveMap(snapshot))
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
  }, []);
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
      const [mapResult, assetResult] = await Promise.allSettled([
        loadMap(),
        loadAssets(),
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
      const loaded = snapshot?.map || demoMap();
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
  }, []);
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
      const write = writeQueue.current
        .catch(() => {})
        .then(() => saveAssetsAndMap(durableAssets, snapshot));
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
    [],
  );
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
  };
}
