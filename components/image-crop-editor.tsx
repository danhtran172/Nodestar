'use client';
/* oxlint-disable next/no-img-element -- Assets are device-local, preprocessed thumbnails. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  clampImageCrop,
  defaultImageCrop,
  imageCropStyle,
  maxImageScale,
  panImageCrop,
  zoomImageCrop,
  type ImageCrop,
} from '@/lib/graph';

type Props = {
  src?: string;
  alt: string;
  crop: ImageCrop;
  /** Image width for every unit of height; read from the picture when unknown. */
  aspect?: number;
  className?: string;
  /** Called once a drag ends or the wheel settles, with the crop to store. */
  onCommit: (crop: ImageCrop) => void;
  /** A plain click, with no movement, opens the picture. */
  onOpen?: () => void;
};

/** How far the pointer may travel before a press counts as a drag. */
const dragThreshold = 3;
/** Wheel ticks settle into one stored change after this pause. */
const wheelSettle = 300;
const keyboardPanStep = 5;
const keyboardZoomStep = 1.25;

/**
 * The frame an image is cropped in: drag moves the picture, the wheel zooms
 * it in or out around the pointer, and the keyboard does both (arrows, + and
 * -, 0 to reset). Zoomed in, the picture can only be dragged as far as its
 * edges; zoomed out, only as far as the frame's, so nothing is ever lost.
 */
export function ImageCropEditor(p: Props) {
  const frame = useRef<HTMLButtonElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const [live, setLive] = useState<ImageCrop | null>(null);
  const crop = live || p.crop;
  const cropRef = useRef(crop);
  const commitRef = useRef(p.onCommit);
  const aspectRef = useRef(p.aspect);
  // Handlers attached outside React's render (the wheel listener, the settle
  // timer) read the latest values through these refs.
  useEffect(() => {
    cropRef.current = crop;
    commitRef.current = p.onCommit;
    aspectRef.current = p.aspect;
  });
  const settle = useRef<number | null>(null);
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    dragging: boolean;
  } | null>(null);

  const aspectOf = useCallback(() => {
    const given = aspectRef.current;
    if (given && Number.isFinite(given) && given > 0) return given;
    const img = picture.current;
    return img && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
  }, []);
  const commit = useCallback((next: ImageCrop) => {
    if (settle.current) window.clearTimeout(settle.current);
    settle.current = null;
    setLive(null);
    commitRef.current(next);
  }, []);
  // Wheel zoom must cancel the page scroll, which React's passive wheel
  // listener cannot do, so the listener is attached by hand.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.003);
      const next = zoomImageCrop(
        cropRef.current,
        cropRef.current.scale * factor,
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
        aspectOf(),
      );
      setLive(next);
      if (settle.current) window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => commit(next), wheelSettle);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (settle.current) window.clearTimeout(settle.current);
    };
  }, [aspectOf, commit]);

  function down(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
  }
  function move(e: ReactPointerEvent<HTMLButtonElement>) {
    const held = press.current;
    if (!held || held.id !== e.pointerId) return;
    const dx = e.clientX - held.x;
    const dy = e.clientY - held.y;
    if (!held.dragging && Math.hypot(dx, dy) < dragThreshold) return;
    held.dragging = true;
    held.x = e.clientX;
    held.y = e.clientY;
    const rect = e.currentTarget.getBoundingClientRect();
    setLive(panImageCrop(cropRef.current, dx, dy, rect.width, rect.height, aspectOf()));
  }
  function up(e: ReactPointerEvent<HTMLButtonElement>) {
    const held = press.current;
    if (!held || held.id !== e.pointerId) return;
    press.current = null;
    if (held.dragging) commit(cropRef.current);
    else p.onOpen?.();
  }
  function cancel() {
    press.current = null;
    setLive(null);
  }
  function key(e: KeyboardEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const current = cropRef.current;
    let next: ImageCrop | undefined;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      next = clampImageCrop({
        ...current,
        x: current.x + (e.key === 'ArrowLeft' ? -keyboardPanStep : keyboardPanStep),
      });
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
      next = clampImageCrop({
        ...current,
        y: current.y + (e.key === 'ArrowUp' ? -keyboardPanStep : keyboardPanStep),
      });
    else if (e.key === '+' || e.key === '=' || e.key === '-')
      next = zoomImageCrop(
        current,
        current.scale * (e.key === '-' ? 1 / keyboardZoomStep : keyboardZoomStep),
        rect.width / 2,
        rect.height / 2,
        rect.width,
        rect.height,
        aspectOf(),
      );
    else if (e.key === '0') next = defaultImageCrop;
    else if (e.key === 'Enter') {
      p.onOpen?.();
      return;
    }
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    commit(next);
  }
  const zoom = Math.round(crop.scale * 100) / 100;
  return (
    <button
      ref={frame}
      type="button"
      className={`crop-editor ${p.className || ''}`}
      aria-label="Drag to move the image, scroll to zoom"
      title={`Drag to move · Scroll to zoom (${zoom}×, ${Math.round(crop.x)}% ${Math.round(crop.y)}%)`}
      data-crop={`${Math.round(crop.x)},${Math.round(crop.y)},${zoom}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={key}
    >
      <img
        ref={picture}
        src={p.src}
        alt={p.alt}
        draggable={false}
        style={imageCropStyle(crop)}
      />
      {crop.scale !== 1 && (
        <span className="crop-editor-zoom" aria-hidden="true">
          {zoom}×
        </span>
      )}
      {crop.scale >= maxImageScale && <span className="sr-only">Maximum zoom</span>}
    </button>
  );
}
