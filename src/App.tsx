import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { type Card, type Suit, SUITS, cardId, cardLabel, rankOrder } from "./engine/cards";
import { classifyMeld, canLayOff, type Meld } from "./engine/melds";
import { handPoints } from "./engine/scoring";
import { bestMelds, deadwood } from "./engine/meldFinder";
import {
  topDiscard,
  draw,
  layMeld,
  sapaw,
  discard,
  callFight,
  canCallFight,
  canTakeDiscard,
  type GameState,
} from "./engine/game";
import { useGame } from "./ui/useGame";

const HUMAN = 0;

type SortMode = "suit" | "rank";

/** Ids of the cards that currently form a meld — used to tint them green. */
function meldCardIds(hand: readonly Card[]): Set<string> {
  return new Set(bestMelds(hand).flatMap((m) => m.cards.map(cardId)));
}

const suitIndex = (s: Suit) => SUITS.indexOf(s);

/** Auto-sort a hand, always rank high→low; grouped by suit or by rank. */
function sortHand(hand: readonly Card[], mode: SortMode): Card[] {
  const cmp =
    mode === "suit"
      ? (a: Card, b: Card) =>
          a.suit !== b.suit ? suitIndex(a.suit) - suitIndex(b.suit) : rankOrder(b.rank) - rankOrder(a.rank)
      : (a: Card, b: Card) =>
          rankOrder(a.rank) !== rankOrder(b.rank)
            ? rankOrder(b.rank) - rankOrder(a.rank)
            : suitIndex(a.suit) - suitIndex(b.suit);
  return [...hand].sort(cmp);
}

/** Apply a manual (drag) ordering, appending any not-yet-placed cards. */
function applyCustomOrder(hand: readonly Card[], order: string[]): Card[] {
  const byId = new Map(hand.map((c) => [cardId(c), c] as const));
  const out: Card[] = [];
  for (const id of order) {
    const c = byId.get(id);
    if (c) {
      out.push(c);
      byId.delete(id);
    }
  }
  out.push(...sortHand([...byId.values()], "suit"));
  return out;
}

