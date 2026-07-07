import { type Card, rankOrder, SUITS } from "../engine/cards";

// Shared hand-sorting + the little Sort toggle, so every card game reorders the
// same way (matching Tongits): by suit then rank, or by rank then suit.

export type SortMode = "suit" | "rank";

const si = (s: Card["suit"]): number => SUITS.indexOf(s);

export function sortHand(hand: readonly Card[], mode: SortMode): Card[] {
  const cmp =
    mode === "suit"
      ? (a: Card, b: Card) => (a.suit !== b.suit ? si(a.suit) - si(b.suit) : rankOrder(b.rank) - rankOrder(a.rank))
      : (a: Card, b: Card) =>
          rankOrder(a.rank) !== rankOrder(b.rank) ? rankOrder(b.rank) - rankOrder(a.rank) : si(a.suit) - si(b.suit);
  return [...hand].sort(cmp);
}

export function SortToggle({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  return (
    <div className="hand-controls">
      <span className="sort-label">Sort</span>
      <button className={mode === "suit" ? "on" : ""} onClick={() => onChange("suit")}>
        Suit
      </button>
      <button className={mode === "rank" ? "on" : ""} onClick={() => onChange("rank")}>
        Rank
      </button>
    </div>
  );
}
