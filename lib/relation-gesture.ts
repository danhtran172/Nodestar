import {
  carriesPath,
  connect,
  objectHeight,
  relationError,
  relationType,
} from './graph.ts';
import type { CanvasObject, Point, RelationType, VisionMap } from './graph.ts';

export type RelationSide = 'left' | 'right';
/** The object a relation can start from: anything that sits on a path. */
function pathObject(map: VisionMap, id: string) {
  const o = map.objects.find((item) => item.id === id);
  return o && carriesPath(o) ? o : undefined;
}
export type RelationGesture =
  | { phase: 'idle' | 'committed' | 'cancelled' }
  | { phase: 'hovering'; sourceId: string; lockedSide: RelationSide }
  | {
      phase: 'dragging';
      sourceId: string;
      lockedSide: RelationSide;
      pointer: Point;
      candidateId: string | null;
      targetId: string | null;
      relationType: RelationType | null;
      validity: 'empty' | 'valid' | 'invalid';
      error: string | null;
    };
type Event =
  | { type: 'hover'; sourceId: string; side: RelationSide }
  | { type: 'leave'; sourceId: string }
  | { type: 'start'; pointer: Point }
  | {
      type: 'target';
      pointer: Point;
      candidateId: string | null;
      targetId: string | null;
    }
  | {
      type:
        | 'reconcile'
        | 'commit'
        | 'cancel'
        | 'escape'
        | 'pointercancel'
        | 'cleanup';
    };

export function relationSide(
  pointerX: number,
  left: number,
  width: number,
): RelationSide {
  return pointerX < left + width / 2 ? 'left' : 'right';
}

export function relationGesture(
  state: RelationGesture,
  event: Event,
  map: VisionMap,
): RelationGesture {
  if (event.type === 'cleanup') return { phase: 'idle' };
  if (['cancel', 'escape', 'pointercancel'].includes(event.type))
    return { phase: 'cancelled' };
  if (event.type === 'hover') {
    if (
      state.phase === 'dragging' ||
      (state.phase === 'hovering' && state.sourceId === event.sourceId)
    )
      return state;
    if (!pathObject(map, event.sourceId))
      return { phase: 'idle' };
    return {
      phase: 'hovering',
      sourceId: event.sourceId,
      lockedSide: event.side,
    };
  }
  if (event.type === 'leave') {
    return state.phase === 'hovering' && state.sourceId === event.sourceId
      ? { phase: 'idle' }
      : state;
  }
  if (event.type === 'start' && state.phase === 'hovering') {
    if (!pathObject(map, state.sourceId))
      return { phase: 'cancelled' };
    return {
      ...state,
      phase: 'dragging',
      pointer: event.pointer,
      candidateId: null,
      targetId: null,
      relationType: null,
      validity: 'empty',
      error: null,
    };
  }
  if (state.phase !== 'dragging') return state;
  if (
    !pathObject(map, state.sourceId) ||
    (state.targetId && !map.objects.some((o) => o.id === state.targetId))
  )
    return { phase: 'cancelled' };
  if (event.type === 'target' || event.type === 'reconcile') {
    const candidateId =
      event.type === 'target'
        ? event.candidateId
        : state.candidateId &&
            map.objects.some((o) => o.id === state.candidateId)
          ? state.candidateId
          : null;
    const targetId = event.type === 'target' ? event.targetId : state.targetId;
    const source = map.objects.find((o) => o.id === state.sourceId);
    const target = targetId
      ? map.objects.find((o) => o.id === targetId)
      : undefined;
    const nextRelationType =
      source && target ? relationType(source, target) : null;
    const error =
      targetId && nextRelationType
        ? relationError(map, state.sourceId, targetId, nextRelationType)
        : null;
    return {
      ...state,
      pointer: event.type === 'target' ? event.pointer : state.pointer,
      candidateId,
      targetId,
      relationType: nextRelationType,
      validity: targetId ? (error ? 'invalid' : 'valid') : 'empty',
      error,
    };
  }
  if (event.type === 'commit') {
    return {
      phase:
        state.targetId &&
        state.relationType &&
        !relationError(map, state.sourceId, state.targetId, state.relationType)
          ? 'committed'
          : 'cancelled',
    };
  }
  return state;
}

// One graph operation; connection creation never invokes layout or object movement.
export function finishRelation(map: VisionMap, state: RelationGesture) {
  const next = relationGesture(state, { type: 'commit' }, map);
  return {
    state: next,
    map:
      next.phase === 'committed' && state.phase === 'dragging' && state.targetId
        ? connect(
            map,
            state.sourceId,
            state.targetId,
            state.relationType || undefined,
          )
        : map,
  };
}

export function relationPreviewPath(
  source: CanvasObject,
  side: RelationSide,
  pointer: Point,
  target?: CanvasObject,
) {
  // The wire leaves from the connect handle at the centre of the source and
  // sets off toward the pointer; the hovered side only breaks a tie.
  const start = {
    x: source.x + source.width / 2,
    y: source.y + objectHeight(source) / 2,
  };
  const toward = target ? target.x + target.width / 2 : pointer.x;
  const sign =
    toward > start.x ? 1 : toward < start.x ? -1 : side === 'left' ? -1 : 1;
  let end = pointer;
  let targetNormal = { x: -sign, y: 0 };
  if (target) {
    const center = {
      x: target.x + target.width / 2,
      y: target.y + objectHeight(target) / 2,
    };
    const dx = start.x - center.x,
      dy = start.y - center.y;
    if (Math.abs(dx) / target.width >= Math.abs(dy) / objectHeight(target)) {
      targetNormal = { x: Math.sign(dx || -sign), y: 0 };
      end =
        carriesPath(target)
          ? center
          : {
              x: center.x + targetNormal.x * (target.width / 2 + 5),
              y: center.y,
            };
    } else {
      targetNormal = { x: 0, y: Math.sign(dy) };
      end =
        carriesPath(target)
          ? center
          : {
              x: center.x,
              y: center.y + targetNormal.y * (objectHeight(target) / 2 + 5),
            };
    }
  }
  const bend = Math.max(
    45,
    Math.min(180, Math.hypot(end.x - start.x, end.y - start.y) * 0.4),
  );
  return `M${start.x},${start.y} C${start.x + sign * bend},${start.y} ${end.x + targetNormal.x * bend},${end.y + targetNormal.y * bend} ${end.x},${end.y}`;
}
