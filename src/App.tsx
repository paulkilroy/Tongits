import { useState } from "react";
import { type Card, cardId, cardLabel } from "./engine/cards";
import { classifyMeld, canLayOff, type Meld } from "./engine/melds";
import { handPoints } from "./engine/scoring";
import { deadwood } from "./engine/meldFinder";
import {
  topDiscard,
  draw,
  layMeld,
  sapaw,
  discard,
  callFight,
  type GameState,
} from "./engine/game";
import { useGame } from "./ui/useGame";

const HUMAN = 0;

function CardView({
  card,
  selected,
  dim,
  onClick,
}: {
  card: Card;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <button
      type="button"
      className={`card ${red ? "red" : "black"} ${selected ? "selected" : ""} ${dim ? "dim" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      {cardLabel(card)}
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

export function App() {
  const { state, setState, reset } = useGame(1);
  const [selected, setSelected] = useState<Card[]>([]);

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

  const selectedMeld = classifyMeld(selected);
  const canDiscard = isHumanTurn && state.phase === "action" && selected.length === 1;
  const canMeld = isHumanTurn && state.phase === "action" && selectedMeld !== null;
  const canCall =
    isHumanTurn &&
    state.phase === "action" &&
    state.rules.enableLaban &&
    (!state.rules.mustHaveMeldToCall || human.melds.length > 0);

  function onMeldClick(playerIndex: number, meldIndex: number) {
    if (!isHumanTurn || state.phase !== "action" || selected.length !== 1) return;
    const card = selected[0];
    const meld = state.players[playerIndex].melds[meldIndex];
    if (canLayOff(meld, card)) act(sapaw(state, playerIndex, meldIndex, card));
  }

  const hint = deadwood(human.hand); // cards not part of any meld — discard fodder

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
          disabled={!(isHumanTurn && state.phase === "draw") || !topDiscard(state)}
          onClick={() => act(draw(state, "discard"))}
        >
          <span className="pile-label">Discard</span>
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
          Your hand · {handPoints(human.hand)} pts
          {isHumanTurn ? (
            <em> · {state.phase === "draw" ? "draw to start" : "your move"}</em>
          ) : (
            <em> · waiting…</em>
          )}
        </div>
        <div className="hand">
          {[...human.hand]
            .sort((a, b) => cardId(a).localeCompare(cardId(b)))
            .map((c) => (
              <CardView
                key={cardId(c)}
                card={c}
                selected={sel(c)}
                dim={!hint.some((d) => cardId(d) === cardId(c)) && !sel(c)}
                onClick={() => toggle(c)}
              />
            ))}
        </div>
      </section>

      {/* Actions */}
      <section className="actions">
        <button disabled={!canMeld} onClick={() => act(layMeld(state, selected))}>
          Meld{selectedMeld ? ` (${selectedMeld.kind})` : ""}
        </button>
        <button disabled={!canDiscard} onClick={() => act(discard(state, selected[0]))}>
          Discard
        </button>
        <button disabled={!canCall} onClick={() => act(callFight(state))}>
          Call fight
        </button>
      </section>

      {/* Result banner */}
      {state.result && (
        <div className="result">
          <strong>
            {state.result.winner === HUMAN
              ? "You win the round! 🎉"
              : state.result.winner < 0
                ? "Round tied."
                : `${state.players[state.result.winner].name} wins the round.`}
          </strong>
          <div className="result-reason">
            by {state.result.reason} · points {state.result.handPoints.join(" / ")}
          </div>
          <button onClick={() => reset((state.players.length - 1) as 1 | 2)}>Play again</button>
        </div>
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
