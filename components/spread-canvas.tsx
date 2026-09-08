'use client';
/* oxlint-disable react/react-compiler -- Pointer transaction refs are read synchronously; the React compiler is not enabled. */
/* oxlint-disable next/no-img-element -- Device-local images are already decoded and resized to thumbnails before rendering. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- Spatial graph objects and SVG paths expose keyboard actions and accessible roles without invalid nested buttons. */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  Plus,
  Target,
  Sprout,
  Image as ImageIcon,
  Grip,
  ArrowUpRight,
} from 'lucide-react';
import {
  objectHeight,
  seedLayout,
  edgePath,
  reachable,
  moveSeed,
  patchObject,
  pointerSelectionPlan,
  predictiveLayout,
} from '@/lib/graph';
import type { CanvasObject, VisionMap, Point } from '@/lib/graph';
import type { Asset } from '@/lib/storage';
import type { ImageRequestOrigin } from '@/lib/image-request';
import { edgeOccluders } from '@/lib/edge-occlusion';
const canvasOverlay = '[data-canvas-overlay]';
export type Viewport = Point & { zoom: number };
type Props = {
  map: VisionMap;
  assets: Record<string, Asset>;
  selected: Set<string>;
  explicit: boolean;
  edge: string;
  focus: string;
  viewport: Viewport;
  setViewport: (v: Viewport) => void;
  mode: 'select' | 'pan';
  connecting: string;
  editing: string;
  onText: (id: string, text: string, cancel?: boolean) => void;
  onDraft: (id: string, text: string) => void;
  onSelect: (ids: Set<string>, explicit?: boolean) => void;
  onEdge: (id: string) => void;
  onCommit: (m: VisionMap) => void;
  onBranch: (id: string) => void;
  onEdit: (id: string) => void;
  onCreate: (p: Point) => void;
  onOpen: (id: string) => void;
  onSeed: (id: string) => void;
  onError: (s: string) => void;
  onFiles: (
    files: File[],
    target?: string,
    origin?: ImageRequestOrigin,
  ) => void;
  children?: React.ReactNode;
};
type Gesture = {
  kind: 'pan' | 'move' | 'marquee' | 'seed' | 'resize';
  start: Point;
  screen: Point;
  base: VisionMap;
  view: Viewport;
  ids: Set<string>;
  id: string;
  seed?: string;
  moved: boolean;
  additive: boolean;
  explicit: boolean;
};

