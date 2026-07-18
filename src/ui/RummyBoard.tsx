import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GameScreen, ScoreRow, DiscardPiles, HandPanel, type ScorePlayer, type CardDragProps } from "./CardTable";
import { type SortMode } from "./handSort";

// The one board for every discard-based rummy game (Gin, 65). It owns the shared
// skeleton — score strip, round line, draw/discard piles, the sortable/draggable
// hand, the actions footer, and the game-over screen — plus the selection / sort /
// fan state. Each game plugs in its card operations, its declare move (knock vs
// pay-me), and render-props for the parts that genuinely differ (the round-end
// reveal, and the review modal). Gin and 65 were this board written twice.

/** How a single card is rendered in this game (its own Chip). `wild` is an optional
 *  override for games with wild cards (65); other games ignore it. */
export type Chip<C> = (
  c: C,
  o: {
    mini?: boolean;
    dim?: boolean;
    selected?: boolean;
    isNew?: boolean;
    inMeld?: boolean;
    wild?: boolean;
    drag?: CardDragProps;
  },
) => ReactNode;

export interface RummyCard<C> {
  id: (c: C) => string;
  chip: Chip<C>;
  /** Ids of the cards that fall in a meld (the rest is deadwood). */
  meldedIds: (hand: C[]) => Set<string>;
  sort: (hand: C[], mode: SortMode) => C[];
  /** Deadwood point total of the hand. */
  deadwood: (hand: C[]) => number;
}

/** The minimum a game state must expose for the shared board. */
export interface RummyState<C> {
  players: { name: string; hand: C[] }[];
  current: number;
  phase: string;
  result: { winner: number } | null;
  deck: unknown[];
  discard: C[];
  drawnId: string | null;
}

/** The declare button (knock / gin / pay-me) for the current selection, or null. */
export type Declare = { id: string; label: string; onClick: () => void } | null;

export function RummyBoard<C, S extends RummyState<C>>({
  g,
  me,
  title,
  onExit,
  waiting,
  flash,
  card,
  scorePlayers,
  roundInfo,
  handHint,
  onDraw,
  onDiscard,
  declare,
  reveal,
  onNewGame,
  reviewModal,
}: {
  g: S;
  me: number;
  title: string;
  onExit: () => void;
  waiting?: string | null;
  /** The latest log line, shown as a flash under the round info. */
  flash?: ReactNode;
  card: RummyCard<C>;
  scorePlayers: ScorePlayer[];
  roundInfo: ReactNode;
  /** Appended to the hand header, e.g. "· Gin!" / "· ready to Pay Me!". */
  handHint?: ReactNode;
  onDraw: (source: "deck" | "discard") => void;
  onDiscard: (cardId: string) => void;
  /** The declare move for the current selection (knock / pay-me), or null. */
  declare: (sel: string | null) => Declare;
  /** The round-end reveal (game-specific), including its review + next buttons. */
  reveal?: ReactNode;
  onNewGame?: () => void;
  /** The hand-review modal element (game-specific), rendered when open. */
  reviewModal?: ReactNode;
}) {
  const hand = g.players[me].hand;
  const myTurn = g.current === me && !g.result && (g.phase === "draw" || g.phase === "discard");
  const canDiscard = myTurn && g.phase === "discard";

  const [sel, setSel] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("suit");
  const [fanned, setFanned] = useState(false);
  useEffect(() => setSel(null), [g.current, g.phase]);
  // The discard fan stays open until your turn ends, then folds away on its own.
  useEffect(() => {
    if (!myTurn) setFanned(false);
  }, [myTurn]);

  const meldedIds = useMemo(() => card.meldedIds(hand), [hand, card]);
  const sorted = useMemo(() => card.sort(hand, sortMode), [hand, sortMode, card]);
  const deadPts = card.deadwood(hand);
  const discardTop = g.discard[g.discard.length - 1];
  const dec = canDiscard ? declare(sel) : null;

  return (
    <GameScreen title={title} onExit={onExit}>
      <ScoreRow players={scorePlayers} />
      <div className="cr-lbl sf-round">{roundInfo}</div>
      {waiting && <div className="cr-waiting">{waiting}</div>}
      {flash && <div className="cr-flash">{flash}</div>}

      {g.phase === "roundEnd" ? (
        reveal
      ) : g.result ? (
        <div className="cr-phase cr-over">
          <h2>{g.result.winner === me ? "You win! 🎉" : `${g.players[g.result.winner].name} wins.`}</h2>
          <div className="cr-lbl">{scorePlayers.map((p) => `${p.name} ${p.score}`).join(" · ")}</div>
          {onNewGame && (
            <button className="reveal-replay" onClick={onNewGame}>
              New game
            </button>
          )}
        </div>
      ) : (
        <>
          <DiscardPiles
            stockCount={g.deck.length}
            canDrawStock={myTurn && g.phase === "draw"}
            onDrawStock={() => onDraw("deck")}
            discard={g.discard}
            topCard={discardTop ?? null}
            canTakeDiscard={myTurn && g.phase === "draw" && !!discardTop}
            onTakeDiscard={() => onDraw("discard")}
            renderCard={(c, mini) => card.chip(c, { mini })}
            fanned={fanned}
            setFanned={setFanned}
          />

          <HandPanel
            cards={hand}
            sorted={sorted}
            idOf={card.id}
            sortMode={sortMode}
            onSortChange={setSortMode}
            onTapCard={(c) => {
              if (canDiscard) setSel((s) => (s === card.id(c) ? null : card.id(c)));
            }}
            header={
              <>
                Your hand · deadwood <strong>{deadPts}</strong> · <span className="legend">green = meld</span>
                {handHint}
              </>
            }
            renderCard={(c, drag) =>
              card.chip(c, {
                inMeld: meldedIds.has(card.id(c)),
                selected: sel === card.id(c),
                isNew: g.drawnId === card.id(c),
                drag,
              })
            }
          />

          <div className="sf-actions">
            {!myTurn ? (
              <div className="cr-turn">{g.players[g.current].name}…</div>
            ) : g.phase === "draw" ? (
              <div className="cr-lbl">draw from the stock or take the discard</div>
            ) : (
              <>
                <div className="cr-lbl">{sel ? "discard the selected card, or:" : "tap a card to select"}</div>
                <div className="cr-row2">
                  <button className="reveal-replay cr-discard-btn" disabled={!sel} onClick={() => sel && onDiscard(sel)}>
                    Discard
                  </button>
                  {dec && (
                    <button className="cr-coach-btn" onClick={dec.onClick}>
                      {dec.label}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {reviewModal}
    </GameScreen>
  );
}
