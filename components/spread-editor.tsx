'use client';
/* oxlint-disable react/react-compiler -- External browser and synchronous graph transactions intentionally use refs; React compiler is not enabled. */
/* oxlint-disable next/no-img-element -- The explicit viewer renders a local original image rather than fetching or optimizing remotely. */
/* oxlint-disable jsx-a11y/no-autofocus -- Seed creation is an explicit keyboard entry flow; focus returns through the dialog/popover primitive. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Plus,
  MousePointer2,
  Hand,
  Search,
  Scan,
  Sprout,
  Image as ImageIcon,
  Target,
  Network,
  ChevronDown,
  Undo2,
  Redo2,
  MoreHorizontal,
  Focus,
  Link2,
  Trash2,
  Copy,
  ArrowLeftRight,
  Shuffle,
  PanelRight,
  X,
  Circle,
  Keyboard,
  Download,
  Upload,
  FilePlus2,
  Maximize2,
  Minus,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  CommandGroup,
} from '@/components/ui/command';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import { Toaster, toast } from '@/components/ui/toast';
import { SpreadCanvas } from '@/components/spread-canvas';
import type { Viewport } from '@/components/spread-canvas';
import { ObjectDetails } from '@/components/object-details';
import { useWorkspace } from '@/hooks/use-workspace';
import {
  makeObject,
  objectHeight,
  patchObject,
  branch,
  connect,
  reachable,
  deletionError,
  deleteObjects,
  removeEdge,
  editEdge,
  copySelection,
  duplicate,
  freePosition,
  addSeed,
  moveSeed,
  moveObjects,
  validateMap,
  nextVisualShuffle,
} from '@/lib/graph';
import type { VisionMap, CanvasObject, Kind, Point } from '@/lib/graph';
import { processImage, saveAsset } from '@/lib/storage';
import type { Asset } from '@/lib/storage';
import { shouldRejectImagePaste } from '@/lib/image-request';
import type { ImageRequestOrigin } from '@/lib/image-request';

const labels = {
  NODE: 'Node',
  GOAL: 'Goal',
  SEED_BOX: 'Seed Box',
  IMAGINATION: 'Imagination',
};
const icons = {
  NODE: Circle,
  GOAL: Target,
  SEED_BOX: Sprout,
  IMAGINATION: ImageIcon,
};
type PendingImageRequest = {
  asset: Asset;
  destinationId: string;
  createAt?: Point;
  replaceId?: string;
  origin: ImageRequestOrigin;
  status: 'pending' | 'error';
  error?: string;
};

function applyImageReference(map: VisionMap, request: PendingImageRequest) {
  let target = map.objects.find((object) => object.id === request.destinationId);
  let next = map;
  if (!target && request.createAt) {
    target = freePosition(map, {
      ...makeObject(
        'IMAGINATION',
        request.createAt,
        'NORMAL',
        'Imagination',
      ),
      id: request.destinationId,
    });
    next = { ...map, objects: [...map.objects, target] };
  }
  if (!target) throw new Error('The image target no longer exists.');
  return patchObject(next, target.id, {
    images:
      target.type === 'NODE'
        ? [request.asset.id]
        : request.replaceId
          ? target.images.flatMap((id) =>
              id === request.replaceId ? [request.asset.id] : [id],
            )
          : [...target.images, request.asset.id],
  });
}
export default function SpreadEditor() {
  const ws = useWorkspace(),
    { map, commit, undo, redo, assets, setAssets } = ws;
  const [selected, setSelected] = useState(new Set<string>()),
    [explicit, setExplicit] = useState(false),
    [edge, setEdge] = useState(''),
    [focus, setFocus] = useState('');
  const [viewport, setViewport] = useState<Viewport>({
      x: 400,
      y: 330,
      zoom: 0.72,
    }),
    [mode, setMode] = useState<'select' | 'pan'>('select'),
    [connecting, setConnecting] = useState('');
  const [editing, setEditing] = useState(''),
    [draft, setDraft] = useState<VisionMap | null>(null),
    draftRef = useRef<VisionMap | null>(null);
  const [detail, setDetail] = useState(''),
    [search, setSearch] = useState(false),
    [seedBox, setSeedBox] = useState(''),
    [seedText, setSeedText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Set<string> | null>(null),
    [help, setHelp] = useState(false),
    [viewer, setViewer] = useState('');
  const [online, setOnline] = useState(true),
    [busy, setBusy] = useState(false),
    [pendingImages, setPendingImages] = useState<
      Record<string, PendingImageRequest>
    >({}),
    [installPrompt, setInstallPrompt] = useState<{
      prompt: () => Promise<void>;
    } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    imageTarget = useRef<{ id?: string; replace?: string }>({}),
    clipboard = useRef<VisionMap | null>(null),
    didFit = useRef(false);
  const obj = map?.objects.find((o) => selected.has(o.id)),
    one = selected.size === 1 ? obj : undefined;
  const edgeObject = map?.relationships.find((e) => e.id === edge);
  const notify = useCallback((message: string) => {
    toast.add({ title: message, type: 'info', timeout: 4500 });
  }, []);
  const act = useCallback(
    (action: () => void) => {
      try {
        action();
      } catch (e) {
        notify((e as Error).message);
      }
    },
    [notify],
  );
  const select = useCallback(
    (ids: Set<string>, multi = false) => {
      if (connecting && ids.size === 1) {
        act(() => commit((m) => connect(m, connecting, [...ids][0])));
        setConnecting('');
        return;
      }
      setSelected(ids);
      setExplicit(multi);
      setEdge('');
    },
    [connecting, act, commit],
  );
  function dimensions() {
    const r = document.querySelector('.canvas')?.getBoundingClientRect();
    return {
      width: r?.width || window.innerWidth,
      height: r?.height || window.innerHeight - 76,
    };
  }
  function center(): Point {
    const d = dimensions();
    return {
      x: (d.width / 2 - viewport.x) / viewport.zoom,
      y: (d.height / 2 - viewport.y) / viewport.zoom,
    };
  }
  const fit = useCallback((objects: CanvasObject[]) => {
    const d = dimensions();
    if (!objects.length) {
      setViewport({ x: d.width / 2, y: d.height / 2, zoom: 1 });
      return;
    }
    const minX = Math.min(...objects.map((o) => o.x)),
      minY = Math.min(...objects.map((o) => o.y)),
      maxX = Math.max(...objects.map((o) => o.x + o.width)),
      maxY = Math.max(...objects.map((o) => o.y + objectHeight(o)));
    const zoom = Math.max(
      0.18,
      Math.min(
        1.2,
        (d.width - 140) / Math.max(1, maxX - minX),
        (d.height - 230) / Math.max(1, maxY - minY),
      ),
    );
    setViewport({
      zoom,
      x: d.width / 2 - ((minX + maxX) / 2) * zoom,
      y: d.height / 2 - ((minY + maxY) / 2) * zoom + 10,
    });
  }, []);
  useEffect(() => {
    if (map && !didFit.current) {
      didFit.current = true;
      try {
        const raw = localStorage.getItem('spread-viewport');
        if (raw) {
          const v = JSON.parse(raw);
          if (
            Number.isFinite(v.x) &&
            Number.isFinite(v.y) &&
            v.zoom >= 0.18 &&
            v.zoom <= 2.5
          ) {
            setViewport(v);
            return;
          }
        }
      } catch {}
      fit(map.objects);
    }
  }, [map, fit]);
  useEffect(() => {
    if (didFit.current) {
      const t = setTimeout(() => {
        try {
          localStorage.setItem('spread-viewport', JSON.stringify(viewport));
        } catch {}
      }, 200);
      return () => clearTimeout(t);
    }
  }, [viewport]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    change();
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    const install = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as unknown as { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', install);
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
      window.removeEventListener('beforeinstallprompt', install);
    };
  }, []);
  function patch(id: string, changes: Partial<CanvasObject>) {
    commit((m) => patchObject(m, id, changes));
  }
  function beginNew(
    type: Kind,
    role: CanvasObject['role'] = 'NORMAL',
    point = center(),
  ) {
    const base = ws.current.current;
    if (!base) return;
    const o = freePosition(
      base,
      makeObject(
        type,
        { x: point.x - 105, y: point.y - 40 },
        role,
        type === 'SEED_BOX'
          ? 'Loose ideas'
          : type === 'IMAGINATION'
            ? 'Imagination'
            : '',
      ),
    );
    const next = {
      ...base,
      anchorId: base.anchorId || o.id,
      objects: [...base.objects, o],
    };
    setSelected(new Set([o.id]));
    setExplicit(false);
    setEdge('');
    setConnecting('');
    if (type === 'NODE') {
      draftRef.current = next;
      setDraft(next);
      setEditing(o.id);
    } else {
      commit(next);
      setDetail(o.id);
    }
  }
  function addBranch(id: string) {
    act(() => {
      const base = ws.current.current;
      if (!base) return;
      const r = branch(base, id);
      draftRef.current = r.map;
      setDraft(r.map);
      setEditing(r.object.id);
      setSelected(new Set([r.object.id]));
      setExplicit(false);
    });
  }
  function saveText(id: string, text: string, cancel = false) {
    const pending = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    setEditing('');
    if (cancel || !text.trim()) {
      if (pending) setSelected(new Set());
      if (ws.current.current) ws.saveDraft(ws.current.current);
      return;
    }
    commit((m) => patchObject(pending || m, id, { text: text.trim() }));
  }
  function markGoal() {
    if (one)
      patch(one.id, {
        role: one.role === 'GOAL' ? 'NORMAL' : 'GOAL',
        width: one.role === 'GOAL' ? 210 : 280,
      });
  }
  function removeSelection(ids = selected, confirmed = false) {
    if (!map) return;
    if (edge && !ids.size) {
      commit((m) => removeEdge(m, edge));
      setEdge('');
      return;
    }
    const error = deletionError(map, ids);
    if (error) {
      notify(error);
      return;
    }
    if (
      !confirmed &&
      map.objects.some(
        (o) => ids.has(o.id) && o.type === 'SEED_BOX' && o.seeds.length,
      )
    ) {
      setConfirmDelete(new Set(ids));
      return;
    }
    act(() => {
      commit((m) => deleteObjects(m, ids));
      setSelected(new Set());
      setDetail('');
      setConfirmDelete(null);
      if (ids.has(focus)) setFocus('');
    });
  }
  function duplicateSelection(source?: VisionMap) {
    act(() => {
      const base = ws.current.current;
      if (!base) return;
      const r = duplicate(base, source || copySelection(base, selected));
      commit(r.map);
      setSelected(new Set(r.ids));
      setExplicit(true);
    });
  }
  function copy() {
    if (!map || !selected.size) return;
    clipboard.current = copySelection(map, selected);
    navigator.clipboard
      ?.writeText(JSON.stringify({ spreadSelection: clipboard.current }))
      .catch(() => {});
    notify(`${selected.size} object${selected.size > 1 ? 's' : ''} copied`);
  }
  async function files(
    input: File[],
    target?: string,
    replace?: string,
    _origin: ImageRequestOrigin = 'picker',
  ) {
    const images = input.filter((f) => f.type.startsWith('image/'));
    if (!images.length) {
      notify('Choose an image file.');
      return;
    }
    const chosen = ws.current.current?.objects.find(
      (o) => o.id === (target || [...selected][0]),
    );
    const list = chosen?.type === 'NODE' ? images.slice(0, 1) : images;
    const destinationId =
      chosen && chosen.type !== 'SEED_BOX' ? chosen.id : crypto.randomUUID();
    const createAt =
      chosen?.type === 'SEED_BOX'
        ? { x: chosen.x + chosen.width + 60, y: chosen.y }
        : chosen
          ? undefined
          : center();
    setBusy(true);
    try {
      for (const file of list) {
        try {
          const asset = await processImage(file);
          const request: PendingImageRequest = {
            asset,
            destinationId,
            createAt,
            replaceId: replace,
            origin: _origin,
            status: 'pending',
          };
          setPendingImages((current) => ({
            ...current,
            [asset.id]: request,
          }));
          await persistImageRequest(request);
        } catch (e) {
          notify((e as Error).message);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function persistImageRequest(request: PendingImageRequest) {
    setPendingImages((current) => ({
      ...current,
      [request.asset.id]: {
        ...request,
        status: 'pending',
        error: undefined,
      },
    }));
    const saved = await ws.commitWithAssets([request.asset], (current) =>
      applyImageReference(current, request),
    );
    if (!saved) {
      setPendingImages((current) => ({
        ...current,
        [request.asset.id]: {
          ...request,
          status: 'error',
          error: 'Storage full or unavailable',
        },
      }));
      notify('Image could not be saved. Retry or remove the pending image.');
      return;
    }
    setAssets((current) => ({
      ...current,
      [request.asset.id]: {
        ...request.asset,
        status: 'saved',
        error: undefined,
      },
    }));
    setPendingImages((current) => {
      const next = { ...current };
      delete next[request.asset.id];
      return next;
    });
  }
  function chooseImages(id?: string, replace?: string) {
    imageTarget.current = { id, replace };
    imageInput.current?.click();
  }
  async function retryStoredImage(id: string) {
    const a = assets[id];
    if (!a) return;
    try {
      await saveAsset(a);
      setAssets((current) => ({ ...current, [id]: { ...a, status: 'saved' } }));
      notify('Image saved');
    } catch {
      notify('Image could not be saved. Free some device storage and retry.');
    }
  }
  function plantSeed(boxId: string, seedId: string) {
    act(() => {
      const base = ws.current.current;
      if (!base) return;
      const box = base.objects.find((o) => o.id === boxId)!;
      const result = moveSeed(base, boxId, seedId, {
        x: box.x + box.width + 70,
        y: box.y,
      });
      commit(result.map);
      setSelected(new Set([result.id]));
      setDetail(result.id);
    });
  }
  function submitSeed() {
    if (!seedText.trim() || !seedBox) return;
    act(() => commit((m) => addSeed(m, seedBox, seedText)));
    setSeedText('');
    setSeedBox('');
  }
  function zoom(delta: number, absolute = false) {
    const d = dimensions(),
      zoom = Math.max(
        0.18,
        Math.min(2.5, absolute ? delta : viewport.zoom * delta),
      );
    setViewport({
      zoom,
      x: d.width / 2 - ((d.width / 2 - viewport.x) * zoom) / viewport.zoom,
      y: d.height / 2 - ((d.height / 2 - viewport.y) * zoom) / viewport.zoom,
    });
  }
  function exportMap() {
    if (!map) return;
    const used = new Set(map.objects.flatMap((o) => o.images));
    const data = {
      spreadBackup: 1,
      map,
      assets: Object.fromEntries(
        Object.entries(assets).filter(([id]) => used.has(id)),
      ),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${map.title.replace(/[^a-z0-9 -]/gi, '').trim() || 'spread'}.spread.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importMap(file: File) {
    try {
      const value = JSON.parse(await file.text());
      if (
        value.spreadBackup !== 1 ||
        value.map?.version !== 1 ||
        !Array.isArray(value.map.objects) ||
        !Array.isArray(value.map.relationships)
      )
        throw Error('Choose a SPREAD backup file.');
      const m = validateMap(value.map);
      for (const o of m.objects)
        for (const id of o.images)
          if (!value.assets?.[id]?.preview?.startsWith('data:image/'))
            throw Error('This backup is missing an image.');
      const imported = Object.values(value.assets || {}) as Asset[];
      if (!(await ws.commitWithAssets(imported, m)))
        throw Error('The backup could not be saved on this device.');
      setAssets((current) => ({
        ...current,
        ...Object.fromEntries(
          imported.map((asset) => [
            asset.id,
            { ...asset, status: 'saved', error: undefined },
          ]),
        ),
      }));
      setSelected(new Set());
      setFocus('');
      setDetail('');
      fit(m.objects);
      notify('Backup restored. Undo is available.');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const input = e.target as HTMLElement;
      const inField =
        /INPUT|TEXTAREA|SELECT/.test(input.tagName) || input.isContentEditable;
      if (inField) return;
      if (
        document.querySelector('[role="dialog"],[role="alertdialog"]') &&
        !detail
      )
        return;
      const mod = e.ctrlKey || e.metaKey,
        key = e.key.toLowerCase();
      if (e.key === 'Escape') {
        setFocus('');
        setConnecting('');
        setSelected(new Set());
        setEdge('');
        setDetail('');
        return;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === 'f') {
        e.preventDefault();
        setSearch(true);
        return;
      }
      if (mod && key === 'c' && selected.size) {
        e.preventDefault();
        copy();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        if (map) {
          setSelected(new Set(map.objects.map((o) => o.id)));
          setExplicit(true);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const seed = input.closest<HTMLElement>('[data-seed]')?.dataset.seed,
          box = input.closest<HTMLElement>('[data-object]')?.dataset.object;
        if (seed && box) {
          commit((m) =>
            patchObject(m, box, {
              seeds: m.objects
                .find((o) => o.id === box)!
                .seeds.filter((s) => s.id !== seed),
            }),
          );
        } else removeSelection();
        return;
      }
      if (e.key === 'Enter' && one) {
        e.preventDefault();
        setEditing(one.id);
        return;
      }
      if (!mod && key === 'f' && one?.type === 'NODE') {
        setFocus(focus ? '' : one.id);
        return;
      }
      if (!mod && key === 'v') setMode('select');
      if (!mod && key === 'h') setMode('pan');
      if (!mod && (key === '+' || key === '=')) {
        e.preventDefault();
        if (one?.type === 'NODE') addBranch(one.id);
        else zoom(1.15);
      }
      if (!mod && key === '-') zoom(1 / 1.15);
      if (mod && key === '0') {
        e.preventDefault();
        fit(map?.objects || []);
      }
      if (e.key.startsWith('Arrow') && selected.size) {
        e.preventDefault();
        const step = e.shiftKey ? 24 : 8;
        commit((m) =>
          moveObjects(m, selected, {
            x:
              e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
            y: e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
          }),
        );
      }
    };
    const paste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement;
      if (/INPUT|TEXTAREA/.test(el.tagName) || el.isContentEditable) return;
      const imageFiles = Array.from(e.clipboardData?.files || []);
      if (imageFiles.length) {
        e.preventDefault();
        if (
          shouldRejectImagePaste(
            imageFiles.map((file) => file.type),
            selected.size,
          )
        ) {
          notify(
            'Select one object to add this image, or clear selection to create an Imagination.',
          );
          return;
        }
        void files(imageFiles, undefined, undefined, 'paste');
        return;
      }
      try {
        const parsed = JSON.parse(e.clipboardData?.getData('text/plain') || '');
        if (parsed.spreadSelection?.objects?.length) {
          e.preventDefault();
          const source = validateMap(parsed.spreadSelection);
          if (source.objects.some((o) => o.images.some((id) => !assets[id])))
            throw Error(
              'Paste this selection in its original workspace, or use a backup to transfer images.',
            );
          duplicateSelection(source);
          return;
        }
      } catch {}
      if (clipboard.current) {
        e.preventDefault();
        duplicateSelection(clipboard.current);
      }
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('paste', paste);
    };
  });
  const commandRef = useRef({ map, commit });
  commandRef.current = { map, commit };
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: 'read_vision_map',
          description:
            'Read the current SPREAD map, including nodes and relationships.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: () => commandRef.current.map,
        },
        { signal: lifecycle.signal },
      );
      context.registerTool(
        {
          name: 'create_vision_node',
          description:
            'Create an independent node or goal in the current SPREAD map. The creation is undoable.',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' }, goal: { type: 'boolean' } },
            required: ['text'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: (input: unknown) => {
            const data = input as { text?: unknown; goal?: unknown };
            if (
              typeof data?.text !== 'string' ||
              !data.text.trim() ||
              (data.goal !== undefined && typeof data.goal !== 'boolean')
            )
              throw Error(
                'Provide non-empty text and an optional boolean goal.',
              );
            if (!commandRef.current.map) throw Error('Map is still loading.');
            const object = freePosition(
              commandRef.current.map,
              makeObject(
                'NODE',
                { x: 0, y: 0 },
                data.goal ? 'GOAL' : 'NORMAL',
                data.text.trim(),
              ),
            );
            flushSync(() =>
              commandRef.current.commit((m) => ({
                ...m,
                objects: [...m.objects, object],
              })),
            );
            return { id: object.id, text: object.text, role: object.role };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {}
    return () => lifecycle.abort();
  }, []);
  if (!map)
    return (
      <main className="spread-loading">
        <Network size={35} />
        <span>Opening your space…</span>
      </main>
    );
  const deleteReason = deletionError(map, selected);
  return (
    <Toaster>
      <main className={`spread-app ${detail ? 'with-details' : ''}`}>
        <header className="app-header">
          <div className="brand">
            <Network size={23} />
            <span>spread</span>
          </div>
          <span className="header-divider" />
          <DropdownMenu>
            <DropdownMenuTrigger className="map-title">
              {map.title}
              <ChevronDown size={15} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="spread-menu">
              <DropdownMenuItem
                onClick={() => {
                  commit((m) => ({
                    ...m,
                    title: 'Untitled vision',
                    anchorId: '',
                    objects: [],
                    relationships: [],
                  }));
                  setSelected(new Set());
                  setFocus('');
                  setDetail('');
                  fit([]);
                  notify('New canvas. Undo to return to your previous map.');
                }}
              >
                <FilePlus2 /> New canvas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportMap}>
                <Download /> Export backup
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => importInput.current?.click()}>
                <Upload /> Restore backup
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setHelp(true)}>
                <Keyboard /> Keyboard shortcuts
              </DropdownMenuItem>
              {installPrompt && (
                <DropdownMenuItem onClick={() => void installPrompt.prompt()}>
                  <Download /> Install SPREAD
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            className="title-edit"
            aria-label="Map title"
            title="Rename map"
            defaultValue={map.title}
            key={map.title}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== map.title)
                commit((m) => ({ ...m, title: e.target.value.trim() }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <output className="save-status">
            <span className={!online ? 'offline' : ''} />
            {busy
              ? 'Saving image…'
              : !online
                ? 'Offline · saved on this device'
                : ws.status}
          </output>
          <div className="history-tools">
            <button
              aria-label="Undo"
              title="Undo · Ctrl+Z"
              disabled={!ws.canUndo}
              onClick={undo}
            >
              <Undo2 size={18} />
            </button>
            <button
              aria-label="Redo"
              title="Redo · Ctrl+Shift+Z"
              disabled={!ws.canRedo}
              onClick={redo}
            >
              <Redo2 size={18} />
            </button>
          </div>
        </header>
        <SpreadCanvas
          map={draft || map}
          assets={assets}
          selected={selected}
          explicit={explicit}
          edge={edge}
          focus={focus}
          viewport={viewport}
          setViewport={setViewport}
          mode={mode}
          connecting={connecting}
          editing={editing}
          onText={saveText}
          onDraft={(id, text) => {
            const base = draftRef.current || ws.current.current;
            if (base && text.trim())
              ws.saveDraft(patchObject(base, id, { text }));
          }}
          onSelect={select}
          onEdge={(id) => {
            setEdge(id);
            setSelected(new Set());
            setDetail('');
          }}
          onCommit={commit}
          onBranch={addBranch}
          onEdit={setEditing}
          onCreate={(p) => beginNew('NODE', 'NORMAL', p)}
          onOpen={setDetail}
          onSeed={(id) => {
            setSeedBox(id);
            setSeedText('');
          }}
          onError={notify}
          onFiles={(input, target, origin) =>
            void files(input, target, undefined, origin)
          }
        >
          {map.objects.length === 0 && (
            <div className="empty-canvas" data-ui>
              <Target size={36} />
              <h1>Start somewhere.</h1>
              <p>
                A goal, a thought, a possibility.
                <br />
                You can find the connections as you go.
              </p>
              <button
                className="primary-button"
                onClick={() => beginNew('NODE', 'GOAL')}
              >
                <Plus size={17} /> Plant your first goal
              </button>
              <button className="text-action" onClick={() => beginNew('NODE')}>
                Or start with an idea
              </button>
            </div>
          )}
          {(focus || connecting) && (
            <div className="focus-banner" data-ui data-canvas-overlay>
              {connecting ? (
                <>
                  <Link2 size={16} />
                  Select another object to connect
                </>
              ) : (
                <>
                  <Focus size={16} />
                  Following {map.objects.find((o) => o.id === focus)?.text}
                </>
              )}
              <button
                aria-label="Exit focus or connection"
                onClick={() => {
                  setFocus('');
                  setConnecting('');
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!editing && (one || selected.size > 1 || edgeObject) && (
            <div className="context-tools" data-ui data-canvas-overlay>
              {edgeObject ? (
                <>
                  <span className="context-label">
                    {edgeObject.type.toLowerCase()}
                  </span>
                  {edgeObject.type === 'PATH' && (
                    <button
                      onClick={() =>
                        act(() => commit((m) => editEdge(m, edge, true)))
                      }
                    >
                      <ArrowLeftRight size={16} /> Reverse
                    </button>
                  )}
                  {edgeObject.type !== 'REFERENCE' &&
                    map.objects.find((o) => o.id === edgeObject.sourceId)
                      ?.type === 'NODE' &&
                    map.objects.find((o) => o.id === edgeObject.targetId)
                      ?.type === 'NODE' && (
                      <button
                        onClick={() =>
                          act(() =>
                            commit((m) =>
                              editEdge(
                                m,
                                edge,
                                false,
                                edgeObject.type === 'PATH' ? 'RELATED' : 'PATH',
                              ),
                            ),
                          )
                        }
                      >
                        Use {edgeObject.type === 'PATH' ? 'Related' : 'Path'}
                      </button>
                    )}
                  <button
                    title="Delete relationship"
                    onClick={() => removeSelection(new Set())}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              ) : one ? (
                <>
                  {one.type === 'NODE' ? (
                    <>
                      <button onClick={() => chooseImages(one.id)}>
                        <ImageIcon size={16} /> Image
                      </button>
                      <button onClick={markGoal}>
                        <Target size={16} />
                        {one.role === 'GOAL' ? 'Unmark goal' : 'Mark as goal'}
                      </button>
                      <button
                        onClick={() => setFocus(focus === one.id ? '' : one.id)}
                      >
                        <Focus size={16} /> Focus
                      </button>
                    </>
                  ) : one.type === 'SEED_BOX' ? (
                    <>
                      <Popover
                        open={seedBox === one.id && !detail}
                        onOpenChange={(open) => {
                          setSeedBox(open ? one.id : '');
                          setSeedText('');
                        }}
                      >
                        <PopoverTrigger
                          className="context-button"
                          disabled={one.seeds.length >= 30}
                        >
                          <Plus size={16} /> Add seed
                        </PopoverTrigger>
                        <PopoverContent className="seed-popover">
                          <PopoverTitle>A loose idea</PopoverTitle>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              submitSeed();
                            }}
                          >
                            <input
                              autoFocus
                              aria-label="New seed"
                              maxLength={500}
                              value={seedText}
                              onChange={(e) => setSeedText(e.target.value)}
                              placeholder="What’s on your mind?"
                            />
                            <button
                              className="primary-button"
                              disabled={!seedText.trim()}
                            >
                              Add seed
                            </button>
                          </form>
                        </PopoverContent>
                      </Popover>
                      <button
                        onClick={() =>
                          patch(one.id, {
                            shuffle: nextVisualShuffle(one.shuffle),
                          })
                        }
                      >
                        <Shuffle size={16} /> Shuffle
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => chooseImages(one.id)}>
                        <Plus size={16} /> Add image
                      </button>
                      <button onClick={() => setDetail(one.id)}>
                        <Maximize2 size={16} /> Open
                      </button>
                    </>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      title="More actions"
                      className="more-button"
                    >
                      <MoreHorizontal size={20} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="spread-menu" align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setConnecting(one.id);
                          setDetail('');
                        }}
                      >
                        <Link2 /> Connect
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDetail(one.id)}>
                        <PanelRight /> Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditing(one.id)}>
                        Edit text
                      </DropdownMenuItem>
                      {one.type === 'NODE' && (
                        <DropdownMenuItem
                          onClick={() => select(reachable(map, one.id), true)}
                        >
                          <Network /> Select branch
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => fit([one])}>
                        <Scan /> Fit selection
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={copy}>
                        <Copy /> Copy
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicateSelection()}>
                        <Copy /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!!deleteReason}
                        title={deleteReason || ''}
                        variant="destructive"
                        onClick={() => removeSelection()}
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <span className="context-label">
                    {selected.size} selected
                  </span>
                  <button
                    onClick={() =>
                      fit(map.objects.filter((o) => selected.has(o.id)))
                    }
                  >
                    <Scan size={16} /> Fit selection
                  </button>
                  <button onClick={() => duplicateSelection()}>
                    <Copy size={16} /> Duplicate
                  </button>
                  <button
                    disabled={!!deleteReason}
                    title={deleteReason || 'Delete selected objects'}
                    onClick={() => removeSelection()}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          )}
          <div className="main-tools" data-ui data-canvas-overlay>
            <button
              className={mode === 'select' ? 'active' : ''}
              aria-label="Select tool"
              title="Select · V"
              onClick={() => setMode('select')}
            >
              <MousePointer2 size={19} />
            </button>
            <button
              className={mode === 'pan' ? 'active' : ''}
              aria-label="Pan tool"
              title="Pan · Right mouse drag / Space+drag / H"
              onClick={() => setMode('pan')}
            >
              <Hand size={19} />
            </button>
            <i />
            <DropdownMenu>
              <DropdownMenuTrigger className="create-button">
                <Plus size={18} /> Create <ChevronDown size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="spread-menu"
                side="top"
                sideOffset={12}
              >
                {(['NODE', 'GOAL', 'SEED_BOX', 'IMAGINATION'] as const).map(
                  (t) => {
                    const Icon = icons[t];
                    return (
                      <DropdownMenuItem
                        key={t}
                        onClick={() =>
                          beginNew(
                            t === 'GOAL' ? 'NODE' : t,
                            t === 'GOAL' ? 'GOAL' : 'NORMAL',
                          )
                        }
                      >
                        <Icon />
                        {labels[t]}
                      </DropdownMenuItem>
                    );
                  },
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <i />
            <button
              title="Search · Ctrl+F"
              aria-label="Search map"
              onClick={() => setSearch(true)}
            >
              <Search size={19} />
            </button>
            <button
              title="Fit graph · Ctrl+0"
              aria-label="Fit graph"
              onClick={() => fit(map.objects)}
            >
              <Scan size={19} />
            </button>
          </div>
          <div className="canvas-footer">
            <span>
              <b /> Path <i /> Related <em /> Reference
            </span>
            <span>
              {map.objects.length} objects · Double-click to plant an idea
            </span>
          </div>
          <div className="zoom-tools" data-ui>
            <button aria-label="Zoom out" onClick={() => zoom(1 / 1.15)}>
              <Minus size={15} />
            </button>
            <button
              className="zoom-value"
              title="Reset zoom to 100%"
              onClick={() => zoom(1, true)}
            >
              {Math.round(viewport.zoom * 100)}%
            </button>
            <button aria-label="Zoom in" onClick={() => zoom(1.15)}>
              <Plus size={15} />
            </button>
          </div>
        </SpreadCanvas>
        <ObjectDetails
          object={map.objects.find((o) => o.id === detail) || null}
          assets={assets}
          onClose={() => setDetail('')}
          onDraft={(id, changes) => {
            if (ws.current.current)
              ws.saveDraft(patchObject(ws.current.current, id, changes));
          }}
          onPatch={patch}
          onImages={chooseImages}
          onRetry={retryStoredImage}
          onSeed={(id) => {
            setSeedBox(id);
            setSeedText('');
          }}
          onConvert={plantSeed}
          onView={setViewer}
        />
        <Dialog open={search} onOpenChange={setSearch}>
          <DialogContent className="search-dialog">
            <DialogTitle className="sr-only">Search your vision</DialogTitle>
            <DialogDescription className="sr-only">
              Search nodes, goals, seeds, and imagination.
            </DialogDescription>
            <Command>
              <CommandInput placeholder="Find something in your vision…" />
              <CommandList>
                <CommandEmpty>No matches. Try a different word.</CommandEmpty>
                <CommandGroup heading="In this map">
                  {map.objects.map((o) => (
                    <CommandItem
                      key={o.id}
                      value={`${o.id} ${o.text} ${o.type === 'IMAGINATION' ? o.note : ''} ${o.seeds.map((s) => s.text).join(' ')}`}
                      onSelect={() => {
                        setSelected(new Set([o.id]));
                        setExplicit(false);
                        setEdge('');
                        fit([o]);
                        setSearch(false);
                      }}
                    >
                      <span className="search-type">
                        {o.type === 'NODE'
                          ? o.role === 'GOAL'
                            ? '◎'
                            : '○'
                          : o.type === 'SEED_BOX'
                            ? '✳'
                            : '▧'}
                      </span>
                      <span>
                        {o.text}
                        <small>
                          {o.type === 'SEED_BOX'
                            ? o.seeds.map((s) => s.text).join(' · ')
                            : labels[o.type]}
                        </small>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
        <Dialog
          open={
            !!seedBox &&
            !(one?.type === 'SEED_BOX' && one.id === seedBox && !detail)
          }
          onOpenChange={(open) => {
            if (!open) setSeedBox('');
          }}
        >
          <DialogContent>
            <DialogTitle>A loose idea</DialogTitle>
            <DialogDescription>
              You don’t have to know where it leads yet.
            </DialogDescription>
            <form
              className="seed-form"
              onSubmit={(e) => {
                e.preventDefault();
                submitSeed();
              }}
            >
              <input
                autoFocus
                aria-label="New seed text"
                maxLength={500}
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                placeholder="What’s on your mind?"
              />
              <button className="primary-button" disabled={!seedText.trim()}>
                Add seed
              </button>
            </form>
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={!!confirmDelete}
          onOpenChange={(open) => {
            if (!open) setConfirmDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>
              Delete this Seed Box and its seeds?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This selection includes{' '}
              {map.objects
                .filter((o) => confirmDelete?.has(o.id))
                .reduce((n, o) => n + o.seeds.length, 0)}{' '}
              seeds. You can restore them with Undo.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="danger-button"
                onClick={() =>
                  confirmDelete && removeSelection(confirmDelete, true)
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog
          open={!!viewer}
          onOpenChange={(open) => {
            if (!open) setViewer('');
          }}
        >
          <DialogContent className="image-viewer">
            <DialogTitle>{assets[viewer]?.filename || 'Image'}</DialogTitle>
            <DialogDescription className="sr-only">
              Full image preview
            </DialogDescription>
            <img
              src={assets[viewer]?.full}
              alt={assets[viewer]?.filename || 'Image'}
            />
          </DialogContent>
        </Dialog>
        <Dialog open={help} onOpenChange={setHelp}>
          <DialogContent className="help-dialog">
            <DialogTitle>A few ways to spread</DialogTitle>
            <DialogDescription>
              Direct actions, a little room to explore.
            </DialogDescription>
            <div className="shortcuts">
              {[
                ['Create an independent node', 'Double-click canvas'],
                ['Add the next node / contributor', 'Select node, then +'],
                ['Edit text', 'Enter / double-click'],
                ['Select several objects', 'Ctrl + click / drag canvas'],
                ['Move view', 'Right mouse drag / Space + drag / middle mouse'],
                ['Zoom', 'Wheel / pinch'],
                ['Connect existing objects', 'More → Connect'],
                ['Focus on a node', 'F'],
                ['Search', 'Ctrl + F'],
                ['Fit graph', 'Ctrl + 0'],
                ['Move selection precisely', 'Arrow keys / Shift + arrows'],
                ['Copy / paste / duplicate', 'Ctrl + C / V / D'],
                ['Undo / redo', 'Ctrl + Z / Shift + Z'],
                ['Leave focus or connection', 'Esc'],
              ].map(([label, key]) => (
                <div key={label}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <p className="muted">
              Your map and images are stored on this device. Export a backup to
              move them to another device.
            </p>
          </DialogContent>
        </Dialog>
        {(Object.keys(pendingImages).length > 0 ||
          ws.orphanedAssets.length > 0) && (
          <aside className="image-repair-tray" data-canvas-overlay>
            {Object.values(pendingImages).map((request) => (
              <div className="image-repair-item" key={request.asset.id}>
                <img
                  src={request.asset.preview}
                  alt={request.asset.filename}
                />
                <span>
                  <strong>{request.asset.filename}</strong>
                  <small>
                    {request.status === 'pending'
                      ? 'Saving image…'
                      : request.error}
                  </small>
                </span>
                {request.status === 'error' && (
                  <>
                    <button onClick={() => void persistImageRequest(request)}>
                      Retry
                    </button>
                    <button
                      onClick={() =>
                        setPendingImages((current) => {
                          const next = { ...current };
                          delete next[request.asset.id];
                          return next;
                        })
                      }
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
            {ws.orphanedAssets.map((id) => (
              <div className="image-repair-item legacy" key={id}>
                <span>
                  <strong>Image unavailable</strong>
                  <small>
                    Original image data is no longer available. Retry is not
                    possible.
                  </small>
                </span>
                <button onClick={() => ws.dismissOrphanedAsset(id)}>
                  Remove
                </button>
              </div>
            ))}
          </aside>
        )}
        <input
          hidden
          ref={imageInput}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            void files(
              Array.from(e.target.files || []),
              imageTarget.current.id,
              imageTarget.current.replace,
              'picker',
            );
            e.target.value = '';
          }}
        />
        <input
          hidden
          ref={importInput}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importMap(file);
            e.target.value = '';
          }}
        />
      </main>
    </Toaster>
  );
}
