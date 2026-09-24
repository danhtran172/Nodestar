export type Kind = 'NODE' | 'SEED_BOX' | 'IMAGINATION' | 'GRAPH';
export type ImaginationPreset = 'small' | 'medium' | 'large';
export type ImaginationLayout =
  | 'collage'
  | 'uniform'
  // Values written by the first layout-switch version remain valid.
  | 'gapless'
  | 'spaced';
export type RelationType = 'PATH' | 'RELATED' | 'REFERENCE';
export type Seed = { id: string; text: string; visualSeed: number };
/**
 * How an image sits inside the frame that clips it. `x`/`y` are the point of
 * the image (in percent) kept at the same percent of the frame; `scale` zooms
 * around that point, 1 being the plain cover fit. Above 1 the image spills
 * past the frame and `x`/`y` choose which part shows; below 1 it sits inside
 * the frame and they choose where.
 */
export type ImageCrop = { x: number; y: number; scale: number };
export const minImageScale = 0.25;
export const maxImageScale = 5;
export const defaultImageCrop: ImageCrop = { x: 50, y: 50, scale: 1 };
export function imageCrop(o: CanvasObject, imageId: string): ImageCrop {
  return (
    o.crops?.[imageId] || { x: o.focalX ?? 50, y: o.focal ?? 50, scale: 1 }
  );
}
/** Keeps a crop inside the range the frame can show. */
export function clampImageCrop(crop: ImageCrop): ImageCrop {
  const bound = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
  return {
    x: bound(crop.x, 0, 100),
    y: bound(crop.y, 0, 100),
    scale: bound(crop.scale, minImageScale, maxImageScale),
  };
}
/**
 * The patch that stores a crop for one of an object's images. Node images
 * also keep the older focal fields in step, so anything still reading them
 * sees the same point.
 */
export function imageCropPatch(
  o: CanvasObject,
  imageId: string,
  crop: ImageCrop,
): Partial<CanvasObject> {
  const next = clampImageCrop(crop);
  return {
    crops: { ...o.crops, [imageId]: next },
    ...(o.type === 'NODE' ? { focal: next.y, focalX: next.x } : {}),
  };
}
/** Inline style that frames an image by its crop; the frame must clip overflow. */
export function imageCropStyle(crop: ImageCrop) {
  const origin = `${crop.x}% ${crop.y}%`;
  return {
    objectPosition: origin,
    transformOrigin: origin,
    transform: crop.scale === 1 ? undefined : `scale(${crop.scale})`,
  };
}
/**
 * Moves the image by `dx`,`dy` frame pixels, expressed as the crop point that
 * puts it there. The frame is `width` x `height`, the image `aspect` wide for
 * every unit tall. An axis where the image exactly fills the frame has no
 * room to move and stays where it is.
 */
export function panImageCrop(
  crop: ImageCrop,
  dx: number,
  dy: number,
  width: number,
  height: number,
  aspect: number,
): ImageCrop {
  // Negative overflow means the image is smaller than the frame; the same
  // arithmetic then slides it about inside the frame instead.
  const { x, y } = cropOverflow(crop.scale, width, height, aspect);
  return clampImageCrop({
    ...crop,
    x: Math.abs(x) > 0.5 ? crop.x - (dx * 100) / x : crop.x,
    y: Math.abs(y) > 0.5 ? crop.y - (dy * 100) / y : crop.y,
  });
}
/**
 * Zooms the crop so the image point under (`atX`,`atY`) in the frame stays
 * under it, like zooming a map under the pointer.
 */
export function zoomImageCrop(
  crop: ImageCrop,
  scale: number,
  atX: number,
  atY: number,
  width: number,
  height: number,
  aspect: number,
): ImageCrop {
  const next = clampImageCrop({ ...crop, scale });
  const ratio = next.scale / crop.scale;
  // Scaling around the crop point pushes the point under the pointer outward;
  // panning it back by that much keeps it still.
  const dx = -(ratio - 1) * (atX - (width * crop.x) / 100);
  const dy = -(ratio - 1) * (atY - (height * crop.y) / 100);
  return panImageCrop(next, dx, dy, width, height, aspect);
}
/**
 * How many frame pixels of the image lie beyond each edge pair at `scale`;
 * negative when the image falls short of the frame on that axis.
 */
function cropOverflow(
  scale: number,
  width: number,
  height: number,
  aspect: number,
) {
  const fitWidth = Math.max(width, height * aspect);
  const fitHeight = Math.max(height, width / aspect);
  return { x: scale * fitWidth - width, y: scale * fitHeight - height };
}
export type CanvasObject = {
  id: string;
  type: Kind;
  role: 'NORMAL' | 'GOAL';
  text: string;
  note: string;
  x: number;
  y: number;
  width: number;
  height: number;
  images: string[];
  seeds: Seed[];
  tier: number;
  shuffle: number;
  focal: number;
  /** Horizontal image crop position; omitted maps created before crop dragging. */
  focalX?: number;
  /**
   * How each image sits in its frame, keyed by asset id. An image without an
   * entry falls back to `focal`/`focalX` at 1x, which is how Node images were
   * cropped before zooming existed.
   */
  crops?: Record<string, ImageCrop>;
  displayNote?: boolean;
  /** Keeps a Seed Box or Imagination title visible below its card. */
  displayTitle?: boolean;
  /** Records a height explicitly chosen by resizing a Node on the canvas. */
  manualHeight?: boolean;
  imaginationPreset?: ImaginationPreset;
  /** `uniform` gives every image an equal tile; `collage` emphasizes the first. */
  imaginationLayout?: ImaginationLayout;
  attachment?: string;
  /**
   * For a GRAPH object, the catalog entry it stands for. The linked map owns
   * its own objects; this one only shows that map's central goal.
   */
  mapRef?: string;
  /** Folds everything hanging off this object out of sight. */
  collapsed?: boolean;
  createdAt: number;
  updatedAt: number;
};
export type Relationship = {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
};
/**
 * Which way a new PATH arrow points: away from the central goal toward the
 * branches (`outward`), or from the branches in toward the goal (`inward`).
 */
export type PathDirection = 'outward' | 'inward';
export type VisionMap = {
  version: 1;
  title: string;
  anchorId: string;
  objects: CanvasObject[];
  relationships: Relationship[];
  /**
   * The direction every PATH created from now on takes. Changing it leaves the
   * paths already drawn as they are; each of those can still be reversed.
   * Omitted means `outward`.
   */
  pathDirection?: PathDirection;
};
export function pathDirection(map: VisionMap): PathDirection {
  return map.pathDirection === 'inward' ? 'inward' : 'outward';
}
/** The end of a PATH that hangs below the other, by the map's arrow direction. */
function childEnd(map: VisionMap, edge: { sourceId: string; targetId: string }) {
  return pathDirection(map) === 'inward' ? edge.sourceId : edge.targetId;
}
/** The PATH that ranks `id` under its parent, if there is one. */
function attachmentFor(
  map: VisionMap,
  relationships: Relationship[],
  id: string,
) {
  return relationships.find((e) => e.type === 'PATH' && childEnd(map, e) === id)
    ?.id;
}
/**
 * `id` and everything that hangs below it along PATHs, following arrows in
 * whichever direction the map draws them.
 */
