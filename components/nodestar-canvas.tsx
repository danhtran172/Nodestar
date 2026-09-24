'use client';
/* oxlint-disable react/react-compiler -- Pointer transaction refs are read synchronously; the React compiler is not enabled. */
/* oxlint-disable next/no-img-element -- Device-local images are already decoded and resized to thumbnails before rendering. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- Spatial graph objects and SVG paths expose keyboard actions and accessible roles without invalid nested buttons. */
import { memo, Profiler, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  Plus,
  Target,
  Sprout,
  Image as ImageIcon,
  ArrowUpRight,
  Network,
  ChevronsRightLeft,
} from 'lucide-react';
import {
  carriesPath,
  maxPanelWidth,
  minPanelHeight,
  minPanelWidth,
  objectHeight,
  imaginationLayout,
  seedLayout,
  seedBoxChrome,
  edgePath,
  imageCrop,
  imageCropStyle,
  reachable,
  moveObjects,
  moveSeed,
  patchObject,
  pointerSelectionPlan,
  predictiveLayout,
} from '@/lib/graph';
import type { CanvasObject, Kind, VisionMap, Point } from '@/lib/graph';
import type { Asset } from '@/lib/storage';
import type { ImageRequestOrigin } from '@/lib/image-request';
import { edgeOccluders } from '@/lib/edge-occlusion';
import {
  applyGraphDrop,
  graphDropIntent,
  graphDropOrder,
  graphHierarchy,
  graphSnapPlan,
  graphSubtree,
  hiddenObjects,
  siblingGap,
  visibleMap,
} from '@/lib/auto-layout';
import type {
  GraphDropIntent,
  GraphHierarchy,
  GraphSnapPlan,
  LayoutMode,
} from '@/lib/auto-layout';
import { useRelationGesture } from '@/hooks/use-relation-gesture';
import { relationPreviewPath } from '@/lib/relation-gesture';
import { RelationDot } from '@/components/relation-dot';
import {
  recordCanvasCommit,
  recordEdgeRender,
  recordObjectRender,
} from '@/lib/performance-probe';
const canvasOverlay = '[data-canvas-overlay]';
const occlusionCellSize = 420;
type OcclusionRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
function indexOccluders(rects: readonly OcclusionRect[]) {
  const cells = new Map<string, OcclusionRect[]>();
  const key = (x: number, y: number) => `${x}:${y}`;
  for (const rect of rects) {
    for (
      let x = Math.floor(rect.x / occlusionCellSize);
      x <= Math.floor((rect.x + rect.width) / occlusionCellSize);
      x++
    )
      for (
        let y = Math.floor(rect.y / occlusionCellSize);
        y <= Math.floor((rect.y + rect.height) / occlusionCellSize);
        y++
      )
        cells.set(key(x, y), [...(cells.get(key(x, y)) || []), rect]);
  }
  return (path: string) => {
    const values = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number);
    if (!values || values.length !== 8) return [];
    const left = Math.min(values[0], values[2], values[4], values[6]);
    const right = Math.max(values[0], values[2], values[4], values[6]);
    const top = Math.min(values[1], values[3], values[5], values[7]);
    const bottom = Math.max(values[1], values[3], values[5], values[7]);
    const found = new Set<OcclusionRect>();
    for (
      let x = Math.floor(left / occlusionCellSize);
      x <= Math.floor(right / occlusionCellSize);
      x++
    )
      for (
        let y = Math.floor(top / occlusionCellSize);
        y <= Math.floor(bottom / occlusionCellSize);
        y++
      )
        for (const rect of cells.get(key(x, y)) || []) found.add(rect);
    return [...found];
  };
}
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
  /** `graph` snaps every drop back onto the ranked auto-sorted columns. */
  layoutMode: LayoutMode;
  theme?: 'paper' | 'night' | 'mist';
  connecting: string;
  editing: string;
  onText: (id: string, text: string, cancel?: boolean) => void;
  onDraft: (id: string, text: string) => void;
  onSelect: (ids: Set<string>, explicit?: boolean) => void;
  onEdge: (id: string) => void;
  onCommit: (m: VisionMap) => void;
  onBranch: (id: string, type?: Kind, role?: CanvasObject['role']) => void;
  onConvert: (id: string, type: Kind, role: CanvasObject['role']) => void;
  /** Titles of the maps GRAPH objects link to, keyed by catalog entry id. */
  linkedTitles: Record<string, string>;
  /** A Graph object was clicked: ask whether to move to the map it opens. */
  onOpenGraph: (id: string) => void;
  /** Fold everything hanging off this object out of sight, or bring it back. */
  onFold: (id: string, collapsed: boolean) => void;
  onEdit: (id: string) => void;
  onCreate: (p: Point) => void;
  onOpen: (id: string) => void;
  onStartConnection: (id: string) => void;
  onSeed: (id: string) => void;
  onError: (s: string) => void;
  onFiles: (
    files: File[],
    target?: string,
    origin?: ImageRequestOrigin,
  ) => void;
  children?: React.ReactNode;
};
const noIds: ReadonlySet<string> = new Set<string>();
/** The kinds an object can be created as, or changed into. */
const objectKinds: {
  label: string;
  type: Kind;
  role: CanvasObject['role'];
}[] = [
  { label: 'Node', type: 'NODE', role: 'NORMAL' },
  { label: 'Goal', type: 'NODE', role: 'GOAL' },
  { label: 'Seed Box', type: 'SEED_BOX', role: 'NORMAL' },
  { label: 'Imagination', type: 'IMAGINATION', role: 'NORMAL' },
  { label: 'Graph', type: 'GRAPH', role: 'NORMAL' },
];
type Gesture = {
  kind: 'pan' | 'move' | 'marquee' | 'seed' | 'seed-convert' | 'resize';
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
  candidate?: string;
  candidateSince?: number;
  candidateSlot?: { id: string; side: 'left' | 'right'; x: number; y: number };
  /** Last unsettled move, replayed on release to resolve any overlap. */
  drag?: { delta: Point; targetId?: string; intent?: GraphDropIntent };
  /** Cached for the whole gesture; the resting graph cannot change mid-drag. */
  hierarchy?: GraphHierarchy;
};
/**
 * The map a graph-mode drag is showing: the branch moved under the parent the
 * drop named, with the dragged cards still translated to the pointer.
 */
