'use client';
/* oxlint-disable react/react-compiler -- Synchronous transaction refs intentionally own undo state; this module does not use the React compiler. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { demoMap, validateMap } from '@/lib/graph';
import type { VisionMap } from '@/lib/graph';
import { loadMap, loadAssets, saveMap } from '@/lib/storage';
import type { Asset } from '@/lib/storage';
export function useWorkspace() {
  const [map, setMap] = useState<VisionMap | null>(null),
    [assets, setAssets] = useState<Record<string, Asset>>({});
  const [status, setStatus] = useState('Loading…'),
    [revision, setRevision] = useState(0);
  const current = useRef<VisionMap | null>(null),
    past = useRef<VisionMap[]>([]),
    future = useRef<VisionMap[]>([]);
  const writeQueue = useRef(Promise.resolve()),
    generation = useRef(0);
  const persist = useCallback((next: VisionMap) => {
    const token = ++generation.current;
    setStatus('Saving…');
    try {
      localStorage.setItem('spread-recovery-v1', JSON.stringify(next));
    } catch {
      /* IndexedDB is the durable primary store. */
    }
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(() => saveMap(next))
      .then(() => {
        if (token === generation.current) setStatus('Saved on this device');
      })
      .catch(() => {
        if (token === generation.current)
          setStatus('Storage issue — export a backup');
      });
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      let recovered: VisionMap | null = null;
      try {
        const raw = localStorage.getItem('spread-recovery-v1');
        if (raw) recovered = validateMap(JSON.parse(raw));
      } catch {
        /* Try database without overwriting the recovery copy. */
      }
      try {
        const [stored, images] = await Promise.all([loadMap(), loadAssets()]);
        if (!live) return;
        setAssets(images);
        recovered ??= stored ? validateMap(stored) : null;
        setStatus('Saved on this device');
      } catch {
        if (live) setStatus('Storage issue — export a backup');
      }
      if (live) {
        current.current = recovered || demoMap();
        setMap(current.current);
      }
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
      setRevision((r) => r + 1);
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
    setRevision((r) => r + 1);
    persist(previous);
  }, [persist]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !current.current) return;
    past.current.push(current.current);
    current.current = next;
    setMap(next);
    setRevision((r) => r + 1);
    persist(next);
  }, [persist]);
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
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    revision,
  };
}