export function downstream(map: VisionMap, id: string): Set<string> {
  return reachable(map, id, pathDirection(map) === 'inward');
}
/** Placeholder titles a map carries until someone names it. */
const unnamedTitles = new Set(['', 'Untitled vision']);
/**
 * Names an unnamed map after its central goal the first time that goal is
 * given text. A map someone has already named keeps its name, and once the
 * title has been taken from the goal it is a real name and stays put.
 */
export function syncTitleFromGoal(
  before: VisionMap,
  next: VisionMap,
): VisionMap {
  if (!unnamedTitles.has(next.title.trim())) return next;
  const goal = next.objects.find((o) => o.id === next.anchorId);
  if (!goal || goal.type !== 'NODE') return next;
  const text = goal.text.trim();
  if (!text) return next;
  const previous = before.objects.find((o) => o.id === goal.id);
  if (previous?.text.trim()) return next;
  return { ...next, title: text };
}
export type Point = { x: number; y: number };
/**
 * A Seed Box and an Imagination are panels rather than cards: they start at
 * this size and can be dragged between these bounds. The floor sits below the
 * starting size so a resized panel can be brought back down to it.
 */
export const panelWidth = 217;
export const imaginationWidth = 224;
export const panelHeight = 168;
/**
 * A Seed Box starts as a landscape rectangle, wide enough for two or three
 * chips per row so loose ideas read across rather than as one tall column.
 */
export const seedBoxWidth = 320;
export const seedBoxHeight = 140;
export const minPanelWidth = 196;
export const maxPanelWidth = 900;
export const minPanelHeight = 126;
/**
 * Seed chip metrics. The bed is inset from the card edge on three sides and
 * `seedBoxChrome` is the vertical space it never occupies: the `+` row above
 * it plus the bottom inset.
 */
export const seedBedInset = 14;
export const seedChipGap = 6;
export const seedChipRowGap = 6;
/** The `+` row sits under the bed, so the chips start at the inset. */
export const seedBedBottom = 34;
export const seedBoxChrome = seedBedInset + seedBedBottom;
const chipPaddingX = 10;
const chipPaddingY = 6;
const chipBorder = 1;
const chipLineHeight = 18;
/**
 * A chip is measured from its character count rather than from the rendered
 * text, so the layout stays pure. The estimate runs a little wide, and the
 * cushion covers the strings that sit above the average, so a chip sized for
 * one line never wraps to two.
 */
const chipCharacterWidth = 7;
const chipTextCushion = 4;
/** The convert handle rides inside the chip, after its text. */
const chipHandleWidth = 22;
const chipMinWidth = 52;
/**
 * Kinds that sit on a PATH. A GRAPH object stands for another map's central
 * goal, so within this map it behaves exactly like the node it represents.
 */
