import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

// Drag-to-reorder for a hand of cards, extracted from Tongits so other card games
// (Gin, 65…) get the exact same feel: press-and-drag a card over another to slot
// it there; a press without a drag is a tap (select). While no custom order is set
// the hand follows `sorted`; the first drag snapshots that and switches to manual.

function applyOrder<T>(cards: T[], order: string[], idOf: (c: T) => string, sorted: T[]): T[] {
  const byId = new Map(cards.map((c) => [idOf(c), c] as const));
  const out: T[] = [];
  for (const id of order) {
    const c = byId.get(id);
    if (c) {
      out.push(c);
      byId.delete(id);
    }
  }
  for (const c of sorted) if (byId.has(idOf(c))) out.push(c); // newly drawn cards trail, in sort order
  return out;
}

export function useHandDrag<T>(cards: T[], sorted: T[], idOf: (c: T) => string, onTap: (c: T) => void) {
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

  const handOrder = customOrder ? applyOrder(cards, customOrder, idOf, sorted) : sorted;

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      d.moved = true;
      setCustomOrder(handOrder.map(idOf));
    }
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-card-id]");
    const overId = over?.getAttribute("data-card-id");
    if (overId && overId !== d.id) {
      setCustomOrder((prev) => {
        const base = prev ?? handOrder.map(idOf);
        const arr = base.filter((x) => x !== d.id);
        const idx = arr.indexOf(overId);
        if (idx < 0) return base;
        arr.splice(idx, 0, d.id);
        return arr;
      });
    }
  };

  const cardHandlers = (card: T) => ({
    "data-card-id": idOf(card),
    onPointerDown: (e: ReactPointerEvent) => {
      drag.current = { id: idOf(card), x: e.clientX, y: e.clientY, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: onMove,
    onPointerUp: () => {
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved) onTap(card);
    },
  });

  return { handOrder, customOrder, resetOrder: () => setCustomOrder(null), cardHandlers };
}
