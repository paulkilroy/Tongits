import { type ReactNode, type PointerEvent as ReactPointerEvent } from "react";

// The one card visual, shared by every card game so they all look like Tongits
// (which we refined well): white card, four-colour suit, and the same state
// treatments — yellow "new" glow + tag, blue selected lift, green in-meld border.
//
// Pass `label` + `suitClass` (from engine/cards SUIT_CLASS, or "" for a joker).
// A card with neither `onClick` nor `disabled` renders as a <span> so it can sit
// inside another button (e.g. the discard pile) without swallowing its clicks.

export function PlayingCard({
  label,
  suitClass,
  mini,
  joker,
  wild,
  dim,
  selected,
  inMeld,
  isNew,
  disabled,
  onClick,
  dataCardId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  label: string;
  suitClass: string;
  mini?: boolean;
  joker?: boolean;
  wild?: boolean;
  dim?: boolean;
  selected?: boolean;
  inMeld?: boolean;
  isNew?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Drag-to-reorder: identity + pointer handlers (see useHandDrag). */
  dataCardId?: string;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: () => void;
}) {
  const cls = [mini ? "mc" : "card", suitClass];
  if (joker) cls.push("joker");
  if (wild) cls.push("wild");
  if (dim) cls.push("dim");
  if (selected) cls.push("selected");
  if (inMeld) cls.push("inmeld");
  if (isNew) cls.push("new");
  const inner: ReactNode = (
    <>
      {label}
      {isNew && <span className="tag tag-new">new</span>}
    </>
  );
  const draggable = !!onPointerDown;
  if (!onClick && !disabled && !draggable) return <span className={cls.join(" ")}>{inner}</span>;
  return (
    <button
      type="button"
      className={cls.join(" ")}
      disabled={disabled}
      onClick={onClick}
      data-card-id={dataCardId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={draggable ? { touchAction: "none" } : undefined}
    >
      {inner}
    </button>
  );
}