function InlineText({
  object,
  save,
  draft,
}: {
  object: CanvasObject;
  save: Props['onText'];
  draft: Props['onDraft'];
}) {
  const [value, setValue] = useState(object.text),
    done = useRef(false),
    input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  function finish(cancel = false) {
    if (!done.current) {
      done.current = true;
      save(object.id, value, cancel);
    }
  }
  return (
    <textarea
      ref={input}
      className="inline-editor"
      aria-label="Object text"
      placeholder="What comes next?"
      value={value}
      rows={Math.max(2, Math.ceil(value.length / 20))}
      onChange={(e) => {
        setValue(e.target.value);
        draft(object.id, e.target.value);
      }}
      onBlur={() => finish()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(true);
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish();
        }
      }}
    />
  );
}
const Card = memo(function Card({
  object: o,
  assets,
  selected,
  editing,
  zoom,
  onText,
  onDraft,
  onBranch,
  onSeed,
  onOpen,
}: {
  object: CanvasObject;
  assets: Props['assets'];
  selected: boolean;
  editing: boolean;
  zoom: number;
  onText: Props['onText'];
  onDraft: Props['onDraft'];
  onBranch: Props['onBranch'];
  onSeed: Props['onSeed'];
  onOpen: Props['onOpen'];
}) {
  const images = o.images.map((id) => assets[id]);
  const layout = useMemo(() => seedLayout(o), [o]);
  return (
    <>
      {o.role === 'GOAL' && o.type === 'NODE' && images.length > 0 && (
        <div className="hero-image">
          <img
            src={images[0]?.preview}
            alt={images[0]?.filename || 'Image unavailable'}
            draggable={false}
            style={{ objectPosition: `50% ${o.focal}%` }}
          />
        </div>
      )}
      {o.role === 'GOAL' && (
        <div className="object-label">
          <Target size={15} /> GOAL
        </div>
      )}
      {o.type === 'SEED_BOX' && (
        <div className="object-label">
          <Sprout size={17} /> SEED BOX{' '}
          <span>
            {o.seeds.length}/{o.tier}
          </span>
        </div>
      )}
      {o.type === 'IMAGINATION' && (
        <div className="object-label">
          <ImageIcon size={17} /> IMAGINATION{' '}
          <span>{o.images.length || ''}</span>
        </div>
      )}
      <div className="node-content">
        {o.type === 'NODE' &&
          o.role === 'NORMAL' &&
          images.length > 0 &&
          zoom > 0.55 && (
            <img
              className="node-thumbnail"
              src={images[0]?.preview}
              alt={images[0]?.filename || 'Image unavailable'}
              draggable={false}
              style={{ objectPosition: `50% ${o.focal}%` }}
            />
          )}
        {editing ? (
          <InlineText key={o.id} object={o} save={onText} draft={onDraft} />
        ) : (
          <div className="object-text">{o.text || 'New idea'}</div>
        )}
      </div>
      {o.type === 'SEED_BOX' && (
        <>
          <div
            className="seed-bed"
            key={o.shuffle}
            style={{ height: layout.height }}
          >
            {layout.positions.map(
              ({ seed: s, x, y, width, height, rotation }, i) => (
                <div
                  key={s.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${s.text}. Open Seed Box to edit, delete or turn into a node.`}
                  data-seed={s.id}
                  className="seed"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    left: x,
                    top: y,
                    width,
                    height,
                    animationDelay: `${Math.min(i * 12, 120)}ms`,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      onOpen(o.id);
                    }
                  }}
                >
                  {s.text}
                </div>
              ),
            )}
          </div>
          <button
            className="box-add"
            title={
              o.seeds.length >= 30
                ? 'Maximum 30 seeds in this Seed Box.'
                : 'Add seed'
            }
            disabled={o.seeds.length >= 30}
            onClick={() => onSeed(o.id)}
          >
            <Plus size={17} />
          </button>
        </>
      )}
      {o.type === 'IMAGINATION' &&
        (images.length ? (
          <div
            className={`image-grid count-${Math.min(images.length, 6)}`}
            onDoubleClick={() => onOpen(o.id)}
          >
            {images.slice(0, 6).map((a, i) => (
              <div className="image-slot" key={o.images[i]}>
                <img
                  loading="lazy"
                  decoding="async"
                  src={a?.preview}
                  alt={a?.filename || 'Image unavailable'}
                  draggable={false}
                />
                {i === 5 && images.length > 6 && (
                  <button
                    className="image-overflow"
                    onClick={() => onOpen(o.id)}
                  >
                    +{images.length - 6}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <button className="image-empty" onClick={() => onOpen(o.id)}>
            <ImageIcon size={28} />
            <span>Drop images. Find a feeling.</span>
          </button>
        ))}
      {images.some((a) => !a || a.status === 'error') && (
        <button className="asset-error" onClick={() => onOpen(o.id)}>
          Image storage issue · Retry or remove
        </button>
      )}
      {o.type === 'NODE' && (
        <button
          className="branch-plus"
          title={o.role === 'GOAL' ? 'Add contributor' : 'Add next node'}
          aria-label={o.role === 'GOAL' ? 'Add contributor' : 'Add branch'}
          onClick={() => onBranch(o.id)}
        >
          <Plus size={18} />
        </button>
      )}
      {selected && (
        <span
          role="separator"
          aria-label="Resize object using drag, or open details for keyboard resizing"
          data-resize="true"
          className="resize-grip"
        >
          <Grip size={13} />
        </span>
      )}
    </>
  );
});
export function SpreadCanvas(p: Props) {
  const root = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    space = useRef(false),
    pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{
      distance: number;
      view: Viewport;
      center: Point;
    } | null>(null),
    previewRef = useRef<VisionMap | null>(null),
    invalidRef = useRef('');
  const [preview, setPreview] = useState<VisionMap | null>(null),
    [invalid, setInvalid] = useState(''),
    [target, setTarget] = useState(''),
    [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const viewRef = useRef(p.viewport);
  viewRef.current = p.viewport;
  const display = preview || p.map;
  const rightPress = useRef<{ id: string } | null>(null);
  const [panning, setPanning] = useState(false);
  const occlusionRects = useMemo(
    () =>
      display.objects
        .filter((o) => o.type === 'NODE')
        .map((o) => ({
          id: o.id,
          x: o.x,
          y: o.y,
          width: o.width,
          height: objectHeight(o),
        })),
    [display.objects],
  );
  const edgeCovers = useMemo(() => {
    const index = new Map(display.objects.map((o) => [o.id, o]));
    return new Map(
      display.relationships.map((edge) => {
        const a = index.get(edge.sourceId),
          b = index.get(edge.targetId);
        return [
          edge.id,
          a && b
            ? edgeOccluders(edgePath(a, b), occlusionRects, a.id, b.id)
            : [],
        ];
      }),
    );
  }, [display.objects, display.relationships, occlusionRects]);
  const objectIndex = useMemo(
    () => new Map(display.objects.map((o) => [o.id, o])),
    [display.objects],
  );
  const highlighted = useMemo(
    () =>
      p.focus
        ? new Set([
            ...reachable(p.map, p.focus),
            ...reachable(p.map, p.focus, true),
          ])
        : null,
    [p.map, p.focus],
  );
  function world(client: Point, v = p.viewport): Point {
    const r = root.current!.getBoundingClientRect();
    return {
      x: (client.x - r.left - v.x) / v.zoom,
      y: (client.y - r.top - v.y) / v.zoom,
    };
  }
  function setLive(m: VisionMap | null, error = '') {
    previewRef.current = m;
    invalidRef.current = error;
    setPreview(m);
    setInvalid(error);
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)
      ) {
        space.current = true;
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        setPanning(false);
        rightPress.current = null;
        gesture.current = null;
        setLive(null);
        setMarquee(null);
        setTarget('');
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    const blur = () => {
      setPanning(false);
      rightPress.current = null;
      space.current = false;
      gesture.current = null;
      setLive(null);
      setMarquee(null);
      pointers.current.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  const updateViewport = p.setViewport;
  useEffect(() => {
    const el = root.current!;
    const wheel = (e: WheelEvent) => {
      if (
        (e.target as HTMLElement).closest(
          `button,input,textarea,[data-ui],${canvasOverlay}`,
        )
      )
        return;
      e.preventDefault();
      const v = viewRef.current,
        r = el.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top;
      const z = Math.max(
        0.18,
        Math.min(2.5, v.zoom * Math.exp(-e.deltaY * 0.0015)),
      );
      updateViewport({
        x: x - ((x - v.x) * z) / v.zoom,
        y: y - ((y - v.y) * z) / v.zoom,
        zoom: z,
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [updateViewport]);
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (
      el.closest(`button,input,textarea,[data-ui],${canvasOverlay}`)
    )
      return;
    if (e.button === 2) e.preventDefault();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        view: p.viewport,
        center: world({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
      };
      gesture.current = null;
      setLive(null);
      return;
    }
    const objId =
      el.closest<HTMLElement>('[data-object]')?.dataset.object || '';
    rightPress.current = e.button === 2 ? { id: objId } : null;
    const pan =
      p.mode === 'pan' || space.current || e.button === 1 || e.button === 2;
    if (p.connecting && objId && !pan) {
      p.onSelect(new Set([objId]));
      return;
    }
    setPanning(pan);
    if (!pan && el.closest('[data-edge]')) return;
    let ids = new Set<string>();
    let gestureExplicit = false;
    if (!pan && objId) {
      const plan = pointerSelectionPlan(
        p.map,
        p.selected,
        p.explicit,
        objId,
        e.ctrlKey || e.metaKey,
      );
      p.onSelect(plan.visibleSelection, plan.explicit);
      if (!plan.startDrag) return;
      ids = plan.movementIds;
      gestureExplicit = plan.explicit;
    }
    gesture.current = {
      kind: pan
        ? 'pan'
        : el.closest('[data-resize]')
          ? 'resize'
          : el.closest('[data-seed]')
            ? 'seed'
            : objId
              ? 'move'
              : 'marquee',
      start: world({ x: e.clientX, y: e.clientY }),
      screen: { x: e.clientX, y: e.clientY },
      view: p.viewport,
      base: p.map,
      ids,
      id: objId,
      seed: el.closest<HTMLElement>('[data-seed]')?.dataset.seed,
      moved: false,
      additive: e.shiftKey,
      explicit: gestureExplicit,
    };
    if (!pan && !objId && !e.shiftKey) p.onSelect(new Set());
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()],
        s = pinch.current,
        r = root.current!.getBoundingClientRect(),
        zoom = Math.max(
          0.18,
          Math.min(
            2.5,
            (s.view.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / s.distance,
          ),
        );
      p.setViewport({
        zoom,
        x: (a.x + b.x) / 2 - r.left - s.center.x * zoom,
        y: (a.y + b.y) / 2 - r.top - s.center.y * zoom,
      });
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.screen.x,
      dy = e.clientY - g.screen.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    root.current!.setPointerCapture(e.pointerId);
    if (g.kind === 'pan') {
      p.setViewport({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
      return;
    }
    const pt = world({ x: e.clientX, y: e.clientY }),
      delta = { x: pt.x - g.start.x, y: pt.y - g.start.y };
    if (g.kind === 'marquee') {
      setMarquee({ start: g.start, end: pt });
      const ids = new Set(g.additive ? p.selected : []);
      for (const o of g.base.objects) {
        if (
          o.x + o.width >= Math.min(pt.x, g.start.x) &&
          o.x <= Math.max(pt.x, g.start.x) &&
          o.y + objectHeight(o) >= Math.min(pt.y, g.start.y) &&
          o.y <= Math.max(pt.y, g.start.y)
        )
          ids.add(o.id);
      }
      p.onSelect(ids, true);
      return;
    }
    if (g.kind === 'resize') {
      const o = g.base.objects.find((o) => o.id === g.id)!;
      const width = Math.max(
        o.type === 'NODE' ? 160 : 280,
        Math.min(o.type === 'NODE' ? 520 : 900, o.width + delta.x),
      );
      setLive(
        patchObject(g.base, g.id, {
          width,
          height: Math.max(
            o.type === 'SEED_BOX' ? 115 + o.seeds.length * 48 : 180,
            o.height + delta.y,
          ),
        }),
      );
      return;
    }
    const hit = [...g.base.objects]
      .reverse()
      .find(
        (o) =>
          o.id !== g.id &&
          pt.x >= o.x - 14 &&
          pt.x <= o.x + o.width + 14 &&
          pt.y >= o.y - 14 &&
          pt.y <= o.y + objectHeight(o) + 14,
      );
    if (g.kind === 'seed') {
      setTarget(hit?.id || '');
      try {
        setLive(moveSeed(g.base, g.id, g.seed!, pt, hit?.id).map);
      } catch (err) {
        setLive(g.base, (err as Error).message);
      }
      return;
    }
    const draggedObject = g.base.objects.find((object) => object.id === g.id);
    const semanticTarget =
      hit && !g.explicit && draggedObject?.type === 'NODE' && hit.type === 'NODE'
        ? hit
        : undefined;
    setTarget(semanticTarget?.id || '');
    const result = predictiveLayout({
      baseMap: g.base,
      movingIds: g.ids,
      dragDelta: delta,
      draggedRootId: g.id,
      optionalTargetId: semanticTarget?.id,
      explicitSelection: g.explicit,
    });
    setLive(result.previewMap, result.valid ? undefined : result.message);
  }
  function up(e: ReactPointerEvent<HTMLDivElement>) {
    setPanning(false);
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      gesture.current = null;
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    if (e.button === 2 && rightPress.current?.id && !g?.moved) {
      p.onSelect(new Set([rightPress.current.id]));
      p.onOpen(rightPress.current.id);
    }
    rightPress.current = null;
    if (g?.moved && previewRef.current && g.base === p.map) {
      if (invalidRef.current) p.onError(invalidRef.current);
      else {
        let next = previewRef.current;
        if (g.kind === 'move')
          next = {
            ...next,
            objects: next.objects.map((o) =>
              g.ids.has(o.id) && o.type === 'SEED_BOX'
                ? { ...o, shuffle: Math.random() }
                : o,
            ),
          };
        p.onCommit(next);
      }
    }
    setLive(null);
    setTarget('');
    setMarquee(null);
  }
  return (
    <div
      ref={root}
      className={`canvas ${p.mode === 'pan' ? 'pan-mode' : ''} ${panning ? 'is-panning' : ''} ${p.connecting ? 'connect-mode' : ''} ${p.viewport.zoom < 0.45 ? 'far-zoom' : p.viewport.zoom < 0.7 ? 'medium-zoom' : ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        setPanning(false);
        rightPress.current = null;
        gesture.current = null;
        setLive(null);
        setMarquee(null);
        setTarget('');
        pointers.current.clear();
        pinch.current = null;
      }}
      onDoubleClick={(e) => {
        const el = e.target as HTMLElement;
        if (
          el.closest(`button,input,textarea,[data-ui],${canvasOverlay}`)
        )
          return;
        const id = el.closest<HTMLElement>('[data-object]')?.dataset.object;
        if (id) {
          const o = p.map.objects.find((o) => o.id === id);
          if (o?.type === 'NODE') p.onEdit(id);
          else p.onOpen(id);
        } else p.onCreate(world({ x: e.clientX, y: e.clientY }));
      }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest(canvasOverlay)) return;
        e.preventDefault();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          const id = (e.target as HTMLElement).closest<HTMLElement>(
            '[data-object]',
          )?.dataset.object;
          p.onFiles(Array.from(e.dataTransfer.files), id, 'drop');
        }
      }}
    >
      <div className="canvas-heading">
        <span className="eyebrow">YOUR VISION, UNFOLDING</span>
        <p>A little space for what comes next.</p>
      </div>
      <div
        className="world"
        style={{
          transform: `translate(${p.viewport.x}px,${p.viewport.y}px) scale(${p.viewport.zoom})`,
        }}
      >
        <svg className="edges">
          <defs>
            <filter
              id="edge-soft-cover"
              x="-30%"
              y="-50%"
              width="160%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur stdDeviation="11" />
            </filter>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M1 1L9 5L1 9"
                fill="none"
                stroke="context-stroke"
                strokeWidth="1.5"
              />
            </marker>
          </defs>
          {display.relationships.map((e) => {
            const a = objectIndex.get(e.sourceId),
              b = objectIndex.get(e.targetId);
            if (!a || !b) return null;
            const d = edgePath(a, b),
              dim =
                highlighted &&
                !(highlighted.has(a.id) && highlighted.has(b.id));
            const covers = edgeCovers.get(e.id) || [];
            const maskId = `edge-cover-${e.id}`;
            return (
              <g key={e.id} style={{ opacity: dim ? 0.15 : 1 }}>
                {covers.length > 0 && (
                  <mask
                    id={maskId}
                    maskUnits="userSpaceOnUse"
                    x={Math.min(a.x, b.x, ...covers.map((o) => o.x)) - 100}
                    y={Math.min(a.y, b.y, ...covers.map((o) => o.y)) - 100}
                    width={
                      Math.max(
                        a.x + a.width,
                        b.x + b.width,
                        ...covers.map((o) => o.x + o.width),
                      ) -
                      Math.min(a.x, b.x, ...covers.map((o) => o.x)) +
                      200
                    }
                    height={
                      Math.max(
                        a.y + objectHeight(a),
                        b.y + objectHeight(b),
                        ...covers.map((o) => o.y + o.height),
                      ) -
                      Math.min(a.y, b.y, ...covers.map((o) => o.y)) +
                      200
                    }
                    style={{ maskType: 'luminance' }}
                  >
                    <rect
                      x="-1000000"
                      y="-1000000"
                      width="2000000"
                      height="2000000"
                      fill="white"
                    />
                    {covers.map((o) => (
                      <rect
                        key={o.id}
                        x={o.x}
                        y={o.y}
                        width={o.width}
                        height={o.height}
                        rx={14}
                        fill="black"
                        fillOpacity={1}
                        filter="url(#edge-soft-cover)"
                      />
                    ))}
                  </mask>
                )}
                <path
                  d={d}
                  mask={covers.length ? `url(#${maskId})` : undefined}
                  className={`edge ${e.type.toLowerCase()} ${p.edge === e.id ? 'selected-edge' : ''}`}
                  markerEnd={e.type === 'PATH' ? 'url(#arrow)' : undefined}
                />
                <path
                  data-edge={e.id}
                  d={d}
                  className="edge-hit"
                  role="button"
                  tabIndex={0}
                  aria-label={`${a.text} ${e.type === 'PATH' ? 'contributes toward' : e.type === 'RELATED' ? 'related to' : 'references'} ${b.text}`}
                  onPointerDown={(ev) => {
                    if (ev.button === 0) ev.stopPropagation();
                  }}
                  onClick={() => p.onEdge(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') p.onEdge(e.id);
                  }}
                />
              </g>
            );
          })}
        </svg>
        {display.objects.map((o) => (
          <div
            key={o.id}
            data-object={o.id}
            tabIndex={0}
            role="group"
            aria-label={`${o.role === 'GOAL' ? 'Goal' : o.type.replace('_', ' ')}: ${o.text}`}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                p.onSelect(new Set([o.id]));
                p.onEdit(o.id);
              }
              if (e.key === ' ') {
                e.preventDefault();
                p.onSelect(new Set([o.id]));
              }
            }}
            className={`canvas-object ${o.type.toLowerCase()} ${o.role.toLowerCase()} ${p.selected.has(o.id) ? 'selected' : ''} ${target === o.id ? (invalid ? 'invalid-target' : 'drop-target') : ''} ${preview && gesture.current?.ids.has(o.id) ? 'dragging' : ''}`}
            style={
              {
                left: o.x,
                top: o.y,
                width: o.width,
                minHeight: objectHeight(o),
                height: o.type !== 'NODE' ? o.height : undefined,
                opacity: highlighted && !highlighted.has(o.id) ? 0.18 : 1,
              } as CSSProperties
            }
          >
            <Card
              object={o}
              assets={p.assets}
              selected={p.selected.has(o.id)}
              editing={p.editing === o.id}
              zoom={p.viewport.zoom}
              onText={p.onText}
              onDraft={p.onDraft}
              onBranch={p.onBranch}
              onSeed={p.onSeed}
              onOpen={p.onOpen}
            />
          </div>
        ))}
        {marquee && (
          <div
            className="marquee"
            style={{
              left: Math.min(marquee.start.x, marquee.end.x),
              top: Math.min(marquee.start.y, marquee.end.y),
              width: Math.abs(marquee.start.x - marquee.end.x),
              height: Math.abs(marquee.start.y - marquee.end.y),
            }}
          />
        )}
      </div>
      {target && (
        <div className={`drag-message ${invalid ? 'error' : ''}`}>
          {invalid || (
            <>
              <ArrowUpRight size={15} /> Release to connect here
            </>
          )}
        </div>
      )}
      {p.children}
    </div>
  );
}
