import type { CanvasObject } from './graph';

type Rect = { id: string; x: number; y: number; width: number; height: number };
// SVG paths here contain one cubic Bezier. Test short line segments against
// object bounds so nodes near a curve do not fade a connection they never cover.
export function edgeOccluders(
  path: string,
  objects: Rect[],
  sourceId: CanvasObject['id'],
  targetId: CanvasObject['id'],
): Rect[] {
  const values = path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number);
  if (!values || values.length !== 8) return [];
  const [x0, y0, x1, y1, x2, y2, x3, y3] = values;
  const left = Math.min(x0, x1, x2, x3),
    right = Math.max(x0, x1, x2, x3),
    top = Math.min(y0, y1, y2, y3),
    bottom = Math.max(y0, y1, y2, y3);
  const points = Array.from({ length: 65 }, (_, i) => {
    const t = i / 64,
      s = 1 - t;
    return {
      x:
        s * s * s * x0 +
        3 * s * s * t * x1 +
        3 * s * t * t * x2 +
        t * t * t * x3,
      y:
        s * s * s * y0 +
        3 * s * s * t * y1 +
        3 * s * t * t * y2 +
        t * t * t * y3,
    };
  });
  return objects.filter((o) => {
    if (
      o.id === sourceId ||
      o.id === targetId ||
      o.x > right ||
      o.x + o.width < left ||
      o.y > bottom ||
      o.y + o.height < top
    )
      return false;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      let start = 0,
        end = 1;
      for (const [position, delta, min, max] of [
        [a.x, b.x - a.x, o.x, o.x + o.width],
        [a.y, b.y - a.y, o.y, o.y + o.height],
      ]) {
        if (Math.abs(delta) < 1e-9) {
          if (position < min || position > max) {
            start = 2;
            break;
          }
        } else {
          const u = (min - position) / delta,
            v = (max - position) / delta;
          start = Math.max(start, Math.min(u, v));
          end = Math.min(end, Math.max(u, v));
        }
      }
      if (start <= end) return true;
    }
    return false;
  });
}