export function carriesPath(o: CanvasObject) {
  return o.type === 'NODE' || o.type === 'GRAPH';
}
export const uid = () => crypto.randomUUID();
export function makeObject(
  type: Kind,
  p: Point,
  role: CanvasObject['role'] = 'NORMAL',
  text = '',
  mapRef?: string,
): CanvasObject {
  return {
    id: uid(),
    type,
    role,
    text,
    note: '',
    mapRef: type === 'GRAPH' ? mapRef : undefined,
    ...p,
    width:
      type === 'NODE'
        ? role === 'GOAL'
          ? 280
          : 210
        : type === 'GRAPH'
          ? 280
          : type === 'IMAGINATION'
            ? imaginationWidth
            : type === 'SEED_BOX'
              ? seedBoxWidth
              : panelWidth,
    height:
      type === 'NODE' || type === 'GRAPH'
        ? 90
        : type === 'SEED_BOX'
          ? seedBoxHeight
          : panelHeight,
    images: [],
    seeds: [],
    // Seed Boxes begin compact and grow through 10 → 20 → 30, the same ladder
    // `seedCapacity` climbs. The tier is a presentation capacity, not a second
    // source of truth for the seed list.
    tier: 10,
    shuffle: Math.random(),
    focal: 50,
    imaginationPreset: type === 'IMAGINATION' ? 'small' : undefined,
    imaginationLayout: type === 'IMAGINATION' ? 'collage' : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
export function imaginationDimensions(
  imageCount: number,
  preset: ImaginationPreset = 'small',
  layout: ImaginationLayout = 'collage',
) {
  const base =
    preset === 'small'
      ? { width: imaginationWidth, height: panelHeight }
      : preset === 'medium'
        ? { width: 440, height: 300 }
        : { width: 580, height: 380 };
  if (!imageCount) return { width: base.width, height: base.height };
  const normalized = imaginationLayout(layout);
  if (normalized === 'uniform') {
    const width = base.width;
    return {
      width,
      height: imaginationGridHeight(width, imageCount, normalized),
    };
  }
  // A collage grows the frame around its primary tile without resizing it.
  const width = Math.round(base.width * (imageCount === 1 ? 1 : 1.5));
  return {
    width,
    height: imaginationGridHeight(width, imageCount, normalized),
  };
}
export function imaginationLayout(
  layout?: ImaginationLayout,
): 'collage' | 'uniform' {
  return layout === 'uniform' || layout === 'spaced' ? 'uniform' : 'collage';
}
export function imaginationGridHeight(
  width: number,
  imageCount: number,
  layout: ImaginationLayout = 'collage',
) {
  if (!imageCount) return 0;
  const normalized = imaginationLayout(layout);
  const count = Math.min(imageCount, 6);
  const [columns, rows] =
    normalized === 'uniform'
      ? count === 1
        ? [1, 1]
        : count === 2
          ? [2, 1]
          : count === 3
            ? [3, 1]
            : count === 4
              ? [2, 2]
              : count === 5
                ? [5, 1]
                : [3, 2]
      : [count === 1 ? 2 : 3, count <= 1 ? 2 : count <= 3 ? 2 : 3];
  const gap = normalized === 'uniform' ? width / 38 : 0;
  const tile = (width - gap * (columns - 1)) / columns;
  return Math.round(rows * tile + gap * (rows - 1));
}
export function seedCapacity(seedCount: number) {
  return seedCount > 20 ? 30 : seedCount > 10 ? 20 : 10;
}
export function objectHeight(o: CanvasObject) {
  if (o.type === 'SEED_BOX')
    return Math.max(o.height, seedLayout(o).height + seedBoxChrome);
  if (o.type === 'IMAGINATION')
    return o.images.length
      ? imaginationGridHeight(o.width, o.images.length, o.imaginationLayout)
      : o.height;
  if (!carriesPath(o)) return o.height;
  // A Graph object is drawn at goal weight, plus the row naming the map it
  // opens.
  const graph = o.type === 'GRAPH';
  const goal = graph || o.role === 'GOAL';
  const columns = Math.max(
    8,
    Math.floor(
      (o.width - (goal ? 50 : 44) - (!goal && o.images.length ? 61 : 0)) /
        (goal ? 12 : 8.5),
    ),
  );
  const lines = Math.min(
    2,
    o.text
      .split('\n')
      .reduce(
        (total, line) => total + Math.max(1, Math.ceil(line.length / columns)),
        0,
      ),
  );
  const contentHeight =
    (goal
      ? 77 + lines * 32 + (o.images.length ? 145 : 0)
      : 44 + Math.max(o.images.length ? 48 : 30, lines * 24)) +
    (graph ? 26 : 0);
  return o.manualHeight ? Math.max(o.height, contentHeight) : contentHeight;
}
export function reachable(
  map: VisionMap,
  id: string,
  reverse = false,
): Set<string> {
  const found = new Set<string>([id]);
  const queue = [id];
  const adjacency = new Map<string, string[]>();
  for (const e of map.relationships)
    if (e.type === 'PATH') {
      const a = reverse ? e.targetId : e.sourceId,
        b = reverse ? e.sourceId : e.targetId;
      adjacency.set(a, [...(adjacency.get(a) || []), b]);
    }
  for (let i = 0; i < queue.length; i++)
    for (const next of adjacency.get(queue[i]) || []) {
      if (!found.has(next)) {
        found.add(next);
        queue.push(next);
      }
    }
  return found;
}
export type PointerSelectionPlan = {
  clickedSelection: Set<string>;
  visibleSelection: Set<string>;
  movementIds: Set<string>;
  explicit: boolean;
  startDrag: boolean;
};
export function pointerSelectionPlan(
  map: VisionMap,
  selected: ReadonlySet<string>,
  explicitSelection: boolean,
  objectId: string,
  toggle: boolean,
  followOutgoing = false,
): PointerSelectionPlan {
  const clickedSelection = new Set([objectId]);
  if (toggle) {
    const visibleSelection = new Set(selected);
    if (visibleSelection.has(objectId)) visibleSelection.delete(objectId);
    else visibleSelection.add(objectId);
    return {
      clickedSelection,
      visibleSelection,
      movementIds: new Set(),
      explicit: true,
      startDrag: false,
    };
  }
  const object = map.objects.find(({ id }) => id === objectId);
  if (followOutgoing && object && carriesPath(object)) {
    return {
      clickedSelection,
      visibleSelection: new Set(clickedSelection),
      movementIds: downstream(map, objectId),
      explicit: false,
      startDrag: true,
    };
  }
  if (explicitSelection && selected.has(objectId)) {
    return {
      clickedSelection,
      visibleSelection: new Set(selected),
      movementIds: new Set(selected),
      explicit: true,
      startDrag: true,
    };
  }
  return {
    clickedSelection,
    visibleSelection: new Set(clickedSelection),
    movementIds: new Set(clickedSelection),
    explicit: false,
    startDrag: true,
  };
}
export function relationType(a: CanvasObject, b: CanvasObject): RelationType {
  if (a.type === 'IMAGINATION' || b.type === 'IMAGINATION') return 'REFERENCE';
  if (a.type === 'SEED_BOX' || b.type === 'SEED_BOX') return 'RELATED';
  return 'PATH';
}
export function relationError(
  map: VisionMap,
  sourceId: string,
  targetId: string,
  type: RelationType,
  ignoreId?: string,
): string | null {
  if (sourceId === targetId) return 'An object cannot connect to itself.';
  const a = map.objects.find((o) => o.id === sourceId),
    b = map.objects.find((o) => o.id === targetId);
  if (!a || !b) return 'This object no longer exists.';
  if (type === 'PATH' && !(carriesPath(a) && carriesPath(b)))
    return 'Paths connect nodes and goals only.';
  if (
    type === 'REFERENCE' &&
    !(
      (a.type === 'IMAGINATION' && carriesPath(b)) ||
      (b.type === 'IMAGINATION' && carriesPath(a))
    )
  )
    return 'Connect an Imagination to a node or goal.';
  if (
    type === 'RELATED' &&
    (a.type === 'IMAGINATION' || b.type === 'IMAGINATION')
  )
    return 'Imagination uses reference connections.';
  const rest = {
    ...map,
    relationships: map.relationships.filter((e) => e.id !== ignoreId),
  };
  if (
    rest.relationships.some(
      (e) =>
        (e.sourceId === sourceId && e.targetId === targetId) ||
        (e.sourceId === targetId && e.targetId === sourceId),
    )
  )
    return 'These objects are already connected. Edit the existing connection.';
  if (type === 'PATH' && reachable(rest, targetId).has(sourceId))
    return 'This would create a circular path.';
  return null;
}
export function connect(
  map: VisionMap,
  sourceId: string,
  targetId: string,
  type?: RelationType,
): VisionMap {
  const a = map.objects.find((o) => o.id === sourceId),
    b = map.objects.find((o) => o.id === targetId);
  if (!a || !b) throw new Error('This object no longer exists.');
  type ??= relationType(a, b);
  const error = relationError(map, sourceId, targetId, type);
  if (error) throw new Error(error);
  if (type === 'REFERENCE' && b.type === 'IMAGINATION')
    [sourceId, targetId] = [targetId, sourceId];
  const edge = { id: uid(), sourceId, targetId, type };
  const child = childEnd(map, edge);
  return {
    ...map,
    relationships: [...map.relationships, edge],
    objects: map.objects.map((o) =>
      o.id === child && type === 'PATH' && !o.attachment
        ? { ...o, attachment: edge.id }
        : o,
    ),
  };
}
/**
 * Hangs `childId` under `parentId`. Between two nodes that is a PATH whose
 * arrow points the way the map's direction option says; a Seed Box or an
 * Imagination hangs off by its own connection type, which carries no arrow.
 */
export function connectChild(
  map: VisionMap,
  parentId: string,
  childId: string,
): VisionMap {
  const parent = map.objects.find((o) => o.id === parentId),
    child = map.objects.find((o) => o.id === childId);
  if (!parent || !child) throw new Error('This object no longer exists.');
  const type = relationType(parent, child);
  if (type !== 'PATH') return connect(map, parentId, childId, type);
  return pathDirection(map) === 'inward'
    ? connect(map, childId, parentId, 'PATH')
    : connect(map, parentId, childId, 'PATH');
}
export function demoMap(): VisionMap {
  const items: [string, number, number, CanvasObject['role']][] = [
    ['A life with room to create', 40, 30, 'GOAL'],
    ['Build my own studio', 490, -180, 'GOAL'],
    ['Make meaningful work', 480, 170, 'NORMAL'],
    ['Explore a new direction', -350, -120, 'NORMAL'],
    ['A daily creative practice', -350, 110, 'NORMAL'],
    ['Share what I make', 810, 170, 'NORMAL'],
    ['Find my people', 490, 360, 'NORMAL'],
    ['A little more freedom', 30, -240, 'NORMAL'],
  ];
  const objects = items.map(([text, x, y, role]) =>
    makeObject('NODE', { x, y }, role, text),
  );
  const seeds = makeObject(
    'SEED_BOX',
    { x: -355, y: 340 },
    'NORMAL',
    'Things I’m curious about',
  );
  seeds.seeds = [
    'A month by the sea',
    'Learn ceramics',
    'Write a small book',
    'A slower morning',
  ].map((text) => ({ id: uid(), text, visualSeed: Math.random() }));
  const mood = makeObject(
    'IMAGINATION',
    { x: 860, y: -190 },
    'NORMAL',
    'Room to imagine',
  );
  mood.note =
    'Collect the spaces, textures and moments that feel like your future.';
  let map: VisionMap = {
    version: 1,
    title: 'My next chapter',
    anchorId: objects[0].id,
    objects: [...objects, seeds, mood],
    relationships: [],
  };
  for (const [a, b] of [
    [3, 0],
    [4, 0],
    [7, 0],
    [2, 1],
    [5, 2],
    [6, 1],
    [4, 2],
  ])
    map = connect(map, objects[a].id, objects[b].id);
  map = connect(map, seeds.id, objects[4].id);
  return connect(map, mood.id, objects[1].id);
}

export function patchObject(
  map: VisionMap,
  id: string,
  patch: Partial<CanvasObject>,
): VisionMap {
  return {
    ...map,
    objects: map.objects.map((o) =>
      o.id === id ? { ...o, ...patch, updatedAt: Date.now() } : o,
    ),
  };
}
export function removeEdge(map: VisionMap, id: string): VisionMap {
  const relationships = map.relationships.filter((e) => e.id !== id);
  return {
    ...map,
    relationships,
    objects: map.objects.map((o) =>
      o.attachment === id
        ? { ...o, attachment: attachmentFor(map, relationships, o.id) }
        : o,
    ),
  };
}
export function editEdge(
  map: VisionMap,
  id: string,
  reverse: boolean,
  type?: RelationType,
): VisionMap {
  const edge = map.relationships.find((e) => e.id === id);
  if (!edge) return map;
  if (reverse && edge.type !== 'PATH') return map;
  const a = reverse ? edge.targetId : edge.sourceId,
    b = reverse ? edge.sourceId : edge.targetId;
  const next = connect(removeEdge(map, id), a, b, type || edge.type);
  const generated = next.relationships[next.relationships.length - 1].id;
  return {
    ...next,
    relationships: next.relationships.map((e) =>
      e.id === generated ? { ...e, id } : e,
    ),
    objects: next.objects.map((o) =>
      o.attachment === generated ? { ...o, attachment: id } : o,
    ),
  };
}
export function deletionError(map: VisionMap, ids: Set<string>): string | null {
  for (const id of ids) {
    const incoming = map.relationships.filter(
      (e) => e.type === 'PATH' && e.targetId === id,
    ).length;
    const outgoing = map.relationships.filter(
      (e) => e.type === 'PATH' && e.sourceId === id,
    ).length;
    if (incoming > 1 && outgoing > 1)
      return 'Disconnect a path first. This node has multiple incoming and outgoing paths.';
  }
  return null;
}
export function deleteObjects(map: VisionMap, ids: Set<string>): VisionMap {
  const error = deletionError(map, ids);
  if (error) throw new Error(error);
  // Walk through the complete deleted set before reconnecting its surviving boundaries.
  const bridges: [string, string][] = [];
  for (const e of map.relationships)
    if (e.type === 'PATH' && !ids.has(e.sourceId) && ids.has(e.targetId)) {
      const queue = [e.targetId],
        seen = new Set(queue);
      for (let i = 0; i < queue.length; i++)
        for (const out of map.relationships.filter(
          (x) => x.type === 'PATH' && x.sourceId === queue[i],
        )) {
          if (!ids.has(out.targetId)) bridges.push([e.sourceId, out.targetId]);
          else if (!seen.has(out.targetId)) {
            seen.add(out.targetId);
            queue.push(out.targetId);
          }
        }
    }
  let next: VisionMap = {
    ...map,
    objects: map.objects.filter((o) => !ids.has(o.id)),
    relationships: map.relationships.filter(
      (e) => !ids.has(e.sourceId) && !ids.has(e.targetId),
    ),
  };
  next.objects = next.objects.map((o) => ({
    ...o,
    attachment: next.relationships.some((e) => e.id === o.attachment)
      ? o.attachment
      : attachmentFor(next, next.relationships, o.id),
  }));
  for (const [a, b] of bridges)
    if (!relationError(next, a, b, 'PATH')) next = connect(next, a, b, 'PATH');
  if (ids.has(next.anchorId))
    next.anchorId = next.objects.find(carriesPath)?.id || '';
  return next;
}
export function copySelection(map: VisionMap, ids: Set<string>): VisionMap {
  const relationships = map.relationships.filter(
    (e) => ids.has(e.sourceId) && ids.has(e.targetId),
  );
  const objects = map.objects
    .filter((o) => ids.has(o.id))
    .map((o) => ({
      ...o,
      attachment: relationships.some((e) => e.id === o.attachment)
        ? o.attachment
        : undefined,
    }));
  return {
    ...map,
    anchorId: ids.has(map.anchorId) ? map.anchorId : objects[0]?.id || '',
    objects,
    relationships,
  };
}
export function duplicate(
  map: VisionMap,
  source: VisionMap,
  offset: Point = { x: 45, y: 45 },
): { map: VisionMap; ids: string[] } {
  const ids = new Map(source.objects.map((o) => [o.id, uid()]));
  const edges = source.relationships
    .filter((e) => ids.has(e.sourceId) && ids.has(e.targetId))
    .map((e) => ({
      ...e,
      id: uid(),
      sourceId: ids.get(e.sourceId)!,
      targetId: ids.get(e.targetId)!,
    }));
  const objects = source.objects.map((o) => ({
    ...structuredClone(o),
    id: ids.get(o.id)!,
    x: o.x + offset.x,
    y: o.y + offset.y,
    attachment: attachmentFor(source, edges, ids.get(o.id)!),
    seeds: o.seeds.map((s) => ({ ...s, id: uid(), visualSeed: Math.random() })),
    shuffle: Math.random(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  return {
    map: {
      ...map,
      objects: [...map.objects, ...objects],
      relationships: [...map.relationships, ...edges],
    },
    ids: objects.map((o) => o.id),
  };
}
export function intersects(
  a: CanvasObject,
  b: CanvasObject,
  padding = 22,
): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + objectHeight(b) + padding &&
    a.y + objectHeight(a) + padding > b.y
  );
}
export function freePosition(
  map: VisionMap,
  object: CanvasObject,
): CanvasObject {
  let next = { ...object };
  for (let i = 0; i < map.objects.length + 1; i++) {
    const hit = map.objects.find(
      (o) => o.id !== next.id && intersects(next, o),
    );
    if (!hit) break;
    next = { ...next, y: hit.y + objectHeight(hit) + 32 };
  }
  return next;
}
/** The title a freshly created object of this kind starts with. */
export function defaultTitle(type: Kind) {
  return type === 'SEED_BOX'
    ? 'Loose ideas'
    : type === 'IMAGINATION'
      ? 'Imagination'
      : '';
}
export function branch(
  map: VisionMap,
  id: string,
  type: Kind = 'NODE',
  role: CanvasObject['role'] = 'NORMAL',
  link?: { mapRef: string; title: string },
): { map: VisionMap; object: CanvasObject } {
  const parent = map.objects.find((o) => o.id === id);
  if (!parent || !carriesPath(parent)) throw new Error('Select a node first.');
  const anchor = map.objects.find((o) => o.id === map.anchorId) || parent;
  const left = parent.x < anchor.x;
  const object = freePosition(
    map,
    makeObject(
      type,
      {
        x: left ? parent.x - 330 : parent.x + parent.width + 110,
        y: parent.y,
      },
      type === 'NODE' ? role : 'NORMAL',
      link?.title ?? defaultTitle(type),
      link?.mapRef,
    ),
  );
  const next = { ...map, objects: [...map.objects, object] };
  return { map: connectChild(next, parent.id, object.id), object };
}
/** Whether a connection between these two kinds is expressible at all. */
function relationAllowed(a: CanvasObject, b: CanvasObject, type: RelationType) {
  if (type === 'PATH') return carriesPath(a) && carriesPath(b);
  if (type === 'REFERENCE')
    return (
      (a.type === 'IMAGINATION' && carriesPath(b)) ||
      (b.type === 'IMAGINATION' && carriesPath(a))
    );
  return a.type !== 'IMAGINATION' && b.type !== 'IMAGINATION';
}
/**
 * Points every branch attachment at a PATH that really ends on its object.
 * Retyping or dropping a connection can leave one dangling, and a map with a
 * dangling attachment does not load.
 */
function repairAttachments(map: VisionMap): VisionMap {
  return {
    ...map,
    objects: map.objects.map((o) => {
      const kept = map.relationships.some(
        (e) =>
          e.id === o.attachment &&
          e.type === 'PATH' &&
          (e.targetId === o.id || e.sourceId === o.id),
      );
      if (kept) return o;
      const attachment = attachmentFor(map, map.relationships, o.id);
      return attachment === o.attachment ? o : { ...o, attachment };
    }),
  };
}
/**
 * Changes what an object is. Content the new kind cannot hold is dropped and
 * every connection it takes part in is retyped to what the new pair allows, so
 * a conversion never leaves a map that fails to load. Undo restores the rest.
 */
export function convertObject(
  map: VisionMap,
  id: string,
  type: Kind,
  role: CanvasObject['role'] = 'NORMAL',
  mapRef?: string,
): VisionMap {
  const object = map.objects.find((o) => o.id === id);
  if (!object) throw new Error('This object no longer exists.');
  const nextRole = type === 'NODE' ? role : 'NORMAL';
  if (type === 'GRAPH' && !mapRef && !object.mapRef)
    throw new Error('Choose the graph this object opens.');
  if (
    object.type === type &&
    object.role === nextRole &&
    (type !== 'GRAPH' || !mapRef || mapRef === object.mapRef)
  )
    return map;
  const dimensions =
    type === 'IMAGINATION'
      ? imaginationDimensions(
          object.images.length,
          object.imaginationPreset,
          object.imaginationLayout,
        )
      : undefined;
  const converted: CanvasObject = {
    ...object,
    type,
    role: nextRole,
    // A node carries one image, a Seed Box none, and only a Seed Box has seeds.
    images:
      type === 'SEED_BOX'
        ? []
        : type === 'NODE'
          ? object.images.slice(0, 1)
          : object.images,
    seeds: type === 'SEED_BOX' ? object.seeds : [],
    tier: [10, 20, 30].includes(object.tier) ? object.tier : 10,
    width:
      dimensions?.width ??
      (type === 'NODE'
        ? nextRole === 'GOAL'
          ? 280
          : 210
        : type === 'GRAPH'
          ? 280
          : Math.max(minPanelWidth, object.width)),
    height:
      dimensions?.height ??
      (type === 'NODE' || type === 'GRAPH' ? 90 : object.height),
    manualHeight: type === 'NODE' ? object.manualHeight : undefined,
    // The link is what a Graph object is; every other kind drops it.
    mapRef: type === 'GRAPH' ? mapRef || object.mapRef : undefined,
    imaginationPreset:
      type === 'IMAGINATION' ? object.imaginationPreset || 'small' : undefined,
    imaginationLayout:
      type === 'IMAGINATION'
        ? object.imaginationLayout || 'collage'
        : undefined,
    updatedAt: Date.now(),
  };
  const index = new Map(map.objects.map((o) => [o.id, o]));
  index.set(id, converted);
  const relationships: Relationship[] = [];
  for (const edge of map.relationships) {
    if (edge.sourceId !== id && edge.targetId !== id) {
      relationships.push(edge);
      continue;
    }
    const a = index.get(edge.sourceId)!,
      b = index.get(edge.targetId)!;
    const next = relationType(a, b);
    if (!relationAllowed(a, b, next)) continue;
    // A reference is authored with the Imagination as its source.
    const flip = next === 'REFERENCE' && b.type === 'IMAGINATION';
    relationships.push({
      ...edge,
      type: next,
      sourceId: flip ? edge.targetId : edge.sourceId,
      targetId: flip ? edge.sourceId : edge.targetId,
    });
  }
  return repairAttachments({
    ...map,
    objects: map.objects.map((o) => (o.id === id ? converted : o)),
    relationships,
  });
}
export function moveObjects(
  map: VisionMap,
  ids: Set<string>,
  delta: Point,
): VisionMap {
  return {
    ...map,
    objects: map.objects.map((o) =>
      ids.has(o.id) ? { ...o, x: o.x + delta.x, y: o.y + delta.y } : o,
    ),
  };
}
export function reparent(
  map: VisionMap,
  id: string,
  targetId: string,
): VisionMap {
  const object = map.objects.find((o) => o.id === id),
    target = map.objects.find((o) => o.id === targetId);
  if (!object || !target || !carriesPath(object) || !carriesPath(target))
    throw new Error('Drop on a node or goal.');
  if (downstream(map, id).has(targetId))
    throw new Error('This would create a circular path.');
  let next = object.attachment ? removeEdge(map, object.attachment) : map;
  next = connectChild(next, targetId, id);
  const attached = next.relationships[next.relationships.length - 1];
  next = patchObject(next, id, { attachment: attached.id });
  const moving = downstream(next, id);
  const anchor = map.objects.find((o) => o.id === map.anchorId);
  const left = target.x < (anchor?.x ?? 0);
  const desired = freePosition(
    { ...next, objects: next.objects.filter((o) => !moving.has(o.id)) },
    {
      ...object,
      x: left ? target.x - object.width - 100 : target.x + target.width + 100,
      y: target.y,
    },
  );
  return reflowBranch(
    moveObjects(next, moving, {
      x: desired.x - object.x,
      y: desired.y - object.y,
    }),
    moving,
  );
}
export function reflowBranch(map: VisionMap, ids: Set<string>): VisionMap {
  const fixed = map.objects.filter((o) => !ids.has(o.id) || o.role === 'GOAL');
  const positions = new Map<string, CanvasObject>();
  for (const o of map.objects.filter(
    (o) => ids.has(o.id) && o.role !== 'GOAL',
  )) {
    const placed = freePosition({ ...map, objects: fixed }, o);
    fixed.push(placed);
    positions.set(o.id, placed);
  }
  return { ...map, objects: map.objects.map((o) => positions.get(o.id) || o) };
}
export type PredictiveLayoutInput = {
  baseMap: VisionMap;
  movingIds: ReadonlySet<string>;
  dragDelta: Point;
  draggedRootId: string;
  optionalTargetId?: string;
  explicitSelection: boolean;
  /**
   * Resolve overlaps by pushing the moving objects to a free band. Defaults to
   * true, which is what a drop needs. A drag in flight passes false so the card
   * tracks the pointer across other cards instead of jumping around them; the
   * overlap is reported instead and settled when the pointer is released.
   */
  settle?: boolean;
};
export type RelationshipChange = {
  removedId?: string;
  added?: Relationship;
  attachmentId?: string;
};
export type PredictiveLayoutResult = {
  previewMap: VisionMap;
  valid: boolean;
  message?: string;
  relationshipChange?: RelationshipChange;
  affectedObjectIds: Set<string>;
  /**
   * Moving objects that sit on top of a resting one in `previewMap`. Empty
   * whenever the layout settled, so a non-empty set always means the position
   * cannot be kept as drawn.
   */
  overlappingIds: Set<string>;
};
const layoutGap = 24;
const collisionCellSize = 256;
function overlaps(a: CanvasObject, b: CanvasObject) {
  return (
    a.x < b.x + b.width + layoutGap &&
    a.x + a.width + layoutGap > b.x &&
    a.y < b.y + objectHeight(b) + layoutGap &&
    a.y + objectHeight(a) + layoutGap > b.y
  );
}
function collisionIndex(fixed: readonly CanvasObject[]) {
  const cells = new Map<string, CanvasObject[]>();
  const key = (x: number, y: number) => `${x}:${y}`;
  for (const object of fixed) {
    const left = Math.floor((object.x - layoutGap) / collisionCellSize);
    const right = Math.floor(
      (object.x + object.width + layoutGap) / collisionCellSize,
    );
    const top = Math.floor((object.y - layoutGap) / collisionCellSize);
    const bottom = Math.floor(
      (object.y + objectHeight(object) + layoutGap) / collisionCellSize,
    );
    for (let x = left; x <= right; x++)
      for (let y = top; y <= bottom; y++) {
        const current = cells.get(key(x, y));
        if (current) current.push(object);
        else cells.set(key(x, y), [object]);
      }
  }
  return (object: CanvasObject) => {
    const candidates = new Set<CanvasObject>();
    const left = Math.floor(object.x / collisionCellSize);
    const right = Math.floor((object.x + object.width) / collisionCellSize);
    const top = Math.floor(object.y / collisionCellSize);
    const bottom = Math.floor(
      (object.y + objectHeight(object)) / collisionCellSize,
    );
    for (let x = left; x <= right; x++)
      for (let y = top; y <= bottom; y++)
        for (const candidate of cells.get(key(x, y)) || [])
          candidates.add(candidate);
    return candidates;
  };
}
function collisionFreeTranslation(
  map: VisionMap,
  movingIds: ReadonlySet<string>,
  delta: Point,
) {
  const moving = map.objects.filter((object) => movingIds.has(object.id));
  const fixed = map.objects.filter((object) => !movingIds.has(object.id));
  const candidatesFor = collisionIndex(fixed);
  const step = Math.max(
    36,
    ...moving.map((object) => objectHeight(object) + layoutGap),
  );
  let offsetY = 0;
  for (let attempt = 0; attempt < 201; attempt++) {
    const translated = moving.map((object) => ({
      ...object,
      x: object.x + delta.x,
      y: object.y + delta.y + offsetY,
    }));
    if (
      !translated.some((object) =>
        [...candidatesFor(object)].some((item) => overlaps(object, item)),
      )
    ) {
      const positions = new Map(
        translated.map((object) => [object.id, object]),
      );
      return {
        ...map,
        objects: map.objects.map(
          (object) => positions.get(object.id) || object,
        ),
      };
    }
    const distance = (Math.floor(attempt / 2) + 1) * step;
    offsetY = attempt % 2 === 0 ? distance : -distance;
  }
  return moveObjects(map, new Set(movingIds), delta);
}
/** Moving objects whose placement in `map` collides with a resting object. */
function overlappingMovingIds(map: VisionMap, movingIds: ReadonlySet<string>) {
  const moving = map.objects.filter((object) => movingIds.has(object.id));
  const candidatesFor = collisionIndex(
    map.objects.filter((object) => !movingIds.has(object.id)),
  );
  const overlapping = new Set<string>();
  for (const object of moving)
    if ([...candidatesFor(object)].some((item) => overlaps(object, item)))
      overlapping.add(object.id);
  return overlapping;
}
function deterministicRelationshipId(
  map: VisionMap,
  sourceId: string,
  targetId: string,
) {
  const prefix = `layout:${sourceId}:${targetId}`;
  let id = prefix;
  let suffix = 1;
  const used = new Set(
    map.relationships.map((relationship) => relationship.id),
  );
  while (used.has(id)) id = `${prefix}:${suffix++}`;
  return id;
}
export function predictiveLayout(
  input: PredictiveLayoutInput,
): PredictiveLayoutResult {
  const affectedObjectIds = new Set(input.movingIds);
  let semanticMap = input.baseMap;
  let relationshipChange: RelationshipChange | undefined;
  let invalidMessage: string | undefined;
  if (input.optionalTargetId && !input.explicitSelection) {
    const root = input.baseMap.objects.find(
      (object) => object.id === input.draggedRootId,
    );
    const target = input.baseMap.objects.find(
      (object) => object.id === input.optionalTargetId,
    );
    if (!root || !target || !carriesPath(root) || !carriesPath(target))
      invalidMessage = 'Drop on a node or goal.';
    else if (downstream(input.baseMap, root.id).has(target.id))
      invalidMessage = 'This would create a circular path.';
    else {
      const removedId = root.attachment;
      const relationships = input.baseMap.relationships.filter(
        (relationship) => relationship.id !== removedId,
      );
      // The new PATH points the way the map's direction option says.
      const [sourceId, targetId] =
        pathDirection(input.baseMap) === 'inward'
          ? [root.id, target.id]
          : [target.id, root.id];
      const existing = relationships.find(
        (relationship) =>
          relationship.type === 'PATH' &&
          relationship.sourceId === sourceId &&
          relationship.targetId === targetId,
      );
      const added = existing
        ? undefined
        : {
            id: deterministicRelationshipId(
              { ...input.baseMap, relationships },
              sourceId,
              targetId,
            ),
            sourceId,
            targetId,
            type: 'PATH' as const,
          };
      const attachmentId = existing?.id || added!.id;
      semanticMap = {
        ...input.baseMap,
        relationships: added ? [...relationships, added] : relationships,
        objects: input.baseMap.objects.map((object) =>
          object.id === root.id
            ? { ...object, attachment: attachmentId }
            : object,
        ),
      };
      relationshipChange = { removedId, added, attachmentId };
    }
  }
  const sourceMap = invalidMessage ? input.baseMap : semanticMap;
  const settle = input.settle !== false;
  const previewMap = settle
    ? collisionFreeTranslation(sourceMap, input.movingIds, input.dragDelta)
    : moveObjects(sourceMap, new Set(input.movingIds), input.dragDelta);
  return {
    previewMap,
    valid: !invalidMessage,
    message: invalidMessage,
    relationshipChange,
    affectedObjectIds,
    overlappingIds: settle
      ? new Set<string>()
      : overlappingMovingIds(previewMap, input.movingIds),
  };
}
function deterministicUnit(values: readonly number[]) {
  let state = 0x811c9dc5;
  for (const value of values) {
    let part = Math.floor(Math.abs(value) * 1_000_003) >>> 0;
    for (let index = 0; index < 4; index++) {
      state ^= part & 0xff;
      state = Math.imul(state, 0x01000193) >>> 0;
      part >>>= 8;
    }
  }
  state += 0x6d2b79f5;
  let mixed = state;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
}
export function nextVisualShuffle(current: number) {
  return deterministicUnit([current, 0.61803398875, 17]);
}
/**
 * Rearranges the chips in a Seed Box. Shuffle is the only thing that changes
 * their order, so it reorders the seeds themselves rather than feeding a
 * layout randomiser: the arrangement then survives a reload, and Undo puts
 * the previous one back with everything else in the step.
 */
export function shuffleSeeds(map: VisionMap, id: string): VisionMap {
  const o = map.objects.find((o) => o.id === id);
  if (!o || o.type !== 'SEED_BOX' || o.seeds.length < 2) return map;
  const shuffle = nextVisualShuffle(o.shuffle);
  const seeds = [...o.seeds];
  for (let index = seeds.length - 1; index > 0; index--) {
    const pick = Math.floor(deterministicUnit([shuffle, index]) * (index + 1));
    [seeds[index], seeds[pick]] = [seeds[pick], seeds[index]];
  }
  return patchObject(map, id, { seeds, shuffle });
}
/**
 * Seeds are chips: a left-aligned flow of pills in reading order, wrapped to
 * the width of the bed. Every measurement comes from the text, so a Seed Box
 * composes identically on every render and a drag never rearranges it.
 */
export function seedLayout(o: CanvasObject) {
  const available = Math.max(96, o.width - seedBedInset * 2);
  const positions: Array<{
    seed: Seed;
    x: number;
    y: number;
    width: number;
    height: number;
    multiline: boolean;
  }> = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  // Everything a chip needs beside its text: border, padding and the handle.
  const chrome = chipBorder * 2 + chipPaddingX * 2 + chipHandleWidth;
  for (const seed of o.seeds) {
    const characters = seed.text.trim().length || 1;
    const width = Math.min(
      available,
      Math.max(
        chipMinWidth,
        Math.ceil(characters * chipCharacterWidth) + chipTextCushion + chrome,
      ),
    );
    const charactersPerLine = Math.max(
      1,
      Math.floor((width - chrome - chipTextCushion) / chipCharacterWidth),
    );
    const lines = Math.ceil(characters / charactersPerLine);
    const height = lines * chipLineHeight + chipPaddingY * 2 + chipBorder * 2;
    // A chip that no longer fits on this row opens the next one.
    if (x && x + width > available) {
      x = 0;
      y += rowHeight + seedChipRowGap;
      rowHeight = 0;
    }
    positions.push({ seed, x, y, width, height, multiline: lines > 1 });
    x += width + seedChipGap;
    rowHeight = Math.max(rowHeight, height);
  }
  return { positions, height: positions.length ? y + rowHeight : 0 };
}
export function addSeed(map: VisionMap, id: string, text: string): VisionMap {
  const o = map.objects.find((o) => o.id === id);
  if (!o || o.type !== 'SEED_BOX') throw new Error('Select a Seed Box.');
  if (!text.trim()) return map;
  if (o.seeds.length >= 30)
    throw new Error('Maximum 30 seeds in this Seed Box.');
  const seeds = [
    ...o.seeds,
    { id: uid(), text: text.trim(), visualSeed: Math.random() },
  ];
  const tier = seedCapacity(seeds.length);
  return patchObject(map, id, {
    seeds,
    tier,
    height: Math.max(
      o.height,
      seedBoxChrome + seedLayout({ ...o, seeds }).height,
    ),
  });
}
export function moveSeed(
  map: VisionMap,
  boxId: string,
  seedId: string,
  p: Point,
  targetId?: string,
): { map: VisionMap; id: string } {
  const box = map.objects.find((o) => o.id === boxId),
    seed = box?.seeds.find((s) => s.id === seedId);
  if (!seed || !box) throw new Error('This seed no longer exists.');
  const target = map.objects.find((o) => o.id === targetId);
  if (target?.id === boxId) return { map, id: boxId };
  let next = patchObject(map, boxId, {
    seeds: box.seeds.filter((s) => s.id !== seedId),
  });
  if (target?.type === 'SEED_BOX') {
    if (target.seeds.length >= 30)
      throw new Error('Maximum 30 seeds in this Seed Box.');
    const seeds = [...target.seeds, seed];
    next = patchObject(next, target.id, {
      seeds,
      tier: seedCapacity(seeds.length),
      height: Math.max(
        target.height,
        seedBoxChrome + seedLayout({ ...target, seeds }).height,
      ),
    });
    return { map: next, id: target.id };
  }
  if (target && !carriesPath(target))
    throw new Error('Drop on the canvas, a node, or another Seed Box.');
  const node = freePosition(next, makeObject('NODE', p, 'NORMAL', seed.text));
  next = { ...next, objects: [...next.objects, node] };
  if (target) next = connectChild(next, target.id, node.id);
  return { map: next, id: node.id };
}
export function edgePath(a: CanvasObject, b: CanvasObject): string {
  const ac = { x: a.x + a.width / 2, y: a.y + objectHeight(a) / 2 },
    bc = { x: b.x + b.width / 2, y: b.y + objectHeight(b) / 2 };
  const dx = bc.x - ac.x,
    dy = bc.y - ac.y;
  if (Math.abs(dx) >= Math.abs(dy) * 0.8) {
    const x1 = ac.x + (Math.sign(dx || 1) * a.width) / 2,
      x2 = bc.x - Math.sign(dx || 1) * (b.width / 2 + 5),
      bend = Math.max(45, Math.abs(x2 - x1) * 0.5);
    return `M${x1},${ac.y} C${x1 + Math.sign(dx || 1) * bend},${ac.y} ${x2 - Math.sign(dx || 1) * bend},${bc.y} ${x2},${bc.y}`;
  }
  const y1 = ac.y + (Math.sign(dy) * objectHeight(a)) / 2,
    y2 = bc.y - Math.sign(dy) * (objectHeight(b) / 2 + 5),
    bend = Math.max(45, Math.abs(y2 - y1) * 0.5);
  return `M${ac.x},${y1} C${ac.x},${y1 + Math.sign(dy) * bend} ${bc.x},${y2 - Math.sign(dy) * bend} ${bc.x},${y2}`;
}

function validCrops(crops: unknown): crops is Record<string, ImageCrop> {
  return (
    typeof crops === 'object' &&
    crops !== null &&
    !Array.isArray(crops) &&
    Object.values(crops as Record<string, unknown>).every(
      (crop) =>
        typeof crop === 'object' &&
        crop !== null &&
        [
          (crop as ImageCrop).x,
          (crop as ImageCrop).y,
          (crop as ImageCrop).scale,
        ].every(Number.isFinite),
    )
  );
}
export function validateMap(input: unknown): VisionMap {
  const m = input as VisionMap;
  if (
    !m ||
    m.version !== 1 ||
    typeof m.title !== 'string' ||
    typeof m.anchorId !== 'string' ||
    (m.pathDirection !== undefined &&
      !['outward', 'inward'].includes(m.pathDirection)) ||
    !Array.isArray(m.objects) ||
    !Array.isArray(m.relationships)
  )
    throw new Error('Choose a valid Nodestar map.');
  const ids = new Set<string>(),
    seedIds = new Set<string>(),
    edgeIds = new Set<string>();
  for (const o of m.objects) {
    if (
      !o ||
      typeof o.id !== 'string' ||
      !o.id ||
      ids.has(o.id) ||
      !['NODE', 'SEED_BOX', 'IMAGINATION', 'GRAPH'].includes(o.type) ||
      !['NORMAL', 'GOAL'].includes(o.role) ||
      typeof o.text !== 'string' ||
      typeof o.note !== 'string' ||
      (o.displayTitle !== undefined && typeof o.displayTitle !== 'boolean') ||
      (o.collapsed !== undefined && typeof o.collapsed !== 'boolean') ||
      (o.manualHeight !== undefined && typeof o.manualHeight !== 'boolean') ||
      (o.imaginationLayout !== undefined &&
        !['collage', 'uniform', 'gapless', 'spaced'].includes(
          o.imaginationLayout,
        )) ||
      (o.focalX !== undefined && !Number.isFinite(o.focalX)) ||
      (o.crops !== undefined && !validCrops(o.crops)) ||
      (o.mapRef !== undefined && typeof o.mapRef !== 'string') ||
      ![
        o.x,
        o.y,
        o.width,
        o.height,
        o.focal,
        o.shuffle,
        o.createdAt,
        o.updatedAt,
      ].every(Number.isFinite) ||
      o.width < 100 ||
      o.width > 10000 ||
      o.height < 1 ||
      !Array.isArray(o.images) ||
      o.images.some((id) => typeof id !== 'string') ||
      new Set(o.images).size !== o.images.length ||
      !Array.isArray(o.seeds) ||
      o.seeds.length > 30
    )
      throw new Error('This map contains an invalid object.');
    if (
      (o.type === 'NODE' && o.images.length > 1) ||
      (o.type === 'SEED_BOX' && o.images.length) ||
      (o.type === 'GRAPH' && o.images.length) ||
      (o.type !== 'SEED_BOX' && o.seeds.length) ||
      (o.type !== 'NODE' && o.role !== 'NORMAL') ||
      // A Graph object without a link stands for nothing.
      (o.type === 'GRAPH') !== (typeof o.mapRef === 'string' && !!o.mapRef)
    )
      throw new Error('This map violates object content rules.');
    if (![10, 20, 30].includes(o.tier) || o.seeds.length > 30)
      throw new Error('This Seed Box has an invalid capacity.');
    for (const seed of o.seeds) {
      if (
        !seed ||
        typeof seed.id !== 'string' ||
        !seed.id ||
        seedIds.has(seed.id) ||
        typeof seed.text !== 'string' ||
        !seed.text.trim() ||
        !Number.isFinite(seed.visualSeed)
      )
        throw new Error('This map contains an invalid seed.');
      seedIds.add(seed.id);
    }
    ids.add(o.id);
  }
  let checked = { ...m, relationships: [] as Relationship[] };
  for (const e of m.relationships) {
    if (
      !e ||
      typeof e.id !== 'string' ||
      !e.id ||
      edgeIds.has(e.id) ||
      !['PATH', 'RELATED', 'REFERENCE'].includes(e.type)
    )
      throw new Error('This map contains an invalid relationship.');
    checked = connect(checked, e.sourceId, e.targetId, e.type);
    edgeIds.add(e.id);
  }
  for (const o of m.objects)
    if (
      o.attachment &&
      !m.relationships.some(
        (e) =>
          e.id === o.attachment &&
          (e.targetId === o.id || e.sourceId === o.id) &&
          e.type === 'PATH',
      )
    )
      throw new Error('This map contains an invalid branch attachment.');
  if (m.anchorId && !ids.has(m.anchorId))
    throw new Error('This map is missing its spatial anchor.');
  return m;
}
