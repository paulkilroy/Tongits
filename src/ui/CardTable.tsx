import { type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { BackButton } from "./Icon";
import { SortToggle, type SortMode } from "./handSort";
import { useHandDrag } from "./useHandDrag";

// The shared card-game board model. Every rummy-style game (Gin, 65, and future
// ones) builds its screen from these pieces instead of hand-rolling the same
// markup, so they all look and behave like Tongits: the same screen chrome, score
// row, draw/discard piles (with the inline animated "fan out"), and a hand panel
// with sort + drag-to-reorder. Card rendering itself stays with each game (it owns
// its own Chip / PlayingCard), passed in as a render prop.

/** Pointer handlers + identity produced by useHandDrag, handed to each hand card. */
export type CardDragProps = {
  "data-card-id": string;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
};

/** Full-screen board scaffold: back button + title, then the game body. */
export function GameScreen({
  title,
  onExit,
  variant = "sixtyfive",
  children,
}: {
  title: string;
  onExit: () => void;
  variant?: string;
  children: ReactNode;
}) {
  return (
    <main className={`app screen ${variant}`}>
      <div className="screen-head">
        <BackButton onClick={onExit} />
        <h1>{title}</h1>
        <span />
      </div>
      <div className="screen-body">{children}</div>
    </main>
  );
}

export interface ScorePlayer {
  name: string;
  score: number | string;
  active: boolean;
  /** Optional sub-line under the score (a progress bar, "+N this hand", …). */
  sub?: ReactNode;
}

/** The per-player score strip across the top of the body. */
export function ScoreRow({ players }: { players: ScorePlayer[] }) {
  return (
    <div className="cr-scores">
      {players.map((p, i) => (
        <div className={`cr-score ${p.active ? "active" : ""}`} key={i}>
          <div className="cr-score-top">
            <span>{p.name}</span>
            <strong>{p.score}</strong>
          </div>
          {p.sub}
        </div>
      ))}
    </div>
  );
}

/** Draw pile + discard pile, with the whole discard history hidden behind a subtle
 *  toggle that fans every card out in place (nothing shown until you tap it). The
 *  two piles glow a yellow "your move" edge while they're actionable.
 *  `renderCard(card, mini)` lets the game draw its own card visual. */
export function DiscardPiles<T>({
  stockCount,
  stockLabel = "stock",
  canDrawStock,
  onDrawStock,
  discard,
  topCard,
  takeLabel = "take discard",
  canTakeDiscard,
  onTakeDiscard,
  renderCard,
  fanned,
  setFanned,
}: {
  stockCount: number;
  stockLabel?: string;
  canDrawStock: boolean;
  onDrawStock: () => void;
  discard: T[];
  topCard: T | null;
  takeLabel?: string;
  canTakeDiscard: boolean;
  onTakeDiscard: () => void;
  renderCard: (card: T, mini: boolean) => ReactNode;
  fanned: boolean;
  setFanned: (v: boolean) => void;
}) {
  return (
    <>
      <div className="sf-piles">
        <button className={`sf-pile ${canDrawStock ? "hot" : ""}`} disabled={!canDrawStock} onClick={onDrawStock}>
          <span className="sf-pile-back">🂠</span>
          <span className="cr-lbl">
            {stockLabel} {stockCount}
          </span>
        </button>
        <button className={`sf-pile ${canTakeDiscard ? "hot" : ""}`} disabled={!canTakeDiscard} onClick={onTakeDiscard}>
          {topCard ? renderCard(topCard, false) : <span className="cr-lbl">—</span>}
          <span className="cr-lbl">{takeLabel}</span>
        </button>
      </div>

      {discard.length > 1 && (
        <button className={`disc-fan-toggle ${fanned ? "open" : ""}`} onClick={() => setFanned(!fanned)}>
          {fanned ? "▲ hide discards" : `▾ all ${discard.length} discards`}
        </button>
      )}

      {fanned && discard.length > 1 && (
        <div className="disc-fanout" onClick={() => setFanned(false)}>
          {[...discard].reverse().map((c, i) => (
            <span className="disc-fanout-card" style={{ animationDelay: `${i * 28}ms` }} key={i}>
              {renderCard(c, true)}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** The player's hand: a header, sort toggle (+ "reset order" after a manual drag),
 *  and the hand itself with drag-to-reorder wired in. `renderCard(card, dragProps)`
 *  draws each card; tapping a card (no drag) calls `onTapCard`. */
export function HandPanel<T>({
  header,
  cards,
  sorted,
  idOf,
  sortMode,
  onSortChange,
  onTapCard,
  renderCard,
}: {
  header: ReactNode;
  cards: T[];
  sorted: T[];
  idOf: (c: T) => string;
  sortMode: SortMode;
  onSortChange: (m: SortMode) => void;
  onTapCard: (c: T) => void;
  renderCard: (card: T, drag: CardDragProps) => ReactNode;
}) {
  const { handOrder, customOrder, resetOrder, cardHandlers } = useHandDrag(cards, sorted, idOf, onTapCard);
  return (
    <div className="sf-analyzer">
      <div className="sf-a-head">{header}</div>
      <div className="sf-sortrow">
        <SortToggle
          mode={sortMode}
          onChange={(m) => {
            onSortChange(m);
            resetOrder();
          }}
        />
        {customOrder && (
          <button className="sf-reset" onClick={resetOrder}>
            reset order
          </button>
        )}
      </div>
      <div className="sf-hand">{handOrder.map((c) => renderCard(c, cardHandlers(c)))}</div>
    </div>
  );
}