function CardView({
  card,
  selected,
  inMeld,
  isNew,
  mustPlay,
  interactive,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: Card;
  selected?: boolean;
  inMeld?: boolean;
  isNew?: boolean;
  mustPlay?: boolean;
  interactive?: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const cls = ["card", red ? "red" : "black"];
  if (selected) cls.push("selected");
  if (inMeld) cls.push("inmeld");
  if (isNew) cls.push("new");
  if (mustPlay) cls.push("mustplay");
  return (
    <button
      type="button"
      data-card-id={cardId(card)}
      className={cls.join(" ")}
      disabled={!interactive}
      style={interactive ? { touchAction: "none" } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {cardLabel(card)}
      {mustPlay && <span className="tag tag-play">play</span>}
      {isNew && !mustPlay && <span className="tag tag-new">new</span>}
    </button>
  );
}

function MeldChip({
  meld,
  onClick,
  active,
}: {
  meld: Meld;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`meld ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={!onClick}
      title={meld.kind}
    >
      {meld.cards.map((c) => cardLabel(c)).join(" ")}
    </button>
  );
}

function RoundReveal({ state, onReplay }: { state: GameState; onReplay: () => void }) {
  const r = state.result!;
  const pts = r.handPoints;
  const winnerName = r.winner >= 0 ? state.players[r.winner].name : null;

  const isYou = r.winner === HUMAN;
  const subj = isYou ? "You" : winnerName;
  const verb = isYou ? "win" : "wins";

  const title =
    r.reason === "tongits" ? "Tongits!" : r.reason === "showdown" ? "Laban!" : "Stock empty";
  const subtitle =
    r.reason === "tongits"
      ? `${subj} emptied ${isYou ? "your" : "their"} hand`
      : r.reason === "showdown"
        ? `${state.players[r.caller ?? r.winner].name} called — lowest hand wins`
        : "Draw pile ran out — lowest hand wins";

  const verdict =
    r.winner < 0
      ? "It's a tie."
      : r.reason === "tongits"
        ? `${subj} ${verb} by Tongits 🎉`
        : `${subj} ${verb} with ${pts[r.winner]} pts`;

  return (
    <div className="reveal-backdrop">
      <div className="reveal">
        <h2 className={`reveal-title ${r.reason}`}>{title}</h2>
        <p className="reveal-sub">{subtitle}</p>

        <div className="reveal-players">
          {state.players.map((p, i) => {
            const ordered = sortHand(p.hand, "suit");
            const meldIds = meldCardIds(p.hand);
            return (
              <div key={p.id} className={`rp ${i === r.winner ? "win" : ""}`}>
                <div className="rp-head">
                  <strong>
                    {i === r.winner ? "👑 " : ""}
                    {p.name}
                  </strong>
                  <span className="rp-pts">{pts[i]} unmatched</span>
                </div>
                {p.melds.length > 0 && (
                  <div className="melds">
                    {p.melds.map((m, mi) => (
                      <MeldChip key={mi} meld={m} />
                    ))}
                  </div>
                )}
                <div className="rp-hand">
                  {p.hand.length === 0 ? (
                    <span className="rp-empty">— empty hand —</span>
                  ) : (
                    ordered.map((c) => (
                      <CardView key={cardId(c)} card={c} inMeld={meldIds.has(cardId(c))} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="reveal-verdict">{verdict}</div>
        <button className="reveal-replay" onClick={onReplay}>
          Play again
        </button>
      </div>
    </div>
  );
}

export function App() {
  const { state, setState, reset } = useGame(1);
  const [selected, setSelected] = useState<Card[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("suit");
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

  const isHumanTurn = !state.result && state.current === HUMAN;
  const human = state.players[HUMAN];
  const sel = (c: Card) => selected.some((s) => cardId(s) === cardId(c));

  function toggle(card: Card) {
    if (!isHumanTurn || state.phase !== "action") return;
    setSelected((prev) =>
      prev.some((s) => cardId(s) === cardId(card))
        ? prev.filter((s) => cardId(s) !== cardId(card))
        : [...prev, card],
    );
  }

  function act(next: GameState) {
    setState(next);
    setSelected([]);
  }

  const inAction = isHumanTurn && state.phase === "action";
  const inDraw = isHumanTurn && state.phase === "draw";
  const mustPlay = state.mustPlay; // a card taken from the discard, owed a play
  const selectedMeld = classifyMeld(selected);
  const canDiscard = inAction && selected.length === 1 && !mustPlay;
  const canBaba = inAction && selectedMeld !== null;
  const canCall = inDraw && canCallFight(state);
  const canTake = inDraw && canTakeDiscard(state);

  function onMeldClick(playerIndex: number, meldIndex: number) {
    if (!inAction || selected.length !== 1) return;
    const card = selected[0];
    const meld = state.players[playerIndex].melds[meldIndex];
    if (canLayOff(meld, card)) act(sapaw(state, playerIndex, meldIndex, card));
  }

  // Turn instruction shown above the hand.
  const instruction = !isHumanTurn
    ? `Waiting for ${state.players[state.current].name}…`
    : inDraw
      ? "Your turn — draw from the stock, take the discard to baba it, or call Laban."
      : mustPlay
        ? `You took ${cardLabel(mustPlay)} — baba it (meld or sapaw) before discarding.`
        : state.lastDrawn
          ? `You drew ${cardLabel(state.lastDrawn)}. Baba what you can, then discard.`
          : "Baba what you can, then discard one card.";

  const meldIds = meldCardIds(human.hand);
  const handOrder = customOrder
    ? applyCustomOrder(human.hand, customOrder)
    : sortHand(human.hand, sortMode);
  const unmatched = handPoints(deadwood(human.hand)); // what you'd score at a Laban
  const isMustPlay = (c: Card) => mustPlay != null && cardId(c) === cardId(mustPlay);
  const isNew = (c: Card) => state.lastDrawn != null && cardId(c) === cardId(state.lastDrawn);
  const inMeld = (c: Card) => meldIds.has(cardId(c));

  // Drag-to-reorder (touch-friendly). A small move = a tap (selects the card);
  // a larger move = a drag (rearranges the hand, switching to a custom order).
  function onCardDown(e: ReactPointerEvent, card: Card) {
    drag.current = { id: cardId(card), x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onCardMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      d.moved = true;
      setCustomOrder(handOrder.map(cardId));
    }
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
      "[data-card-id]",
    );
    const overId = over?.getAttribute("data-card-id");
    if (overId && overId !== d.id) {
      setCustomOrder((prev) => {
        const base = prev ?? handOrder.map(cardId);
        const arr = base.filter((x) => x !== d.id);
        const idx = arr.indexOf(overId);
        if (idx < 0) return base;
        arr.splice(idx, 0, d.id);
        return arr;
      });
    }
  }
  function onCardUp(card: Card) {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) toggle(card); // it was a tap, not a drag
  }

  return (
    <main className="app">
      <header className="top">
        <h1>Tongits</h1>
        <div className="newgame">
          <button onClick={() => reset(1)}>New · 1 bot</button>
          <button onClick={() => reset(2)}>New · 2 bots</button>
        </div>
      </header>

      {/* Opponents */}
      <section className="opponents">
        {state.players.slice(1).map((p, idx) => {
          const pi = idx + 1;
          return (
            <div key={p.id} className={`opp ${state.current === pi ? "turn" : ""}`}>
              <div className="opp-head">
                <strong>{p.name}</strong>
                <span className="count">{p.hand.length} cards</span>
              </div>
              <div className="melds">
                {p.melds.map((m, mi) => (
                  <MeldChip
                    key={mi}
                    meld={m}
                    active={selected.length === 1 && canLayOff(m, selected[0])}
                    onClick={() => onMeldClick(pi, mi)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* Stock + discard */}
      <section className="center">
        <button
          type="button"
          className="pile stock"
          disabled={!(isHumanTurn && state.phase === "draw")}
          onClick={() => act(draw(state, "stock"))}
        >
          <span className="pile-label">Stock</span>
          <span className="pile-count">{state.stock.length}</span>
        </button>

        <button
          type="button"
          className="pile discard"
          disabled={!canTake}
          onClick={() => act(draw(state, "discard"))}
        >
          <span className="pile-label">{canTake ? "Take" : "Discard"}</span>
          <span className="pile-top">{topDiscard(state) ? cardLabel(topDiscard(state)!) : "—"}</span>
        </button>
      </section>

      {/* Your melds */}
      {human.melds.length > 0 && (
        <section className="your-melds">
          <div className="section-label">Your melds</div>
          <div className="melds">
            {human.melds.map((m, mi) => (
              <MeldChip
                key={mi}
                meld={m}
                active={selected.length === 1 && canLayOff(m, selected[0])}
                onClick={() => onMeldClick(HUMAN, mi)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Your hand */}
      <section className="hand-area">
        <div className="section-label">
          Your hand · <strong>{unmatched}</strong> unmatched pts
          <span className="legend"> · green = meld · drag to reorder</span>
        </div>
        <div className="hand-controls">
          <span className="sort-label">Sort</span>
          <button
            className={!customOrder && sortMode === "suit" ? "on" : ""}
            onClick={() => {
              setCustomOrder(null);
              setSortMode("suit");
            }}
          >
            Suit
          </button>
          <button
            className={!customOrder && sortMode === "rank" ? "on" : ""}
            onClick={() => {
              setCustomOrder(null);
              setSortMode("rank");
            }}
          >
            Rank
          </button>
          {customOrder && <button onClick={() => setCustomOrder(null)}>Reset</button>}
        </div>
        <div className="instruction">{instruction}</div>
        <div className="hand">
          {handOrder.map((c) => (
            <CardView
              key={cardId(c)}
              card={c}
              selected={sel(c)}
              isNew={isNew(c)}
              mustPlay={isMustPlay(c)}
              inMeld={inMeld(c)}
              interactive
              onPointerDown={(e) => onCardDown(e, c)}
              onPointerMove={onCardMove}
              onPointerUp={() => onCardUp(c)}
            />
          ))}
        </div>
      </section>

      {/* Actions */}
      <section className="actions">
        <button disabled={!canBaba} onClick={() => act(layMeld(state, selected))}>
          Baba{selectedMeld ? ` (${selectedMeld.kind})` : ""}
        </button>
        <button disabled={!canDiscard} onClick={() => act(discard(state, selected[0]))}>
          Discard
        </button>
        <button disabled={!canCall} onClick={() => act(callFight(state))}>
          Laban
        </button>
      </section>

      {/* Round-end reveal */}
      {state.result && (
        <RoundReveal state={state} onReplay={() => reset((state.players.length - 1) as 1 | 2)} />
      )}

      {/* Log */}
      <section className="log">
        {state.log.slice(-5).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </section>
    </main>
  );
}
