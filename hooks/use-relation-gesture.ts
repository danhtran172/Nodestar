'use client';
/* oxlint-disable react/react-compiler -- Pointer capture owns a synchronous transaction independent of canvas movement. */
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { carriesPath } from '@/lib/graph';
import type { CanvasObject, Point, VisionMap } from '@/lib/graph';
import {
  finishRelation,
  relationGesture,
  relationSide,
} from '@/lib/relation-gesture';
import type { RelationGesture, RelationSide } from '@/lib/relation-gesture';

type RelationSuccess = {
  sourceId: string;
  targetId: string;
};

type Options = {
  root: RefObject<HTMLDivElement | null>;
  map: VisionMap;
  selected: ReadonlySet<string>;
  viewport: Point & { zoom: number };
  enabled: boolean;
  onCommit: (map: VisionMap) => void;
  /** A press on the handle that never became a drag: a click on its node. */
  onTap?: (sourceId: string, e: PointerEvent) => void;
};

/** How far the pointer travels from the handle before a press is a drag. */
const dragThreshold = 4;

export function useRelationGesture(options: Options) {
  const [state, setState] = useState<RelationGesture>({ phase: 'idle' });
  const [success, setSuccess] = useState<RelationSuccess | null>(null);
  const current = useRef(state),
    latest = useRef(options);
  const successTimer = useRef<number | null>(null);
  const capture = useRef<{
    element: HTMLButtonElement;
    pointerId: number;
  } | null>(null);
  // A press on the handle waits here until it moves far enough to be a drag.
  const pending = useRef<{
    sourceId: string;
    side: RelationSide;
    x: number;
    y: number;
  } | null>(null);
  latest.current = options;
  function update(next: RelationGesture) {
    current.current = next;
    setState(next);
  }
  function release() {
    const held = capture.current;
    capture.current = null;
    pending.current = null;
    if (held?.element.hasPointerCapture(held.pointerId))
      held.element.releasePointerCapture(held.pointerId);
  }
  function cancel() {
    update(
      relationGesture(current.current, { type: 'cancel' }, latest.current.map),
    );
    release();
  }
  function celebrate(sourceId: string, targetId: string) {
    if (successTimer.current) window.clearTimeout(successTimer.current);
    setSuccess({ sourceId, targetId });
    successTimer.current = window.setTimeout(() => {
      successTimer.current = null;
      setSuccess(null);
    }, 560);
  }
  function world(clientX: number, clientY: number) {
    const { root, viewport: v } = latest.current;
    const rect = root.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - v.x) / v.zoom,
      y: (clientY - rect.top - v.y) / v.zoom,
    };
  }
  function targetAt(e: PointerEvent) {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    if (
      !hit ||
      !latest.current.root.current?.contains(hit) ||
      hit.closest('[data-ui],[data-canvas-overlay]')
    )
      return { candidateId: null, targetId: null };
    const object = hit.closest<HTMLElement>('[data-object]');
    const rect = object?.getBoundingClientRect();
    // Outside affordances are not part of the drop surface; card content is.
    return rect &&
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
      ? (() => {
          const candidateId = object!.dataset.object || null;
          const target = latest.current.map.objects.find(
            (item) => item.id === candidateId,
          );
          if (!candidateId || !target || !carriesPath(target))
            return { candidateId, targetId: candidateId };
          const radius = Math.max(12, 19 * latest.current.viewport.zoom);
          const atCenter =
            Math.hypot(
              e.clientX - (rect.left + rect.width / 2),
              e.clientY - (rect.top + rect.height / 2),
            ) <= radius;
          return { candidateId, targetId: atCenter ? candidateId : null };
        })()
      : { candidateId: null, targetId: null };
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (capture.current?.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const press = pending.current;
      if (press) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < dragThreshold)
          return;
        pending.current = null;
        const hovered = relationGesture(
          current.current,
          { type: 'hover', sourceId: press.sourceId, side: press.side },
          latest.current.map,
        );
        const started = relationGesture(
          hovered,
          { type: 'start', pointer: world(press.x, press.y) },
          latest.current.map,
        );
        if (started.phase !== 'dragging') {
          release();
          return;
        }
        update(started);
      }
      const next = relationGesture(
        current.current,
        {
          type: 'target',
          ...targetAt(e),
          pointer: world(e.clientX, e.clientY),
        },
        latest.current.map,
      );
      update(next);
      if (next.phase !== 'dragging') release();
    };
    const up = (e: PointerEvent) => {
      if (capture.current?.pointerId !== e.pointerId) return;
      const press = pending.current;
      if (press) {
        // Released where it was pressed: that was a click on the node.
        e.stopImmediatePropagation();
        release();
        latest.current.onTap?.(press.sourceId, e);
        return;
      }
      move(e);
      const beforeCommit = current.current;
      const result = finishRelation(latest.current.map, current.current);
      update(result.state);
      release();
      if (result.map !== latest.current.map) {
        if (beforeCommit.phase === 'dragging' && beforeCommit.targetId)
          celebrate(beforeCommit.sourceId, beforeCommit.targetId);
        latest.current.onCommit(result.map);
      }
    };
    const pointerCancel = (e: PointerEvent) => {
      if (capture.current?.pointerId !== e.pointerId) return;
      e.stopImmediatePropagation();
      if (pending.current) release();
      else cancel();
    };
    const key = (e: KeyboardEvent) => {
      if (current.current.phase !== 'dragging') return;
      // A relation owns keyboard input until release; Escape must not clear selection.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') cancel();
    };
    const blur = () => {
      if (current.current.phase === 'dragging') cancel();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', pointerCancel, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', pointerCancel, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
      current.current = { phase: 'idle' };
      release();
      if (successTimer.current) window.clearTimeout(successTimer.current);
    };
  }, []);
  useEffect(() => {
    if (current.current.phase !== 'dragging') return;
    const next = relationGesture(
      current.current,
      { type: 'reconcile' },
      options.map,
    );
    update(next);
    if (!options.enabled || next.phase !== 'dragging') cancel();
  }, [options.map, options.enabled]);

  const selectedSource = [...options.selected]
    .reverse()
    .find((id) =>
      options.map.objects.some((o) => o.id === id && carriesPath(o)),
    );
  const source =
    state.phase === 'hovering' || state.phase === 'dragging'
      ? { sourceId: state.sourceId, lockedSide: state.lockedSide }
      : selectedSource
        ? { sourceId: selectedSource, lockedSide: 'right' as const }
        : null;
  const dot =
    options.enabled &&
    source &&
    options.map.objects.some(
      (o) => o.id === source.sourceId && carriesPath(o),
    )
      ? source
      : null;
  return {
    state,
    dot,
    success,
    active: () => current.current.phase === 'dragging',
    enter: (o: CanvasObject, e: ReactPointerEvent<HTMLDivElement>) => {
      if (!options.enabled || e.buttons || !carriesPath(o)) return;
      const rect = e.currentTarget.getBoundingClientRect();
      update(
        relationGesture(
          current.current,
          {
            type: 'hover',
            sourceId: o.id,
            side: relationSide(e.clientX, rect.left, rect.width),
          },
          latest.current.map,
        ),
      );
    },
    leave: (id: string) =>
      update(
        relationGesture(
          current.current,
          { type: 'leave', sourceId: id },
          latest.current.map,
        ),
      ),
    start: (
      e: ReactPointerEvent<HTMLButtonElement>,
      sourceId: string,
      side: RelationSide,
    ) => {
      // Any other button belongs to the node underneath, which is where the
      // canvas opens its menu from.
      if (e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      e.stopPropagation();
      if (capture.current || !options.enabled) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      capture.current = { element: e.currentTarget, pointerId: e.pointerId };
      pending.current = { sourceId, side, x: e.clientX, y: e.clientY };
    },
    lostCapture: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (capture.current?.pointerId !== e.pointerId) return;
      if (pending.current) release();
      else cancel();
    },
  };
}
