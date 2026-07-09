import { type ReactNode } from "react";

// A little overlay that shows the whole discard pile (newest first) when you tap
// it. If taking the top card is legal right now, a Take button is offered so the
// pile still doubles as the "draw from discard" control. Shared by Tongits, Gin,
// and 65 — each passes its own already-rendered cards as children.

export function DiscardHistory({
  onClose,
  onTake,
  takeLabel = "Take top card",
  count,
  children,
}: {
  onClose: () => void;
  onTake?: () => void;
  takeLabel?: string;
  count: number;
  children: ReactNode; // rendered cards, newest first
}) {
  return (
    <div className="reveal-backdrop" onClick={onClose}>
      <div className="reveal dh" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="reveal-title">Discard pile · {count}</h2>
        <p className="cr-lbl">newest first</p>
        <div className="dh-cards">{children}</div>
        <div className="modal-actions">
          {onTake && (
            <button className="big" onClick={onTake}>
              {takeLabel}
            </button>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
