import {
  carriesPath,
  connectChild,
  edgePath,
  objectHeight,
  removeEdge,
} from './graph.ts';
import type { CanvasObject, Point, VisionMap } from './graph.ts';

export type LayoutMode = 'canvas' | 'graph';
export type LayoutSide = 'left' | 'right';

/** Uniform gap between two neighbouring columns, so every rank lines up. */
export const columnGap = 132;
/** Vertical gap between two leaf siblings. */
export const siblingGap = 28;
/** Wider gap when a neighbouring sibling fans out into children of its own. */
export const branchGap = 64;
/** Vertical gap between two components that share no connection. */
export const componentGap = 160;

export type LayoutNode = {
  id: string;
  parentId: string | null;
  children: string[];
  /** 0 for the root of its component; each connection step adds one. */
  depth: number;
  /** Which way the branch fans out from the component root. */
  side: LayoutSide;
};
export type LayoutTree = {
  rootId: string;
  nodes: Map<string, LayoutNode>;
  /** Component root first, then every descendant in breadth-first order. */
  order: string[];
};

function adjacency(map: VisionMap) {
  const links = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    const current = links.get(a);
    if (current) current.add(b);
    else links.set(a, new Set([b]));
  };
  const ids = new Set(map.objects.map((o) => o.id));
  for (const edge of map.relationships) {
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) continue;
    add(edge.sourceId, edge.targetId);
    add(edge.targetId, edge.sourceId);
  }
  return links;
}

/**
 * Reading order for children of the same parent. Vertical position is the
 * ordering key, which is what lets a drop above or below a sibling reorder the
 * branch without storing an extra index on every object.
 */
