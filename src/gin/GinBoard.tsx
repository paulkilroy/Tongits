import { useMemo } from "react";
import { BackButton } from "../ui/Icon";
import { type Card, type Suit, cardId, cardLabel } from "../engine/cards";
import { bestMelds, deadwood } from "../engine/meldFinder";
import { type GinState, deadwoodPts, canKnock, KNOCK_MAX, TARGET } from "./game";

const SUIT_CLASS: Record<Suit, string> = { clubs: "s-club", diamonds: "s-diamond", hearts: "s-heart", spades: "s-spade" };

function Chip({ c, onClick, dim }: { c: Card; onClick?: () => void; dim?: boolean }) {
  return (
    <button className={`sf-chip ${SUIT_CLASS[c.suit]} ${dim ? "dim" : ""}`} onClick={onClick} disabled={!onClick}>
      {cardLabel(c)}
    </button>
  );
}

export interface GinBoardProps {
  g: GinState;
  me: number;
  title: string;
  onDraw: (source: "deck" | "discard") => void;
  onDiscard: (cardId: string) => void;
  onKnock: (cardId: string) => void;
  onNextRound?: () => void;
  onNewGame?: () => void;
  onExit: () => void;
  waiting?: string | null;
}

export function GinBoard({ g, me, title, onDraw, onDiscard, onKnock, onNextRound, onNewGame, onExit, waiting }: GinBoardProps) {
  const hand = g.players[me].hand;
  const myTurn = g.current === me && !g.result && (g.phase === "draw" || g.phase === "discard");

  const groups = useMemo(() => ({ melds: bestMelds(hand).map((m) => m.cards), dead: deadwood(hand) }), [hand]);
  const deadPts = deadwoodPts(hand);
  const knockCard = useMemo(() => {
    if (!myTurn || g.phase !== "discard") return null;
    for (const c of hand) if (canKnock(g, cardId(c))) return c;
    return null;
  }, [g, hand, myTurn]);
  const knockGin = knockCard ? deadwoodPts(hand.filter((c) => cardId(c) !== cardId(knockCard))) === 0 : false;

  const discardTop = g.discard[g.discard.length - 1];

  return (
    <main className="app screen sixtyfive">
      <div className="screen-head">
        <BackButton onClick={onExit} />
        <h1>{title}</h1>
        <span />
      </div>

      <div className="screen-body">
        <div className="cr-scores">
          {g.players.map((p, i) => (
            <div className={`cr-score ${g.current === i && !g.result ? "active" : ""}`} key={i}>
              <div className="cr-score-top">
                <span>{i === me ? "You" : p.name}</span>
                <strong>{p.score}</strong>
              </div>
              <div className="cr-track">
                <div className="cr-track-fill" style={{ width: `${Math.min(100, (p.score / TARGET) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="cr-lbl sf-round">Gin · knock at ≤{KNOCK_MAX} · first to {TARGET}</div>
        {waiting && <div className="cr-waiting">{waiting}</div>}
        {g.log.length > 0 && <div className="cr-flash">{g.log[g.log.length - 1]}</div>}

        {g.phase === "roundEnd" && g.round ? (
          <div className="cr-phase">
            <h2 className="sf-h2">
              {g.players[g.round.knocker].name} {g.round.gin ? "goes Gin!" : "knocks"} ·{" "}
              {g.players[g.round.scorer].name} +{g.round.points}
              {g.round.undercut ? " (undercut!)" : ""}
            </h2>
            <div className="sf-melds">
              {g.round.melds.map((m, k) => (
                <span className="sf-meld" key={k}>
                  {m.map((c) => (
                    <Chip key={cardId(c)} c={c} />
                  ))}
                </span>
              ))}
            </div>
            <div className="cr-lbl">
              knocker deadwood {g.round.knockerDeadwood.length} · defender left {g.round.defenderDeadwood.length}
            </div>
            {onNextRound ? (
              <button className="big play-primary" onClick={onNextRound}>
                Next hand
              </button>
            ) : (
              <div className="cr-lbl">waiting for the next hand…</div>
            )}
          </div>
        ) : g.result ? (
          <div className="cr-phase cr-over">
            <h2>{g.result.winner === me ? "You win! 🎉" : `${g.players[g.result.winner].name} wins.`}</h2>
            <div className="cr-lbl">{g.players.map((p, i) => `${i === me ? "You" : p.name} ${p.score}`).join(" · ")}</div>
            {onNewGame && (
              <button className="reveal-replay" onClick={onNewGame}>
                New game
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="sf-piles">
              <button className="sf-pile" disabled={!(myTurn && g.phase === "draw")} onClick={() => onDraw("deck")}>
                <span className="sf-pile-back">🂠</span>
                <span className="cr-lbl">stock {g.deck.length}</span>
              </button>
              <button
                className="sf-pile"
                disabled={!(myTurn && g.phase === "draw") || !discardTop}
                onClick={() => onDraw("discard")}
              >
                {discardTop ? <Chip c={discardTop} /> : <span className="cr-lbl">—</span>}
                <span className="cr-lbl">discard</span>
              </button>
            </div>

            <div className="sf-analyzer">
              <div className="sf-a-head">
                Your hand · deadwood <strong>{deadPts}</strong>
                {deadPts === 0 && hand.length >= 7 && <span className="fk-good"> · Gin!</span>}
              </div>
              <div className="sf-groups">
                {groups.melds.map((m, k) => (
                  <span className="sf-meld" key={`m${k}`}>
                    {m.map((c) => (
                      <Chip key={cardId(c)} c={c} onClick={myTurn && g.phase === "discard" ? () => onDiscard(cardId(c)) : undefined} />
                    ))}
                  </span>
                ))}
                {groups.dead.length > 0 && (
                  <span className="sf-dead">
                    {groups.dead.map((c) => (
                      <Chip key={cardId(c)} c={c} onClick={myTurn && g.phase === "discard" ? () => onDiscard(cardId(c)) : undefined} />
                    ))}
                  </span>
                )}
              </div>
            </div>

            <div className="sf-actions">
              {!myTurn ? (
                <div className="cr-turn">{g.players[g.current].name}…</div>
              ) : g.phase === "draw" ? (
                <div className="cr-lbl">draw from the stock or take the discard</div>
              ) : (
                <>
                  <div className="cr-lbl">tap a card to discard{knockCard ? " — or:" : ""}</div>
                  {knockCard && (
                    <button className="big play-primary" onClick={() => onKnock(cardId(knockCard))}>
                      {knockGin ? "✊ Gin!" : "✊ Knock"}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