function graphDrop(
  base: VisionMap,
  draggedId: string,
  movingIds: Set<string>,
  delta: Point,
  intent: GraphDropIntent | undefined,
  hierarchy: GraphHierarchy | undefined,
) {
  const dropped = applyGraphDrop(base, draggedId, intent, hierarchy);
  return {
    map: moveObjects(dropped.map, movingIds, delta),
    error: dropped.error,
  };
}
/** The line a sibling drop would be inserted on. */
type Insertion = { x: number; y: number; width: number };
function insertionBar(
  map: VisionMap,
  intent: GraphDropIntent & { kind: 'sibling' },
): Insertion | null {
  const reference = map.objects.find((o) => o.id === intent.referenceId);
  if (!reference) return null;
  const offset = siblingGap / 2;
  return {
    x: reference.x,
    width: reference.width,
    y: intent.before
      ? reference.y - offset
      : reference.y + objectHeight(reference) + offset,
  };
}
const noSnap: GraphSnapPlan = { frames: [], edges: [] };
/** How close, in world pixels, the pointer must be for a handle to light up. */
const nearConnectRadius = 40;
const nearAddRadius = 38;
/** Distance from the card's right edge to the centre of its add handle. */
const nearAddOffset = 32;

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

const Card = memo(
  function Card({
    object: o,
    assets,
    editing,
    zoom,
    onText,
    onDraft,
    onBranch,
    onSeed,
    onOpen,
    linkedTitle,
  }: {
    object: CanvasObject;
    assets: Props['assets'];
    editing: boolean;
    zoom: number;
    /** Title of the map a GRAPH object opens; empty when the link is broken. */
    linkedTitle?: string;
    onText: Props['onText'];
    onDraft: Props['onDraft'];
    onBranch: Props['onBranch'];
    onSeed: Props['onSeed'];
    onOpen: Props['onOpen'];
  }) {
    recordObjectRender();
    const images = o.images.map((id) => assets[id]);
    const layout = useMemo(() => seedLayout(o), [o]);
    const imageShape =
      images.filter((image) => image && image.height > image.width * 1.15)
        .length >
      images.length / 2
        ? 'portrait-led'
        : 'landscape-led';
    return (
      <>
        {o.role === 'GOAL' && o.type === 'NODE' && images.length > 0 && (
          <div className="hero-image">
            <img
              src={images[0]?.preview}
              alt={images[0]?.filename || 'Image unavailable'}
              draggable={false}
              style={imageCropStyle(imageCrop(o, o.images[0]))}
            />
          </div>
        )}
        {o.role === 'GOAL' && (
          <div className="object-label">
            <Target size={15} /> GOAL
          </div>
        )}
        {o.type === 'NODE' && (
          <div className="node-content">
            {o.type === 'NODE' &&
              o.role === 'NORMAL' &&
              images.length > 0 &&
              zoom > 0.55 && (
                <span className="node-thumbnail">
                  <img
                    src={images[0]?.preview}
                    alt={images[0]?.filename || 'Image unavailable'}
                    draggable={false}
                    style={imageCropStyle(imageCrop(o, o.images[0]))}
                  />
                </span>
              )}
            {editing ? (
              <InlineText key={o.id} object={o} save={onText} draft={onDraft} />
            ) : (
              <div className="object-text">{o.text || 'New idea'}</div>
            )}
          </div>
        )}
        {o.type === 'GRAPH' && (
          <div className="node-content">
            <div className="object-label">
              <Network size={15} /> GRAPH
            </div>
            {/* Only the linked map's central goal, read live from the catalog,
                so renaming it there renames this card. */}
            <div className="object-text">
              {linkedTitle || o.text || 'Untitled graph'}
            </div>
            <div className="graph-open-hint">
              <ArrowUpRight size={14} />
              {linkedTitle === undefined
                ? 'This graph is no longer here'
                : 'Open this graph'}
            </div>
          </div>
        )}
        {carriesPath(o) && o.note && o.displayNote && (
          <div className="object-note">{o.note}</div>
        )}
        {o.type === 'SEED_BOX' && (
          <>
            <div
              className="seed-bed"
              key={o.shuffle}
              style={{ height: layout.height }}
            >
              {layout.positions.map(
                ({ seed: s, x, y, width, height, multiline }, i) => (
                  <div
                    key={s.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${s.text}. Open Seed Box to edit, delete or turn into a node.`}
                    data-seed={s.id}
                    className={`seed ${multiline ? 'multiline' : ''}`}
                    style={{
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
                    <span className="seed-text">{s.text}</span>
                    <span
                      data-seed-convert="true"
                      className="seed-convert"
                      title="Drag this handle out to turn the seed into a node"
                      aria-label={`Drag ${s.text} out to turn it into a node`}
                    >
                      <ArrowUpRight size={11} />
                    </span>
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
              className={`image-grid count-${Math.min(images.length, 6)} ${imageShape} imagination-layout-${imaginationLayout(o.imaginationLayout)}`}
            >
              {images.slice(0, 6).map((a, i) => (
                <div className="image-slot" key={o.images[i]}>
                  <img
                    loading="lazy"
                    decoding="async"
                    src={a?.preview}
                    alt={a?.filename || 'Image unavailable'}
                    draggable={false}
                    style={imageCropStyle(imageCrop(o, o.images[i]))}
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
        {carriesPath(o) && (
          <button
            className="branch-plus"
            data-branch-plus="true"
            title={`${o.role === 'GOAL' ? 'Add contributor' : 'Add next node'} · Right-click to choose a kind`}
            aria-label={o.role === 'GOAL' ? 'Add contributor' : 'Add branch'}
            onClick={() => onBranch(o.id)}
          >
            <Plus size={18} strokeWidth={2.75} />
          </button>
        )}
      </>
    );
  },
  (previous, next) =>
    previous.object.type === next.object.type &&
    previous.object.role === next.object.role &&
    previous.object.text === next.object.text &&
    previous.object.width === next.object.width &&
    previous.object.height === next.object.height &&
    previous.object.focal === next.object.focal &&
    previous.object.focalX === next.object.focalX &&
    previous.object.crops === next.object.crops &&
    previous.object.note === next.object.note &&
    previous.object.displayNote === next.object.displayNote &&
    previous.object.imaginationPreset === next.object.imaginationPreset &&
    previous.object.shuffle === next.object.shuffle &&
    previous.object.tier === next.object.tier &&
    previous.object.images.length === next.object.images.length &&
    previous.object.images.every(
      (id, index) => id === next.object.images[index],
    ) &&
    previous.object.seeds.length === next.object.seeds.length &&
    previous.object.seeds.every(
      (seed, index) =>
        seed.id === next.object.seeds[index]?.id &&
        seed.text === next.object.seeds[index]?.text &&
        seed.visualSeed === next.object.seeds[index]?.visualSeed,
    ) &&
    previous.object.mapRef === next.object.mapRef &&
    previous.linkedTitle === next.linkedTitle &&
    previous.assets === next.assets &&
    previous.editing === next.editing &&
    previous.zoom === next.zoom,
);
export function NodestarCanvas(p: Props) {
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
    [floating, setFloating] = useState<ReadonlySet<string>>(noIds),
    [target, setTarget] = useState(''),
    [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null),
    [context, setContext] = useState<{
      id: string;
      x: number;
      y: number;
      /** `create` is the menu behind the add handle, `object` behind a card. */
      kind: 'object' | 'create';
    } | null>(null),
    [candidateSlot, setCandidateSlot] = useState<{
      id: string;
      side: 'left' | 'right';
      x: number;
      y: number;
    } | null>(null),
    [snap, setSnap] = useState<GraphSnapPlan>(noSnap),
    [insertion, setInsertion] = useState<Insertion | null>(null);
  const viewRef = useRef(p.viewport);
  viewRef.current = p.viewport;
  const whole = preview || p.map;
  /**
   * The fold controls read the branch structure of the whole map, including
   * what is folded away; everything drawn reads the visible part of it.
   */
  const hierarchy = useMemo(() => graphHierarchy(whole), [whole]);
  const folded = useMemo(
    () => hiddenObjects(whole, hierarchy),
    [whole, hierarchy],
  );
  const display = useMemo(
    () => visibleMap(whole, folded),
    [whole, folded],
  );
  const folds = useMemo(
    () =>
      display.objects
        .filter((o) => (hierarchy.childrenOf.get(o.id)?.length || 0) > 0)
        // A component root has nothing above it, so folding it would leave the
        // canvas holding a single card and no way back to the rest.
        .filter((o) => hierarchy.parentOf.get(o.id))
        .map((o) => ({
          id: o.id,
          collapsed: !!o.collapsed,
          side: hierarchy.sideOf.get(o.id) || 'right',
          hidden: graphSubtree(hierarchy, o.id).size - 1,
        })),
    [display.objects, hierarchy],
  );
  const predictedEdges = useMemo(
    () => new Set(snap.edges.map((edge) => edge.id)),
    [snap],
  );
  const rightPress = useRef<{ id: string; create: boolean } | null>(null);
  const [panning, setPanning] = useState(false);
  const relation = useRelationGesture({
    root,
    map: p.map,
    selected: p.selected,
    viewport: p.viewport,
    onCommit: p.onCommit,
    // A press on the connect handle that did not drag selects its node, the
    // same as pressing anywhere else on the card.
    onTap: (id, e) => {
      const plan = pointerSelectionPlan(
        p.map,
        p.selected,
        p.explicit,
        id,
        e.ctrlKey || e.metaKey,
        e.shiftKey,
      );
      p.onSelect(plan.visibleSelection, plan.explicit);
      // Clicking a Graph object opens the map it stands for, handle or not.
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        p.map.objects.find((o) => o.id === id)?.type === 'GRAPH'
      )
        p.onOpenGraph(id);
    },
    enabled:
      !p.editing &&
      !preview &&
      !panning &&
      p.mode === 'select' &&
      !p.connecting,
  });
  const relationDrag =
    relation.state.phase === 'dragging' ? relation.state : null;
  const relationSource =
    relationDrag && p.map.objects.find((o) => o.id === relationDrag.sourceId);
  const occlusionRects = useMemo(
    () =>
      display.objects
        .filter(carriesPath)
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
    const candidatesFor = indexOccluders(occlusionRects);
    return new Map(
      display.relationships.map((edge) => {
        const a = index.get(edge.sourceId),
          b = index.get(edge.targetId);
        return [
          edge.id,
          a && b
            ? edgeOccluders(
                edgePath(a, b),
                candidatesFor(edgePath(a, b)),
                a.id,
                b.id,
              )
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
  function setLive(
    m: VisionMap | null,
    error = '',
    overlapping: ReadonlySet<string> = noIds,
  ) {
    previewRef.current = m;
    invalidRef.current = error;
    setPreview(m);
    setInvalid(error);
    setFloating((current) =>
      current.size === 0 && overlapping.size === 0 ? current : overlapping,
    );
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
        setCandidateSlot(null);
        setContext(null);
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
      setCandidateSlot(null);
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
  /**
   * Brightens whichever node handle the pointer is close to. Written straight
   * onto the card's element: it changes on every pointer move, and a render
   * of the whole canvas for each one would be wasted.
   */
  function markNearHandle(o: CanvasObject, e: ReactPointerEvent<HTMLDivElement>) {
    const card = e.currentTarget;
    if (!carriesPath(o) || e.buttons) {
      delete card.dataset.near;
      return;
    }
    const rect = card.getBoundingClientRect();
    const zoom = p.viewport.zoom;
    const x = e.clientX,
      y = e.clientY;
    const centre = Math.hypot(
      x - (rect.left + rect.width / 2),
      y - (rect.top + rect.height / 2),
    );
    // The add handle sits just past the right edge, level with the centre.
    const add = Math.hypot(
      x - (rect.right + nearAddOffset * zoom),
      y - (rect.top + rect.height / 2),
    );
    const near =
      add <= Math.max(22, nearAddRadius * zoom)
        ? 'add'
        : centre <= Math.max(18, nearConnectRadius * zoom)
          ? 'connect'
          : '';
    if (near) card.dataset.near = near;
    else delete card.dataset.near;
  }
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (!el.closest('.object-context-menu')) setContext(null);
    if (relation.active()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // The add and connect handles are buttons, so the guard below would
    // swallow their right-press before the menu behind them could open. The
    // connect handle sits on the card, so it opens the card's own menu.
    if (
      e.button === 2 &&
      el.closest('[data-branch-plus],[data-relation-dot]')
    ) {
      e.preventDefault();
      rightPress.current = {
        id: el.closest<HTMLElement>('[data-object]')?.dataset.object || '',
        create: !!el.closest('[data-branch-plus]'),
      };
      return;
    }
    if (el.closest(`button,input,textarea,[data-ui],${canvasOverlay}`)) return;
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
    rightPress.current =
      e.button === 2
        ? { id: objId, create: !!el.closest('[data-branch-plus]') }
        : null;
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
        e.shiftKey,
      );
      p.onSelect(plan.visibleSelection, plan.explicit);
      if (!plan.startDrag) return;
      ids = plan.movementIds;
      gestureExplicit = plan.explicit;
    }
    const kind = pan
        ? 'pan'
        : el.closest('[data-resize]')
          ? 'resize'
          : el.closest('[data-seed-convert]')
            ? 'seed-convert'
            : el.closest('[data-seed]')
              ? 'seed'
              : objId
                ? 'move'
                : 'marquee';
    // The resize arc intentionally sits just outside the card. Capture on
    // press so a fast drag from that external affordance cannot lose its
    // first movement to the canvas underneath it.
    if (kind === 'resize') root.current!.setPointerCapture(e.pointerId);
    gesture.current = {
      kind,
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
      const horizontalWidth = Math.max(
        o.type === 'NODE' ? 160 : minPanelWidth,
        Math.min(o.type === 'NODE' ? 520 : maxPanelWidth, o.width + delta.x),
      );
      // An Imagination canvas is a grid of square images.  Its external arc
      // can still be dragged vertically, but that drag changes the common
      // tile size so the frame remains fitted to the grid instead of gaining
      // empty space above or below the images.
      const fittedImageGrid =
        o.type === 'IMAGINATION' && o.images.length > 0;
      const currentHeight = objectHeight(o);
      const verticalWidth =
        currentHeight > 0
          ? o.width * Math.max(0.2, (currentHeight + delta.y) / currentHeight)
          : horizontalWidth;
      const useVerticalResize =
        fittedImageGrid &&
        Math.abs(delta.y / currentHeight) > Math.abs(delta.x / o.width);
      const width = Math.max(
        o.type === 'NODE' ? 160 : minPanelWidth,
        Math.min(
          o.type === 'NODE' ? 520 : maxPanelWidth,
          useVerticalResize ? verticalWidth : horizontalWidth,
        ),
      );
      setLive(
        patchObject(g.base, g.id, {
          width,
          ...(o.type === 'NODE'
            ? {
                height: Math.max(
                  objectHeight({ ...o, manualHeight: false }),
                  (o.manualHeight ? o.height : objectHeight(o)) + delta.y,
                ),
                manualHeight: true,
              }
            : fittedImageGrid
              ? {
                  // objectHeight derives this same value from width. Storing
                  // it keeps keyboard/detail resizing and persisted maps in
                  // sync with the visible frame.
                  height: objectHeight({ ...o, width }),
                }
            : {
                height: Math.max(
                  o.type === 'SEED_BOX'
                    ? seedBoxChrome + seedLayout(o).height
                    : minPanelHeight,
                  o.height + delta.y,
                ),
              }),
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
      // Rearranging a loose idea stays inside its box. It deliberately does
      // not create a node; conversion is only available from the arrow handle.
      setTarget('');
      setLive(g.base);
      return;
    }
    if (g.kind === 'seed-convert') {
      setTarget(hit?.id || '');
      try {
        setLive(moveSeed(g.base, g.id, g.seed!, pt, hit?.id).map);
      } catch (err) {
        setLive(g.base, (err as Error).message);
      }
      return;
    }
    const draggedObject = g.base.objects.find((object) => object.id === g.id);
    // Graph mode reads the drop from where the pointer is: on a card means
    // "become its child", in the band above or below one means "become its
    // sibling, on that side".
    if (p.layoutMode === 'graph') {
      g.hierarchy ||= graphHierarchy(g.base);
      const intent =
        g.explicit || draggedObject?.type !== 'NODE'
          ? undefined
          : graphDropIntent(g.base, g.id, pt, g.hierarchy);
      setCandidateSlot(null);
      setTarget(intent?.kind === 'child' ? intent.parentId : '');
      setInsertion(
        intent?.kind === 'sibling' ? insertionBar(g.base, intent) : null,
      );
      g.drag = { delta, intent };
      const dropped = graphDrop(g.base, g.id, g.ids, delta, intent, g.hierarchy);
      // The card keeps following the pointer; the rank it was dropped at is
      // only applied to the map the landing frame is computed from.
      setSnap(
        dropped.error
          ? noSnap
          : graphSnapPlan(graphDropOrder(dropped.map, g.id, intent), g.ids),
      );
      setLive(dropped.map, dropped.error, noIds);
      return;
    }
    // Semantic reparenting lives in a slot outside the target. Traversing a
    // target body is deliberately ignored, so an overlap is always transit.
    const slots = g.base.objects
      .filter((object) => object.id !== g.id && object.type === 'NODE')
      .flatMap((object) => [
        {
          id: object.id,
          side: 'left' as const,
          x: object.x - 34,
          y: object.y + objectHeight(object) / 2,
        },
        {
          id: object.id,
          side: 'right' as const,
          x: object.x + object.width + 34,
          y: object.y + objectHeight(object) / 2,
        },
      ]);
    const near = slots
      .map((slot) => ({
        slot,
        distance: Math.hypot(pt.x - slot.x, pt.y - slot.y),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    const retained =
      g.candidateSlot &&
      Math.hypot(pt.x - g.candidateSlot.x, pt.y - g.candidateSlot.y) < 64
        ? g.candidateSlot
        : undefined;
    const nextSlot =
      retained || (near && near.distance < 38 ? near.slot : undefined);
    if (nextSlot && g.candidate !== nextSlot.id) {
      g.candidate = nextSlot.id;
      g.candidateSlot = nextSlot;
      g.candidateSince = performance.now();
    }
    if (!nextSlot) {
      g.candidate = undefined;
      g.candidateSlot = undefined;
      g.candidateSince = undefined;
    }
    setCandidateSlot(nextSlot || null);
    const semanticTarget =
      nextSlot &&
      g.candidate === nextSlot.id &&
      performance.now() - (g.candidateSince || performance.now()) >= 120 &&
      !g.explicit &&
      draggedObject?.type === 'NODE' &&
      g.base.objects.find((object) => object.id === nextSlot.id)?.type ===
        'NODE'
        ? g.base.objects.find((object) => object.id === nextSlot.id)
        : undefined;
    setTarget(semanticTarget?.id || '');
    g.drag = { delta, targetId: semanticTarget?.id };
    // The card follows the pointer literally, overlaps included, so a drag can
    // cross other cards instead of being shoved aside mid-gesture. An overlap
    // only means the position cannot be kept: it is dimmed here and resolved
    // by the settled layout computed on release.
    const result = predictiveLayout({
      baseMap: g.base,
      movingIds: g.ids,
      dragDelta: delta,
      draggedRootId: g.id,
      optionalTargetId: semanticTarget?.id,
      explicitSelection: g.explicit,
      settle: false,
    });
    setLive(
      result.previewMap,
      result.valid ? undefined : result.message,
      result.overlappingIds,
    );
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
      setContext({
        id: rightPress.current.id,
        x: e.clientX,
        y: e.clientY,
        kind: rightPress.current.create ? 'create' : 'object',
      });
    }
    rightPress.current = null;
    if (e.button === 0 && g && !g.moved && g.kind === 'move') {
      const clicked = p.map.objects.find((o) => o.id === g.id);
      if (clicked?.type === 'GRAPH') p.onOpenGraph(clicked.id);
    }
    if (g?.moved && previewRef.current && g.base === p.map) {
      if (invalidRef.current) p.onError(invalidRef.current);
      else {
        const replay =
          g.kind === 'move' && g.drag
            ? p.layoutMode === 'graph'
              ? graphDropOrder(
                  graphDrop(
                    g.base,
                    g.id,
                    g.ids,
                    g.drag.delta,
                    g.drag.intent,
                    g.hierarchy,
                  ).map,
                  g.id,
                  g.drag.intent,
                )
              : predictiveLayout({
                  baseMap: g.base,
                  movingIds: g.ids,
                  dragDelta: g.drag.delta,
                  draggedRootId: g.id,
                  optionalTargetId: g.drag.targetId,
                  explicitSelection: g.explicit,
                }).previewMap
            : null;
        // Moving a Seed Box carries its chips along unchanged. Rearranging
        // them is the Shuffle action's job, never a side effect of a drag.
        p.onCommit(replay || previewRef.current);
      }
    }
    setLive(null);
    setTarget('');
    setMarquee(null);
    setSnap(noSnap);
    setInsertion(null);
  }
  return (
    <Profiler id="nodestar-canvas" onRender={recordCanvasCommit}>
      <div
        ref={root}
        className={`canvas canvas-theme-${p.theme || 'paper'} ${p.mode === 'pan' ? 'pan-mode' : ''} ${panning ? 'is-panning' : ''} ${p.connecting ? 'connect-mode' : ''} ${p.viewport.zoom < 0.45 ? 'far-zoom' : p.viewport.zoom < 0.7 ? 'medium-zoom' : ''}`}
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
          setSnap(noSnap);
          setInsertion(null);
          pointers.current.clear();
          pinch.current = null;
        }}
        onDoubleClick={(e) => {
          const el = e.target as HTMLElement;
          if (el.closest(`button,input,textarea,[data-ui],${canvasOverlay}`))
            return;
          const id = el.closest<HTMLElement>('[data-object]')?.dataset.object;
          if (id) {
            // A Graph object is labelled by the map it opens, so there is
            // nothing here to type into.
            if (p.map.objects.find((o) => o.id === id)?.type !== 'GRAPH')
              p.onEdit(id);
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
        {display.objects.length === 0 && (
          <div className="canvas-heading">
            <span className="eyebrow">YOUR VISION, UNFOLDING</span>
            <p>A little space for what comes next.</p>
          </div>
        )}
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
              recordEdgeRender();
              const a = objectIndex.get(e.sourceId),
                b = objectIndex.get(e.targetId);
              if (!a || !b) return null;
              const d = edgePath(a, b),
                // While a drop is being predicted this connection is drawn at
                // the slot it will settle into, so the copy trailing the
                // pointer would only be a duplicate.
                predicted = predictedEdges.has(e.id),
                dim =
                  highlighted &&
                  !(highlighted.has(a.id) && highlighted.has(b.id));
              const covers = edgeCovers.get(e.id) || [];
              const maskId = `edge-cover-${e.id}`;
              return (
                <g
                  key={e.id}
                  style={{ opacity: predicted ? 0.12 : dim ? 0.15 : 1 }}
                >
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
                    aria-label={`${a.text} ${e.type === 'PATH' ? 'leads to' : e.type === 'RELATED' ? 'related to' : 'references'} ${b.text}`}
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
            {snap.edges.map((edge) => (
              <path key={`snap-${edge.id}`} d={edge.path} className="snap-edge" />
            ))}
          </svg>
          {display.objects.map((o) => (
            <div
              key={o.id}
              data-object={o.id}
              data-relation-candidate={
                relationDrag?.candidateId === o.id && carriesPath(o)
                  ? 'center'
                  : undefined
              }
              data-relation-target={
                relationDrag?.targetId === o.id
                  ? relationDrag.validity
                  : undefined
              }
              data-relation-success={
                relation.success?.sourceId === o.id ||
                relation.success?.targetId === o.id
                  ? 'true'
                  : undefined
              }
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
              onPointerEnter={(e) => relation.enter(o, e)}
              onPointerMove={(e) => markNearHandle(o, e)}
              onPointerLeave={(e) => {
                delete e.currentTarget.dataset.near;
                relation.leave(o.id);
              }}
              className={`canvas-object ${o.type.toLowerCase()} ${o.role.toLowerCase()} ${p.selected.has(o.id) ? 'selected' : ''} ${target === o.id ? (invalid ? 'invalid-target' : 'drop-target') : ''} ${preview && gesture.current?.ids.has(o.id) ? 'dragging' : ''} ${floating.has(o.id) ? 'floating' : ''}`}
              style={
                {
                  left: o.x,
                  top: o.y,
                  width: o.width,
                  minHeight: objectHeight(o),
                  height:
                    !carriesPath(o) || o.manualHeight
                      ? objectHeight(o)
                      : undefined,
                  opacity: highlighted && !highlighted.has(o.id) ? 0.18 : 1,
                } as CSSProperties
              }
            >
              {carriesPath(o) ? (
                <Card
                  object={o}
                  assets={p.assets}
                  editing={p.editing === o.id}
                  zoom={p.viewport.zoom}
                  onText={p.onText}
                  onDraft={p.onDraft}
                  onBranch={p.onBranch}
                  onSeed={p.onSeed}
                  onOpen={p.onOpen}
                  linkedTitle={o.mapRef ? p.linkedTitles[o.mapRef] : undefined}
                />
              ) : (
                <div className="object-surface">
                  <Card
                    object={o}
                    assets={p.assets}
                    editing={p.editing === o.id}
                    zoom={p.viewport.zoom}
                    onText={p.onText}
                    onDraft={p.onDraft}
                    onBranch={p.onBranch}
                    onSeed={p.onSeed}
                    onOpen={p.onOpen}
                  />
                </div>
              )}
              {!carriesPath(o) && (
                <div
                  className={`object-kind-badge ${o.type.toLowerCase()} ${p.editing === o.id ? 'editing' : ''}`}
                  data-object-kind={o.type}
                >
                  {o.type === 'SEED_BOX' ? (
                    <Sprout size={15} />
                  ) : (
                    <ImageIcon size={15} />
                  )}
                  <span className="object-kind-name">
                    {o.type === 'SEED_BOX' ? 'Seed Box' : 'Imagination'}
                  </span>
                </div>
              )}
              {!carriesPath(o) && (p.editing === o.id || o.text) && (
                <div
                  className={`object-title-below ${o.type.toLowerCase()} ${o.displayTitle === false ? 'hover-only' : ''} ${p.editing === o.id ? 'editing' : ''}`}
                  data-object-title={o.id}
                >
                  {p.editing === o.id ? (
                    <InlineText
                      key={o.id}
                      object={o}
                      save={p.onText}
                      draft={p.onDraft}
                    />
                  ) : (
                    o.text
                  )}
                </div>
              )}
              {p.selected.has(o.id) && (
                <span
                  role="separator"
                  aria-label="Resize object using drag, or open details for keyboard resizing"
                  data-resize="true"
                  className="resize-grip"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 6C17 12 12 17 6 18" />
                  </svg>
                </span>
              )}
              {relation.dot?.sourceId === o.id && (
                <RelationDot
                  sourceId={o.id}
                  side={relation.dot.lockedSide}
                  onStart={relation.start}
                  onLostCapture={relation.lostCapture}
                  onEdit={(id) => {
                    if (o.type !== 'GRAPH') p.onEdit(id);
                  }}
                />
              )}
              {folds
                .filter((fold) => fold.id === o.id)
                .map((fold) => (
                  <button
                    key={`fold-${fold.id}`}
                    data-fold={fold.id}
                    className={`fold-toggle ${fold.side} ${fold.collapsed ? 'folded' : ''}`}
                    aria-expanded={!fold.collapsed}
                    aria-label={
                      fold.collapsed
                        ? `Unfold ${fold.hidden} hidden`
                        : 'Fold this branch'
                    }
                    title={
                      fold.collapsed
                        ? `Unfold ${fold.hidden} hidden`
                        : 'Fold this branch'
                    }
                    onClick={() => p.onFold(fold.id, !fold.collapsed)}
                  >
                    {fold.collapsed ? (
                      <span className="fold-count">{fold.hidden}</span>
                    ) : (
                      <ChevronsRightLeft size={14} />
                    )}
                  </button>
                ))}
              {relationDrag?.candidateId === o.id && carriesPath(o) && (
                <span
                  className={`relation-target-dot ${relationDrag.targetId === o.id ? relationDrag.validity : ''}`}
                  data-relation-target-dot={o.id}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
          {relationDrag && relationSource && (
            <svg className="edges relation-preview-layer" aria-hidden="true">
              <path
                data-relation-preview
                className={`edge relation-preview ${relationDrag.validity}`}
                d={relationPreviewPath(
                  relationSource,
                  relationDrag.lockedSide,
                  relationDrag.pointer,
                  p.map.objects.find(
                    (o) => o.id === relationDrag.targetId,
                  ),
                )}
                markerEnd="url(#arrow)"
              />
            </svg>
          )}
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
          {insertion && (
            <div
              className="insertion-bar"
              style={{
                left: insertion.x,
                top: insertion.y,
                width: insertion.width,
              }}
            />
          )}
          {snap.frames.map((frame) => (
            <div
              key={frame.id}
              className="snap-frame"
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
              }}
            />
          ))}
          {candidateSlot && (
            <span
              className="semantic-slot"
              style={{ left: candidateSlot.x - 9, top: candidateSlot.y - 9 }}
              aria-label="Potential semantic drop location"
            />
          )}
        </div>
        {relationDrag && (
          <div
            className={`drag-message ${relationDrag.validity === 'invalid' ? 'error' : ''}`}
            role="status"
          >
            {relationDrag.error ||
              (relationDrag.validity === 'valid'
                ? relationDrag.relationType === 'PATH'
                  ? 'Release to create path'
                  : 'Release to create relation'
                : relationDrag.candidateId && !relationDrag.targetId
                  ? 'Move to the center point to create path · Esc to cancel'
                  : 'Drag to a Seed Box, Imagination, or Node center · Esc to cancel')}
          </div>
        )}
        {(target || insertion) && (
          <div className={`drag-message ${invalid ? 'error' : ''}`}>
            {invalid || (
              <>
                <ArrowUpRight size={15} />{' '}
                {insertion
                  ? 'Release to place it at the same level'
                  : p.layoutMode === 'graph'
                    ? 'Release to make it a child'
                    : 'Release to connect here'}
              </>
            )}
          </div>
        )}
        {context && (
          <div
            data-canvas-overlay
            className="object-context-menu"
            style={{ left: context.x, top: context.y }}
          >
            {context.kind === 'create' ? (
              <>
                <span className="context-heading">Add</span>
                {objectKinds.map((kind) => (
                  <button
                    key={kind.label}
                    onClick={() => {
                      p.onBranch(context.id, kind.type, kind.role);
                      setContext(null);
                    }}
                  >
                    {kind.label}
                  </button>
                ))}
              </>
            ) : (
              <>
                {display.objects.find((o) => o.id === context.id)?.type ===
                'GRAPH' ? (
                  <button
                    onClick={() => {
                      p.onOpenGraph(context.id);
                      setContext(null);
                    }}
                  >
                    Open graph
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      p.onEdit(context.id);
                      setContext(null);
                    }}
                  >
                    Edit title
                  </button>
                )}
                <button
                  onClick={() => {
                    p.onOpen(context.id);
                    setContext(null);
                  }}
                >
                  Details
                </button>
                <button
                  onClick={() => {
                    p.onStartConnection(context.id);
                    setContext(null);
                  }}
                >
                  Connect
                </button>
                <span className="context-heading">Change kind</span>
                {objectKinds.map((kind) => {
                  const object = display.objects.find(
                    (o) => o.id === context.id,
                  );
                  const current =
                    object?.type === kind.type &&
                    (kind.type !== 'NODE' || object.role === kind.role);
                  return (
                    <button
                      key={kind.label}
                      className={current ? 'current-kind' : ''}
                      aria-current={current || undefined}
                      disabled={current}
                      onClick={() => {
                        p.onConvert(context.id, kind.type, kind.role);
                        setContext(null);
                      }}
                    >
                      {kind.label}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}
        {p.children}
      </div>
    </Profiler>
  );
}