function byReadingOrder(a: CanvasObject, b: CanvasObject) {
  const top = a.y - b.y;
  if (Math.abs(top) > 0.5) return top;
  const left = a.x - b.x;
  if (Math.abs(left) > 0.5) return left;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Breadth-first hierarchy rooted at `rootId`. Connections are read as
 * undirected because a PATH can be authored in either direction; a Seed Box or
 * an Imagination is always a leaf so it never adopts the node it hangs off.
 */
function buildTree(
  map: VisionMap,
  rootId: string,
  index: Map<string, CanvasObject>,
  links: Map<string, Set<string>>,
  claimed: Set<string>,
): LayoutTree {
  const nodes = new Map<string, LayoutNode>();
  const order: string[] = [];
  const root: LayoutNode = {
    id: rootId,
    parentId: null,
    children: [],
    depth: 0,
    side: 'right',
  };
  nodes.set(rootId, root);
  order.push(rootId);
  claimed.add(rootId);
  for (let cursor = 0; cursor < order.length; cursor++) {
    const currentId = order[cursor];
    const current = index.get(currentId)!;
    // The component root always fans out, whatever it is; deeper down, a Seed
    // Box or an Imagination is a leaf so it never adopts the node it hangs off.
    if (cursor > 0 && !carriesPath(current)) continue;
    const neighbours = [...(links.get(currentId) || [])]
      .filter((id) => !claimed.has(id))
      .map((id) => index.get(id)!)
      .sort(byReadingOrder);
    const parent = nodes.get(currentId)!;
    for (const neighbour of neighbours) {
      claimed.add(neighbour.id);
      nodes.set(neighbour.id, {
        id: neighbour.id,
        parentId: currentId,
        children: [],
        depth: parent.depth + 1,
        side: parent.side,
      });
      parent.children.push(neighbour.id);
      order.push(neighbour.id);
    }
  }
  return { rootId, nodes, order };
}

function subtreeIds(tree: LayoutTree, id: string) {
  const found = [id];
  for (let cursor = 0; cursor < found.length; cursor++)
    for (const child of tree.nodes.get(found[cursor])!.children)
      found.push(child);
  return found;
}

/**
 * A side of the root may hold at most this many more branches than the other
 * before the layout steps in. Below that, a branch stays wherever it was
 * dragged, so two or three branches can all sit on one side.
 */
export const sideImbalanceLimit = 3;

/**
 * Keeps a branch on the side of the root it already occupies, judged by where
 * the whole subtree sits rather than by its first card alone. Only when one
 * side outgrows the other by more than `sideImbalanceLimit` branches does the
 * layout send branches across, newest first, until the two sides are within
 * the limit again.
 */
function assignSides(
  tree: LayoutTree,
  index: Map<string, CanvasObject>,
): void {
  const root = index.get(tree.rootId)!;
  const rootCenter = root.x + root.width / 2;
  const branches = tree.nodes.get(tree.rootId)!.children.map((id) => {
    const ids = subtreeIds(tree, id);
    const centroid =
      ids.reduce((total, member) => {
        const o = index.get(member)!;
        return total + o.x + o.width / 2;
      }, 0) / ids.length;
    const side: LayoutSide = centroid < rootCenter ? 'left' : 'right';
    return { id, ids, side };
  });
  for (;;) {
    const left = branches.filter((branch) => branch.side === 'left');
    const right = branches.filter((branch) => branch.side === 'right');
    if (Math.abs(left.length - right.length) <= sideImbalanceLimit) break;
    const heavy = left.length > right.length ? left : right;
    // Branches are in reading order, so the last one is the most recently
    // added: that is the one that crosses over, not a branch settled earlier.
    const mover = heavy[heavy.length - 1];
    mover.side = mover.side === 'left' ? 'right' : 'left';
  }
  for (const branch of branches)
    for (const member of branch.ids)
      tree.nodes.get(member)!.side = branch.side;
}

function hasChildren(tree: LayoutTree, id: string) {
  return tree.nodes.get(id)!.children.length > 0;
}

function gapBetween(tree: LayoutTree, a: string, b: string) {
  return hasChildren(tree, a) || hasChildren(tree, b) ? branchGap : siblingGap;
}

/** Column x for every rank, measured outward from the root on both sides. */
function columnEdges(
  tree: LayoutTree,
  index: Map<string, CanvasObject>,
): Map<string, number> {
  const root = index.get(tree.rootId)!;
  const widths = new Map<string, number>();
  for (const id of tree.order) {
    const node = tree.nodes.get(id)!;
    if (node.depth === 0) continue;
    const key = `${node.side}:${node.depth}`;
    widths.set(key, Math.max(widths.get(key) || 0, index.get(id)!.width));
  }
  const edges = new Map<string, number>();
  for (const side of ['left', 'right'] as const) {
    let edge = side === 'right' ? root.x + root.width : root.x;
    for (let depth = 1; ; depth++) {
      const key = `${side}:${depth}`;
      const width = widths.get(key);
      if (width === undefined) break;
      edge = side === 'right' ? edge + columnGap : edge - columnGap - width;
      edges.set(key, edge);
      if (side === 'right') edge += width;
    }
  }
  return edges;
}

function measure(
  tree: LayoutTree,
  index: Map<string, CanvasObject>,
  heights: Map<string, number>,
  id: string,
): number {
  const cached = heights.get(id);
  if (cached !== undefined) return cached;
  const node = tree.nodes.get(id)!;
  const own = objectHeight(index.get(id)!);
  let block = 0;
  node.children.forEach((child, position) => {
    if (position > 0)
      block += gapBetween(tree, node.children[position - 1], child);
    block += measure(tree, index, heights, child);
  });
  const total = Math.max(own, block);
  heights.set(id, total);
  return total;
}

function blockHeight(
  tree: LayoutTree,
  index: Map<string, CanvasObject>,
  heights: Map<string, number>,
  ids: readonly string[],
) {
  let total = 0;
  ids.forEach((id, position) => {
    if (position > 0) total += gapBetween(tree, ids[position - 1], id);
    total += measure(tree, index, heights, id);
  });
  return total;
}

/**
 * Places one component. The component root keeps the position it already has,
 * so sorting a branch never drags the whole map out from under the viewport.
 */
function layoutTree(
  tree: LayoutTree,
  index: Map<string, CanvasObject>,
): Map<string, { x: number; y: number }> {
  const placed = new Map<string, { x: number; y: number }>();
  const root = index.get(tree.rootId)!;
  const heights = new Map<string, number>();
  const edges = columnEdges(tree, index);
  placed.set(tree.rootId, { x: root.x, y: root.y });
  const place = (id: string, top: number) => {
    const node = tree.nodes.get(id)!;
    const o = index.get(id)!;
    const total = measure(tree, index, heights, id);
    if (node.depth > 0)
      placed.set(id, {
        x: edges.get(`${node.side}:${node.depth}`)!,
        y: top + (total - objectHeight(o)) / 2,
      });
    let cursor =
      top + (total - blockHeight(tree, index, heights, node.children)) / 2;
    node.children.forEach((child, position) => {
      if (position > 0)
        cursor += gapBetween(tree, node.children[position - 1], child);
      place(child, cursor);
      cursor += measure(tree, index, heights, child);
    });
  };
  const center = root.y + objectHeight(root) / 2;
  for (const side of ['left', 'right'] as const) {
    const branches = tree.nodes
      .get(tree.rootId)!
      .children.filter((id) => tree.nodes.get(id)!.side === side);
    if (!branches.length) continue;
    let cursor = center - blockHeight(tree, index, heights, branches) / 2;
    branches.forEach((id, position) => {
      if (position > 0) cursor += gapBetween(tree, branches[position - 1], id);
      place(id, cursor);
      cursor += measure(tree, index, heights, id);
    });
  }
  return placed;
}

function boundsOf(
  ids: readonly string[],
  index: Map<string, CanvasObject>,
  placed: Map<string, { x: number; y: number }>,
) {
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (const id of ids) {
    const o = index.get(id)!;
    const at = placed.get(id)!;
    left = Math.min(left, at.x);
    right = Math.max(right, at.x + o.width);
    top = Math.min(top, at.y);
    bottom = Math.max(bottom, at.y + objectHeight(o));
  }
  return { left, right, top, bottom };
}

/**
 * Picks the object a component fans out from: the map anchor when it belongs
 * here, otherwise the best connected node, with the topmost card breaking ties.
 */
function componentRoot(
  members: readonly CanvasObject[],
  anchorId: string,
  links: Map<string, Set<string>>,
) {
  const anchor = members.find((o) => o.id === anchorId);
  if (anchor) return anchor.id;
  const nodes = members.filter((o) => o.type === 'NODE');
  const candidates = (nodes.length ? nodes : [...members]).sort((a, b) => {
    const degree =
      (links.get(b.id)?.size || 0) - (links.get(a.id)?.size || 0);
    if (degree) return degree;
    if (a.role !== b.role) return a.role === 'GOAL' ? -1 : 1;
    return byReadingOrder(a, b);
  });
  return candidates[0].id;
}

/**
 * Re-flows the map into ranked columns: same-depth objects share a column on
 * their side of the centre, and each branch keeps the reading order its cards
 * are already in. Positions are the only thing that changes, and running it on
 * an already-sorted map returns that same map, so it is safe to apply to every
 * commit while graph mode is on.
 */
/**
 * One tree per connected component, anchored component first. Both the layout
 * and the drop rules read the graph through this, so "one level down" always
 * means the same thing on screen and under the pointer.
 */
function buildForest(map: VisionMap) {
  const index = new Map(map.objects.map((o) => [o.id, o]));
  const links = adjacency(map);
  const claimed = new Set<string>();
  const trees: LayoutTree[] = [];
  const seeds = [
    ...(index.has(map.anchorId) ? [index.get(map.anchorId)!] : []),
    ...[...map.objects].sort(byReadingOrder),
  ];
  for (const seed of seeds) {
    if (claimed.has(seed.id)) continue;
    const rootId = componentRoot(
      componentMembers(seed.id, index, links),
      map.anchorId,
      links,
    );
    if (claimed.has(rootId)) continue;
    const tree = buildTree(map, rootId, index, links, claimed);
    assignSides(tree, index);
    trees.push(tree);
  }
  return { index, trees };
}

export function autoLayout(map: VisionMap): VisionMap {
  if (map.objects.length < 2) return map;
  // A folded branch takes no room and keeps the positions it had, so expanding
  // it again lands it back where the re-flow puts it.
  const source = visibleMap(map);
  if (source.objects.length < 2) return map;
  const { index, trees } = buildForest(source);
  const placed = new Map<string, { x: number; y: number }>();
  let nextTop: number | null = null;
  let alignLeft = 0;
  for (const tree of trees) {
    const local = layoutTree(tree, index);
    const bounds = boundsOf(tree.order, index, local);
    if (nextTop === null) {
      nextTop = bounds.bottom + componentGap;
      alignLeft = bounds.left;
      for (const [id, at] of local) placed.set(id, at);
    } else {
      // Detached components stack below the anchored one instead of landing on
      // top of it; they keep their own internal shape.
      const shiftX = alignLeft - bounds.left;
      const shiftY: number = nextTop - bounds.top;
      for (const [id, at] of local)
        placed.set(id, { x: at.x + shiftX, y: at.y + shiftY });
      nextTop = bounds.bottom + shiftY + componentGap;
    }
  }
  let changed = false;
  const objects = map.objects.map((o) => {
    const at = placed.get(o.id);
    if (!at || (at.x === o.x && at.y === o.y)) return o;
    changed = true;
    return { ...o, x: at.x, y: at.y };
  });
  return changed ? { ...map, objects } : map;
}

function componentMembers(
  seedId: string,
  index: Map<string, CanvasObject>,
  links: Map<string, Set<string>>,
) {
  const found = [seedId];
  const seen = new Set(found);
  for (let cursor = 0; cursor < found.length; cursor++)
    for (const next of links.get(found[cursor]) || [])
      if (!seen.has(next) && index.has(next)) {
        seen.add(next);
        found.push(next);
      }
  return found.map((id) => index.get(id)!);
}

/**
 * Whether two maps describe the same board. Graph mode re-flows every commit,
 * so a drag that lands back on the frame it started from produces a fresh map
 * holding identical values; comparing them keeps that out of the undo history.
 */
function sameCrops(a: CanvasObject['crops'], b: CanvasObject['crops']) {
  if (a === b) return true;
  const left = Object.entries(a || {});
  const right = b || {};
  return (
    left.length === Object.keys(right).length &&
    left.every(([id, crop]) => {
      const other = right[id];
      return (
        !!other &&
        other.x === crop.x &&
        other.y === crop.y &&
        other.scale === crop.scale
      );
    })
  );
}
export function sameMap(a: VisionMap, b: VisionMap): boolean {
  if (a === b) return true;
  if (
    a.title !== b.title ||
    a.anchorId !== b.anchorId ||
    a.pathDirection !== b.pathDirection ||
    a.objects.length !== b.objects.length ||
    a.relationships.length !== b.relationships.length
  )
    return false;
  for (let index = 0; index < a.objects.length; index++) {
    const left = a.objects[index];
    const right = b.objects[index];
    if (left === right) continue;
    if (
      left.id !== right.id ||
      left.x !== right.x ||
      left.y !== right.y ||
      left.width !== right.width ||
      left.height !== right.height ||
      left.text !== right.text ||
      left.note !== right.note ||
      left.role !== right.role ||
      left.type !== right.type ||
      left.shuffle !== right.shuffle ||
      left.focal !== right.focal ||
      left.focalX !== right.focalX ||
      !sameCrops(left.crops, right.crops) ||
      left.tier !== right.tier ||
      left.attachment !== right.attachment ||
      left.mapRef !== right.mapRef ||
      left.collapsed !== right.collapsed ||
      left.updatedAt !== right.updatedAt ||
      left.displayNote !== right.displayNote ||
      left.displayTitle !== right.displayTitle ||
      left.manualHeight !== right.manualHeight ||
      left.imaginationPreset !== right.imaginationPreset ||
      left.imaginationLayout !== right.imaginationLayout ||
      left.images.length !== right.images.length ||
      left.images.some((id, at) => id !== right.images[at]) ||
      left.seeds.length !== right.seeds.length ||
      left.seeds.some(
        (seed, at) =>
          seed.id !== right.seeds[at].id ||
          seed.text !== right.seeds[at].text ||
          seed.visualSeed !== right.seeds[at].visualSeed,
      )
    )
      return false;
  }
  for (let index = 0; index < a.relationships.length; index++) {
    const left = a.relationships[index];
    const right = b.relationships[index];
    if (left === right) continue;
    if (
      left.id !== right.id ||
      left.sourceId !== right.sourceId ||
      left.targetId !== right.targetId ||
      left.type !== right.type
    )
      return false;
  }
  return true;
}

/** Parent and children of every object, as the ranked layout reads them. */
export type GraphHierarchy = {
  parentOf: Map<string, string | null>;
  childrenOf: Map<string, readonly string[]>;
  /** Which way the branch fans out, so a fold control faces the same way. */
  sideOf: Map<string, LayoutSide>;
};
export function graphHierarchy(map: VisionMap): GraphHierarchy {
  const parentOf = new Map<string, string | null>();
  const childrenOf = new Map<string, readonly string[]>();
  const sideOf = new Map<string, LayoutSide>();
  for (const tree of buildForest(map).trees)
    for (const id of tree.order) {
      const node = tree.nodes.get(id)!;
      parentOf.set(id, node.parentId);
      childrenOf.set(id, node.children);
      sideOf.set(id, node.side);
    }
  return { parentOf, childrenOf, sideOf };
}

/**
 * Everything folded out of sight: the whole branch under each collapsed
 * object, the object itself excepted. A collapsed object inside another
 * collapsed branch needs no special case, since it is hidden either way.
 */
export function hiddenObjects(
  map: VisionMap,
  hierarchy = graphHierarchy(map),
): Set<string> {
  const hidden = new Set<string>();
  for (const o of map.objects) {
    if (!o.collapsed) continue;
    for (const id of graphSubtree(hierarchy, o.id))
      if (id !== o.id) hidden.add(id);
  }
  return hidden;
}

/** The map without its folded branches, which is what gets drawn and ranked. */
export function visibleMap(
  map: VisionMap,
  hidden = hiddenObjects(map),
): VisionMap {
  if (!hidden.size) return map;
  return {
    ...map,
    objects: map.objects.filter((o) => !hidden.has(o.id)),
    relationships: map.relationships.filter(
      (e) => !hidden.has(e.sourceId) && !hidden.has(e.targetId),
    ),
  };
}

/** `id` plus everything hanging off it. */
export function graphSubtree(
  hierarchy: GraphHierarchy,
  id: string,
): Set<string> {
  const found = [id];
  for (let cursor = 0; cursor < found.length; cursor++)
    for (const child of hierarchy.childrenOf.get(found[cursor]) || [])
      found.push(child);
  return new Set(found);
}

/**
 * What a drop at `point` means. Landing on a card makes the dragged node its
 * child; landing in the band just above or below a card makes it that card's
 * sibling, on the side the pointer came from.
 */
export type GraphDropIntent =
  | { kind: 'child'; parentId: string }
  | {
      kind: 'sibling';
      referenceId: string;
      parentId: string;
      /** Above the reference rather than below it. */
      before: boolean;
    };

/** How far above or below a card still reads as "beside this one". */
export const siblingBand = 56;
/** How far past a card's left and right edge that band still applies. */
const siblingReach = 28;

export function graphDropIntent(
  map: VisionMap,
  draggedId: string,
  point: Point,
  hierarchy = graphHierarchy(map),
): GraphDropIntent | undefined {
  const dragged = map.objects.find((o) => o.id === draggedId);
  if (!dragged || !carriesPath(dragged)) return undefined;
  // Dropping onto its own branch would fold the branch into itself, and a card
  // that is folded out of sight cannot be aimed at.
  const blocked = graphSubtree(hierarchy, draggedId);
  const folded = hiddenObjects(map, hierarchy);
  const droppable = (o: CanvasObject) =>
    carriesPath(o) && !blocked.has(o.id) && !folded.has(o.id);
  for (const o of [...map.objects].reverse()) {
    if (!droppable(o)) continue;
    if (
      point.x >= o.x &&
      point.x <= o.x + o.width &&
      point.y >= o.y &&
      point.y <= o.y + objectHeight(o)
    )
      return { kind: 'child', parentId: o.id };
  }
  let closest: { intent: GraphDropIntent; distance: number } | undefined;
  for (const o of map.objects) {
    if (!droppable(o)) continue;
    const parentId = hierarchy.parentOf.get(o.id);
    // A component root has no rank to share, so nothing can be its sibling.
    if (!parentId || blocked.has(parentId)) continue;
    if (point.x < o.x - siblingReach || point.x > o.x + o.width + siblingReach)
      continue;
    const above = o.y - point.y;
    const below = point.y - (o.y + objectHeight(o));
    const before = above >= below;
    const distance = before ? above : below;
    if (distance < 0 || distance > siblingBand) continue;
    if (!closest || distance < closest.distance)
      closest = {
        intent: { kind: 'sibling', referenceId: o.id, parentId, before },
        distance,
      };
  }
  return closest?.intent;
}

/** The PATH connection that currently ranks `id` under its parent. */
export function graphParentEdge(
  map: VisionMap,
  hierarchy: GraphHierarchy,
  id: string,
): string | undefined {
  const parentId = hierarchy.parentOf.get(id);
  if (!parentId) return undefined;
  return pathBetween(map, parentId, id)?.id;
}

function pathBetween(map: VisionMap, a: string, b: string) {
  return map.relationships.find(
    (edge) =>
      edge.type === 'PATH' &&
      ((edge.sourceId === a && edge.targetId === b) ||
        (edge.sourceId === b && edge.targetId === a)),
  );
}

/**
 * Moves a dragged node under the parent its drop named. The connection that
 * ranked it before is removed, otherwise the old parent would still reach it
 * first and the node would never actually change level.
 */
export function applyGraphDrop(
  map: VisionMap,
  draggedId: string,
  intent?: GraphDropIntent,
  hierarchy = graphHierarchy(map),
): { map: VisionMap; error?: string } {
  if (!intent) return { map };
  const { parentId } = intent;
  if (parentId === draggedId || hierarchy.parentOf.get(draggedId) === parentId)
    return { map };
  const ranking = graphParentEdge(map, hierarchy, draggedId);
  const detached = ranking ? removeEdge(map, ranking) : map;
  // Already connected the other way round: that connection now ranks it.
  if (pathBetween(detached, parentId, draggedId)) return { map: detached };
  try {
    return { map: connectChild(detached, parentId, draggedId) };
  } catch (error) {
    return { map, error: (error as Error).message };
  }
}

/**
 * Ranks a dragged node next to the sibling it was dropped beside. The card
 * itself stays under the pointer; only the vertical key the re-flow sorts on
 * is rewritten, which is what puts it above or below that sibling.
 */
export function graphDropOrder(
  previewMap: VisionMap,
  draggedId: string,
  intent?: GraphDropIntent,
): VisionMap {
  if (intent?.kind !== 'sibling') return previewMap;
  const reference = previewMap.objects.find(
    (o) => o.id === intent.referenceId,
  );
  if (!reference) return previewMap;
  const y = intent.before ? reference.y - 1 : reference.y + 1;
  return {
    ...previewMap,
    objects: previewMap.objects.map((o) =>
      o.id === draggedId ? { ...o, y } : o,
    ),
  };
}

export type GraphSnapFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type GraphSnapPlan = {
  /** The slot each dragged object will occupy. */
  frames: GraphSnapFrame[];
  /** Connections that touch a dragged object, drawn where they will settle. */
  edges: { id: string; path: string }[];
};

/**
 * Where a dragged object would land once the graph re-flows, and how its
 * connections will run once it is there. Drawn behind the cards while they are
 * still following the pointer, so the drop is visible before it happens.
 */
export function graphSnapPlan(
  previewMap: VisionMap,
  movingIds: ReadonlySet<string>,
): GraphSnapPlan {
  if (!movingIds.size) return { frames: [], edges: [] };
  const settled = autoLayout(previewMap);
  const index = new Map(settled.objects.map((o) => [o.id, o]));
  const frames: GraphSnapFrame[] = [];
  for (const id of movingIds) {
    const o = index.get(id);
    if (o)
      frames.push({
        id,
        x: o.x,
        y: o.y,
        width: o.width,
        height: objectHeight(o),
      });
  }
  const edges: GraphSnapPlan['edges'] = [];
  for (const edge of settled.relationships) {
    if (!movingIds.has(edge.sourceId) && !movingIds.has(edge.targetId))
      continue;
    const a = index.get(edge.sourceId);
    const b = index.get(edge.targetId);
    if (a && b) edges.push({ id: edge.id, path: edgePath(a, b) });
  }
  return { frames, edges };
}
