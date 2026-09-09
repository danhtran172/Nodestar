'use client';
/* oxlint-disable next/no-img-element -- Assets are device-local, preprocessed thumbnails, with originals used only in the explicit viewer. */
import { useState } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  Image as ImageIcon,
  RotateCw,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import type { CanvasObject } from '@/lib/graph';
import type { Asset } from '@/lib/storage';
type Props = {
  object: CanvasObject | null;
  assets: Record<string, Asset>;
  onClose: () => void;
  onDraft: (id: string, patch: Partial<CanvasObject>) => void;
  onPatch: (id: string, patch: Partial<CanvasObject>) => void;
  onImages: (id: string, replace?: string) => void;
  onRetry: (id: string) => void;
  onSeed: (id: string) => void;
  onConvert: (box: string, seed: string) => void;
  onView: (id: string) => void;
};
export function ObjectDetails(p: Props) {
  const o = p.object;
  const [focal, setFocal] = useState<number | null>(null);
  return (
    <Sheet
      open={!!o}
      modal={false}
      onOpenChange={(open) => {
        if (!open) p.onClose();
      }}
    >
      <SheetContent
        className="detail-panel"
        onKeyDown={(e) => {
          if (
            e.key === 'Escape' &&
            document.activeElement instanceof HTMLTextAreaElement
          )
            document.activeElement.blur();
        }}
      >
        <SheetHeader>
          <SheetTitle>
            {o?.type === 'NODE'
              ? 'A little more detail'
              : o?.type === 'SEED_BOX'
                ? 'Your loose ideas'
                : 'Inside your Imagination'}
          </SheetTitle>
          <SheetDescription>
            {o?.type === 'NODE'
              ? 'Keep the canvas clear. Let the detail live here.'
              : o?.type === 'SEED_BOX'
                ? 'Keep them loose, or let an idea take shape.'
                : 'A collection of things that point you somewhere.'}
          </SheetDescription>
        </SheetHeader>
        {o && (
          <div className="detail-body" key={o.id}>
            <label className="field-label">
              {o.type === 'NODE' ? 'Main text' : 'Title'}
              <textarea
                className="detail-input"
                defaultValue={o.text}
                key={`${o.id}-text-${o.text}`}
                rows={3}
                onChange={(e) => {
                  if (e.target.value.trim())
                    p.onDraft(o.id, { text: e.target.value });
                }}
                onBlur={(e) => {
                  const text = e.target.value.trim();
                  if (text && text !== o.text) p.onPatch(o.id, { text });
                }}
              />
            </label>
            {o.type !== 'SEED_BOX' && (
              <label className="field-label">
                Notes
                <textarea
                  className="detail-input note-input"
                  placeholder="What does this mean to you?"
                  defaultValue={o.note}
                  key={`${o.id}-note-${o.note}`}
                  rows={7}
                  onChange={(e) => p.onDraft(o.id, { note: e.target.value })}
                  onBlur={(e) => {
                    if (e.target.value !== o.note)
                      p.onPatch(o.id, { note: e.target.value });
                  }}
                />
              </label>
            )}
            {o.type === 'NODE' && o.note && (
              <label className="display-note-toggle">
                <input
                  type="checkbox"
                  checked={!!o.displayNote}
                  onChange={(e) => p.onPatch(o.id, { displayNote: e.target.checked })}
                />
                Display note on canvas
              </label>
            )}
            {o.type !== 'IMAGINATION' && <div className="size-fields">
              <label className="field-label">
                Width
                <input
                  aria-label="Object width"
                  type="number"
                  min={o.type === 'NODE' ? 160 : 280}
                  max={o.type === 'NODE' ? 520 : 900}
                  defaultValue={o.width}
                  key={o.width}
                  onBlur={(e) => {
                    const width = Number(e.target.value);
                    if (Number.isFinite(width))
                      p.onPatch(o.id, {
                        width: Math.max(
                          o.type === 'NODE' ? 160 : 280,
                          Math.min(o.type === 'NODE' ? 520 : 900, width),
                        ),
                      });
                  }}
                />
              </label>
              {o.type !== 'NODE' && (
                <label className="field-label">
                  Height
                  <input
                    aria-label="Object height"
                    type="number"
                    min={180}
                    max={2200}
                    defaultValue={o.height}
                    key={o.height}
                    onBlur={(e) => {
                      const height = Number(e.target.value);
                      if (Number.isFinite(height))
                        p.onPatch(o.id, {
                          height: Math.max(
                            o.type === 'SEED_BOX'
                              ? 115 + o.seeds.length * 48
                              : 180,
                            Math.min(2200, height),
                          ),
                        });
                    }}
                  />
                </label>
              )}
            </div>}
            {o.type === 'SEED_BOX' ? (
              <>
                <div className="section-line">
                  <span>Loose ideas</span>
                  <button
                    className="text-action"
                    disabled={o.seeds.length >= 20}
                    onClick={() => p.onSeed(o.id)}
                  >
                    <Plus size={16} /> Add seed
                  </button>
                </div>
                {o.seeds.length === 0 && (
                  <p className="muted">
                    An idea can stay here as long as you like.
                  </p>
                )}
                <div className="seed-list">
                  {o.seeds.map((s) => (
                    <div key={s.id}>
                      <textarea
                        aria-label="Seed text"
                        rows={2}
                        defaultValue={s.text}
                        onBlur={(e) => {
                          if (e.target.value.trim())
                            p.onPatch(o.id, {
                              seeds: o.seeds.map((x) =>
                                x.id === s.id
                                  ? { ...x, text: e.target.value.trim() }
                                  : x,
                              ),
                            });
                        }}
                      />
                      <button
                        title="Turn into node"
                        aria-label={`Turn ${s.text} into a node`}
                        onClick={() => p.onConvert(o.id, s.id)}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                      <button
                        title="Delete seed"
                        aria-label={`Delete ${s.text}`}
                        onClick={() =>
                          p.onPatch(o.id, {
                            seeds: o.seeds.filter((x) => x.id !== s.id),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {o.type === 'IMAGINATION' && (
                  <div className="field-label">
                    Canvas size
                    <select
                      value={o.imaginationPreset || (o.width < 390 ? 'small' : o.width < 560 ? 'medium' : 'large')}
                      onChange={(e) => {
                        const preset = e.target.value as 'small' | 'medium' | 'large';
                        const scale = o.images.length <= 1 ? 1 : o.images.length === 2 ? 1.2 : o.images.length === 3 ? 1.35 : o.images.length === 4 ? 1.5 : o.images.length === 5 ? 1.62 : 1.75;
                        const base = preset === 'small' ? { width: 320, height: 240 } : preset === 'medium' ? { width: 440, height: 300 } : { width: 580, height: 380 };
                        p.onPatch(o.id, { imaginationPreset: preset, width: Math.round(base.width * scale), height: Math.round(base.height * scale) });
                      }}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                )}
                <div className="section-line">
                  <span>
                    {o.type === 'IMAGINATION'
                      ? `Images · ${o.images.length}`
                      : o.role === 'GOAL'
                        ? 'Hero image'
                        : 'Image'}
                  </span>
                  <button
                    className="text-action"
                    onClick={() => p.onImages(o.id)}
                  >
                    <Plus size={16} />
                    {o.type === 'NODE' && o.images.length
                      ? 'Replace'
                      : 'Add image'}
                  </button>
                </div>
                {o.images.length === 0 && (
                  <button
                    className="detail-image-empty"
                    onClick={() => p.onImages(o.id)}
                  >
                    <ImageIcon size={28} />
                    <span>Choose an image, or paste one onto the canvas</span>
                  </button>
                )}
                <div className="asset-list">
                  {o.images.map((id, i) => {
                    const a = p.assets[id];
                    return (
                      <div className="asset-row" key={id}>
                        <button
                          className="asset-preview"
                          onClick={() => p.onView(id)}
                        >
                          <img
                            src={a?.preview}
                            alt={a?.filename || 'Image unavailable'}
                          />
                        </button>
                        <div>
                          <span className="asset-name">
                            {a?.filename || 'Image unavailable'}
                          </span>
                          {a?.status === 'error' && (
                            <button
                              className="text-action error"
                              onClick={() => p.onRetry(id)}
                            >
                              <RotateCw size={13} /> Retry saving
                            </button>
                          )}
                          <div className="asset-actions">
                            {o.type === 'IMAGINATION' && (
                              <>
                                <button
                                  title="Move image earlier"
                                  disabled={i === 0}
                                  onClick={() => {
                                    const images = [...o.images];
                                    [images[i - 1], images[i]] = [
                                      images[i],
                                      images[i - 1],
                                    ];
                                    p.onPatch(o.id, { images });
                                  }}
                                >
                                  <ArrowUp size={15} />
                                </button>
                                <button
                                  title="Move image later"
                                  disabled={i === o.images.length - 1}
                                  onClick={() => {
                                    const images = [...o.images];
                                    [images[i + 1], images[i]] = [
                                      images[i],
                                      images[i + 1],
                                    ];
                                    p.onPatch(o.id, { images });
                                  }}
                                >
                                  <ArrowDown size={15} />
                                </button>
                              </>
                            )}
                            <button
                              title="Replace image"
                              onClick={() => p.onImages(o.id, id)}
                            >
                              <ImageIcon size={15} />
                            </button>
                            <button
                              title="Remove image"
                              onClick={() =>
                                p.onPatch(o.id, {
                                  images: o.images.filter((x) => x !== id),
                                })
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {o.type === 'NODE' && o.images.length > 0 && (
                  <div className="field-label">
                    <span>Image focal area</span>
                    <div className="focal-preview">
                      <img
                        src={p.assets[o.images[0]]?.preview}
                        alt="Crop preview"
                        style={{ objectPosition: `50% ${focal ?? o.focal}%` }}
                      />
                    </div>
                    <Slider
                      aria-label="Image focal area"
                      value={[focal ?? o.focal]}
                      min={0}
                      max={100}
                      onValueChange={(v) =>
                        setFocal(Array.isArray(v) ? v[0] : v)
                      }
                      onValueCommitted={(v) => {
                        p.onPatch(o.id, { focal: Array.isArray(v) ? v[0] : v });
                        setFocal(null);
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
