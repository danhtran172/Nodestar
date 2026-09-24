import type { MouseEvent, PointerEvent } from 'react';
import type { RelationSide } from '@/lib/relation-gesture';

/** The connect mark: three joined nodes reaching toward a fourth. */
export function ConnectIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      fill="currentColor"
    >
      <circle cx="85" cy="85" r="85" />
      <circle cx="427" cy="85" r="85" />
      <circle cx="85" cy="427" r="85" />
      <circle cx="368" cy="368" r="132" />
      <path d="M85 85H170A86 86 0 0 0 342 85H427L420 170A269 269 0 0 0 170 420L85 427V342A86 86 0 0 0 85 170Z" />
    </svg>
  );
}

/**
 * The connect handle at the centre of a node. Dragging from it draws a path;
 * a plain press passes through as a click on the node, so the centre of a
 * card still selects it and a double-click still edits its text.
 */
export function RelationDot({
  side,
  sourceId,
  onStart,
  onLostCapture,
  onEdit,
}: {
  side: RelationSide;
  sourceId: string;
  onStart: (
    e: PointerEvent<HTMLButtonElement>,
    id: string,
    side: RelationSide,
  ) => void;
  onLostCapture: (e: PointerEvent<HTMLButtonElement>) => void;
  onEdit: (id: string) => void;
}) {
  const swallow = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <button
      type="button"
      className="relation-dot"
      data-relation-dot={sourceId}
      data-side={side}
      aria-label="Drag to connect to another node"
      title="Drag to connect to another node"
      onPointerDown={(e) => onStart(e, sourceId, side)}
      onLostPointerCapture={onLostCapture}
      onClick={swallow}
      onDoubleClick={(e) => {
        swallow(e);
        onEdit(sourceId);
      }}
      onContextMenu={swallow}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ConnectIcon />
    </button>
  );
}
