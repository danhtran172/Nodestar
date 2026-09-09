export type Kind = 'NODE' | 'SEED_BOX' | 'IMAGINATION';
export type ImaginationPreset = 'small' | 'medium' | 'large';
export type RelationType = 'PATH' | 'RELATED' | 'REFERENCE';
export type Seed = { id: string; text: string; visualSeed: number };
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
  displayNote?: boolean;
  imaginationPreset?: ImaginationPreset;
  attachment?: string;
  createdAt: number;
  updatedAt: number;
};
export type Relationship = {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
};
export type VisionMap = {
  version: 1;
  title: string;
  anchorId: string;
  objects: CanvasObject[];
  relationships: Relationship[];
};
export type Point = { x: number; y: number };
export const uid = () => crypto.randomUUID();
export function makeObject(
  type: Kind,
  p: Point,
  role: CanvasObject['role'] = 'NORMAL',
  text = '',
): CanvasObject {
  return {
    id: uid(),
    type,
    role,
    text,
    note: '',
    ...p,
    width: type === 'NODE' ? (role === 'GOAL' ? 280 : 210) : type === 'IMAGINATION' ? 320 : 310,
    height: type === 'NODE' ? 90 : 240,
    images: [],
    seeds: [],
    // Seed Boxes begin compact and grow through 5 → 10 → 20.  The tier is a
    // presentation capacity, not a second source of truth for the seed list.
    tier: type === 'SEED_BOX' ? 5 : 10,
    shuffle: Math.random(),
    focal: 50,
    imaginationPreset: type === 'IMAGINATION' ? 'small' : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
export function imaginationDimensions(
  imageCount: number,
  preset: ImaginationPreset = 'small',
) {
  const base = preset === 'small'
    ? { width: 320, height: 240 }
    : preset === 'medium'
      ? { width: 440, height: 300 }
      : { width: 580, height: 380 };
  const scale = imageCount <= 1 ? 1 : imageCount === 2 ? 1.2 : imageCount === 3 ? 1.35 : imageCount === 4 ? 1.5 : imageCount === 5 ? 1.62 : 1.75;
  return {
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
  };
}
export function seedCapacity(seedCount: number) {
  return seedCount > 10 ? 20 : seedCount > 5 ? 10 : 5;
}
export function objectHeight(o: CanvasObject) {
  if (o.type === 'SEED_BOX')
    return Math.max(o.height, seedLayout(o).height + 132);
  if (o.type !== 'NODE') return o.height;
  const goal = o.role === 'GOAL';
  const columns = Math.max(
    8,
    Math.floor(
      (o.width - (goal ? 50 : 44) - (!goal && o.images.length ? 61 : 0)) /
        (goal ? 12 : 8.5),
    ),
  );
  const lines = Math.min(2, o.text
    .split('\n')
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / columns)),
      0,
    ));
  return goal
    ? 77 + lines * 32 + (o.images.length ? 145 : 0)
    : 44 + Math.max(o.images.length ? 48 : 30, lines * 24);
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
  moveBranch = false,
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
  if (explicitSelection && selected.has(objectId)) {
    return {
      clickedSelection,
      visibleSelection: new Set(selected),
      movementIds: new Set(selected),
      explicit: true,
      startDrag: true,
    };
  }
  const object = map.objects.find(({ id }) => id === objectId);
  return {
    clickedSelection,
    visibleSelection: new Set(clickedSelection),
    movementIds:
      moveBranch && object?.type === 'NODE'
        ? reachable(map, objectId)
        : new Set(clickedSelection),
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
  if (type === 'PATH' && (a.type !== 'NODE' || b.type !== 'NODE'))
    return 'Paths connect nodes and goals only.';
  if (
    type === 'REFERENCE' &&
    !(
      (a.type === 'IMAGINATION' && b.type === 'NODE') ||
      (b.type === 'IMAGINATION' && a.type === 'NODE')
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
  return {
    ...map,
    relationships: [...map.relationships, edge],
    objects: map.objects.map((o) =>
      o.id === targetId && type === 'PATH' && !o.attachment
        ? { ...o, attachment: edge.id }
        : o,
    ),
  };
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
        ? {
            ...o,
            attachment: relationships.find(
              (e) => e.type === 'PATH' && e.targetId === o.id,
            )?.id,
          }
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
      : next.relationships.find((e) => e.type === 'PATH' && e.targetId === o.id)
          ?.id,
  }));
  for (const [a, b] of bridges)
    if (!relationError(next, a, b, 'PATH')) next = connect(next, a, b, 'PATH');
  if (ids.has(next.anchorId))
    next.anchorId = next.objects.find((o) => o.type === 'NODE')?.id || '';
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
    attachment: edges.find(
      (e) => e.targetId === ids.get(o.id) && e.type === 'PATH',
    )?.id,
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
export function branch(
  map: VisionMap,
  id: string,
): { map: VisionMap; object: CanvasObject } {
  const parent = map.objects.find((o) => o.id === id);
  if (!parent || parent.type !== 'NODE')
    throw new Error('Select a node first.');
  const anchor = map.objects.find((o) => o.id === map.anchorId) || parent;
  const left = parent.x < anchor.x;
  const object = freePosition(
    map,
    makeObject('NODE', {
      x: left ? parent.x - 330 : parent.x + parent.width + 110,
      y: parent.y,
    }),
  );
  const next = { ...map, objects: [...map.objects, object] };
  return {
    map:
      parent.role === 'GOAL'
        ? connect(next, object.id, parent.id)
        : connect(next, parent.id, object.id),
    object,
  };
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
  if (!object || !target || object.type !== 'NODE' || target.type !== 'NODE')
    throw new Error('Drop on a node or goal.');
  if (reachable(map, id).has(targetId))
    throw new Error('This would create a circular path.');
  let next = object.attachment ? removeEdge(map, object.attachment) : map;
  next = connect(next, targetId, id, 'PATH');
  const attached = next.relationships[next.relationships.length - 1];
  next = patchObject(next, id, { attachment: attached.id });
  const moving = reachable(next, id);
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
        for (const candidate of cells.get(key(x, y)) || []) candidates.add(candidate);
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
      const positions = new Map(translated.map((object) => [object.id, object]));
      return {
        ...map,
        objects: map.objects.map((object) => positions.get(object.id) || object),
      };
    }
    const distance = (Math.floor(attempt / 2) + 1) * step;
    offsetY = attempt % 2 === 0 ? distance : -distance;
  }
  return moveObjects(map, new Set(movingIds), delta);
}
function deterministicRelationshipId(
  map: VisionMap,
  sourceId: string,
  targetId: string,
) {
  const prefix = `layout:${sourceId}:${targetId}`;
  let id = prefix;
  let suffix = 1;
  const used = new Set(map.relationships.map((relationship) => relationship.id));
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
    if (!root || !target || root.type !== 'NODE' || target.type !== 'NODE')
      invalidMessage = 'Drop on a node or goal.';
    else if (reachable(input.baseMap, root.id).has(target.id))
      invalidMessage = 'This would create a circular path.';
    else {
      const removedId = root.attachment;
      const relationships = input.baseMap.relationships.filter(
        (relationship) => relationship.id !== removedId,
      );
      const existing = relationships.find(
        (relationship) =>
          relationship.type === 'PATH' &&
          relationship.sourceId === target.id &&
          relationship.targetId === root.id,
      );
      const added = existing
        ? undefined
        : {
            id: deterministicRelationshipId(
              { ...input.baseMap, relationships },
              target.id,
              root.id,
            ),
            sourceId: target.id,
            targetId: root.id,
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
  const previewMap = collisionFreeTranslation(
    invalidMessage ? input.baseMap : semanticMap,
    input.movingIds,
    input.dragDelta,
  );
  return {
    previewMap,
    valid: !invalidMessage,
    message: invalidMessage,
    relationshipChange,
    affectedObjectIds,
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
export function seedLayout(o: CanvasObject) {
  const available = Math.max(96, o.width - 44);
  const items = o.seeds.map((seed, index) => {
    const random = (salt: number) =>
      deterministicUnit([
        seed.visualSeed,
        o.shuffle,
        o.width,
        o.height,
        index,
        salt,
      ]);
    const idealWidth = Math.max(85, seed.text.length * 7.7 + 25);
    const width = Math.min(
      available - 18,
      idealWidth * (0.88 + random(1) * 0.12),
    );
    const charactersPerLine = Math.max(1, Math.floor((width - 24) / 9));
    const height = Math.max(
      38,
      Math.ceil(seed.text.length / charactersPerLine) * 20 + 18,
    );
    const readableScale = height > 86 ? 0.16 : height > 64 ? 0.42 : 1;
    const direction = random(2) < 0.5 ? -1 : 1;
    const rotation = Math.max(
      -35,
      Math.min(35, direction * (5 + random(3) * 10) * readableScale),
    );
    const radians = (Math.abs(rotation) * Math.PI) / 180;
    const boundsWidth =
      Math.abs(Math.cos(radians)) * width + Math.sin(radians) * height;
    const boundsHeight =
      Math.sin(radians) * width + Math.abs(Math.cos(radians)) * height;
    return {
      seed,
      width,
      height,
      rotation,
      boundsWidth,
      boundsHeight,
      gap: 9 + random(4) * 13,
      rowOffset: random(5) * 18,
      rowGap: 11 + random(6) * 12,
    };
  });
  const rows: (typeof items)[] = [];
  let row: typeof items = [];
  let rowWidth = 0;
  for (const item of items) {
    const required = item.boundsWidth + (row.length ? row.at(-1)!.gap : 0);
    if (row.length && rowWidth + required > available) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(item);
    rowWidth += item.boundsWidth + (row.length > 1 ? row.at(-2)!.gap : 0);
  }
  if (row.length) rows.push(row);

  const positions: Array<{
    seed: Seed;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }> = [];
  let y = 8;
  for (const currentRow of rows) {
    const height = Math.max(...currentRow.map((item) => item.boundsHeight));
    const contentWidth = currentRow.reduce(
      (total, item, index) =>
        total + item.boundsWidth + (index ? currentRow[index - 1].gap : 0),
      0,
    );
    let x = Math.min(
      currentRow[0].rowOffset,
      Math.max(0, available - contentWidth),
    );
    for (const item of currentRow) {
      const boundsY = y + height - item.boundsHeight;
      positions.push({
        seed: item.seed,
        x: x + (item.boundsWidth - item.width) / 2,
        y: boundsY + (item.boundsHeight - item.height) / 2,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
      });
      x += item.boundsWidth + item.gap;
    }
    y += height + currentRow[0].rowGap;
  }
  return {
    positions,
    height: rows.length ? y - rows.at(-1)![0].rowGap + 8 : 16,
  };
}
export function addSeed(map: VisionMap, id: string, text: string): VisionMap {
  const o = map.objects.find((o) => o.id === id);
  if (!o || o.type !== 'SEED_BOX') throw new Error('Select a Seed Box.');
  if (!text.trim()) return map;
  if (o.seeds.length >= 20)
    throw new Error('Maximum 20 seeds in this Seed Box.');
  const seeds = [
    ...o.seeds,
    { id: uid(), text: text.trim(), visualSeed: Math.random() },
  ];
  const tier = seedCapacity(seeds.length);
  return patchObject(map, id, {
    seeds,
    tier,
    height: Math.max(o.height, 132 + seedLayout({ ...o, seeds }).height),
    shuffle: nextVisualShuffle(o.shuffle),
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
    if (target.seeds.length >= 20)
      throw new Error('Maximum 20 seeds in this Seed Box.');
    const seeds = [...target.seeds, seed];
    next = patchObject(next, target.id, {
      seeds,
      tier: seedCapacity(seeds.length),
      height: Math.max(target.height, 132 + seedLayout({ ...target, seeds }).height),
    });
    return { map: next, id: target.id };
  }
  if (target && target.type !== 'NODE')
    throw new Error('Drop on the canvas, a node, or another Seed Box.');
  const node = freePosition(next, makeObject('NODE', p, 'NORMAL', seed.text));
  next = { ...next, objects: [...next.objects, node] };
  if (target)
    next =
      target.role === 'GOAL'
        ? connect(next, node.id, target.id)
        : connect(next, target.id, node.id);
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

export function validateMap(input: unknown): VisionMap {
  const m = input as VisionMap;
  if (
    !m ||
    m.version !== 1 ||
    typeof m.title !== 'string' ||
    typeof m.anchorId !== 'string' ||
    !Array.isArray(m.objects) ||
    !Array.isArray(m.relationships)
  )
    throw new Error('Choose a valid SPREAD map.');
  const ids = new Set<string>(),
    seedIds = new Set<string>(),
    edgeIds = new Set<string>();
  for (const o of m.objects) {
    if (
      !o ||
      typeof o.id !== 'string' ||
      !o.id ||
      ids.has(o.id) ||
      !['NODE', 'SEED_BOX', 'IMAGINATION'].includes(o.type) ||
      !['NORMAL', 'GOAL'].includes(o.role) ||
      typeof o.text !== 'string' ||
      typeof o.note !== 'string' ||
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
      (o.type !== 'SEED_BOX' && o.seeds.length) ||
      (o.type !== 'NODE' && o.role !== 'NORMAL')
    )
      throw new Error('This map violates object content rules.');
    if (![5, 10, 20, 30].includes(o.tier) || o.seeds.length > 20)
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
          e.id === o.attachment && e.targetId === o.id && e.type === 'PATH',
      )
    )
      throw new Error('This map contains an invalid branch attachment.');
  if (m.anchorId && !ids.has(m.anchorId))
    throw new Error('This map is missing its spatial anchor.');
  return m;
}
