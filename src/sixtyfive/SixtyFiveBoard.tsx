import { useMemo } from "react";
import { BackButton } from "../ui/Icon";
import { type Suit } from "../engine/cards";
import { type RCard, isWild, rlabel, isJoker } from "./rules";
import { analyze } from "./meld";
import { type SFState } from "./game";

const SUIT_CLASS: Record<Suit, string> = { clubs: "s-club", diamonds: "s-diamond", hearts: "s-heart", spades: "s-spade" };

function Chip({ c, wild, onClick, dim }: { c: RCard; wild: boolean; onClick?: () => void; dim?: boolean }) {
  return (
    <button
      className={`sf-chip ${isJoker(c) ? "s-joker" : SUIT_CLASS[c.suit as Suit]} ${wild ? "wild" : ""} ${dim ? "dim" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      {rlabel(c)}
    </button>
  );
}

export interface SFBoardProps {
  g: SFState;
  me: number;
  title: string;
  onDraw: (source: "deck" | "discard") => void;
  onDiscard: (cardId: string) => void;
  onPayMe: (cardId: string) => void;
  onNextRound?: () => void;
  onNewGame?: () => void;
  onExit: () => void;
  waiting?: string | null;
}

export function SixtyFiveBoard({ g, me, title, onDraw, onDiscard, onPayMe, onNextRound, onNewGame, onExit, waiting }: SFBoardProps) {
  const wild = g.wildRank;
  const hand = g.players[me].hand;
  const myTurn = g.current === me && !g.result && (g.phase === "draw" || g.phase === "discard");

  const analysis = useMemo(() => analyze(hand, wild), [hand, wild]);
  // A card we could discard to go out (all remaining melded).
  const payMeCard = useMemo(() => {
    if (!myTurn || g.phase !== "discard") return null;
    for (const c of hand) if (analyze(hand.filter((x) => x.id !== c.id), wild).points === 0 && hand.length - 1 === g.handSize) return c;
    return null;
  }, [hand, wild, myTurn, g.phase, g.handSize]);

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
                <strong>{p.total}</strong>
              </div>
              {g.reveals && <div className="cr-lbl">+{g.reveals[i].points} this hand</div>}
            </div>
          ))}
        </div>
        <div className="cr-lbl sf-round">
          Hand {g.handSize} of 13 · wild: joker{wild ? ` + ${wild}s` : ""} · lowest wins
        </div>
        {waiting && <div className="cr-waiting">{waiting}</div>}
        {g.log.length > 0 && <div className="cr-flash">{g.log[g.log.length - 1]}</div>}

        {g.phase === "roundEnd" && g.reveals ? (
          <div className="cr-phase">
            <h2 className="sf-h2">Hand {g.handSize} — the reveal</h2>
            {g.reveals.map((r, i) => (
              <div className="sf-reveal" key={i}>
                <div className="sf-reveal-name">
                  {i === me ? "You" : g.players[i].name} · <strong>+{r.points}</strong>
                </div>
                <div className="sf-melds">
                  {r.melds.map((m, k) => (
                    <span className="sf-meld" key={k}>
                      {m.map((c) => (
                        <Chip key={c.id} c={c} wild={isWild(c, wild)} />
                      ))}
                    </span>
                  ))}
                  {r.deadwood.map((c) => (
                    <Chip key={c.id} c={c} wild={false} dim />
                  ))}
                </div>
              </div>
            ))}
            {onNextRound && (
              <button className="big play-primary" onClick={onNextRound}>
                {g.handSize >= 13 ? "Finish" : "Next hand"}
              </button>
            )}
            {!onNextRound && <div className="cr-lbl">waiting for the next hand…</div>}
          </div>
        ) : g.result ? (
          <div className="cr-phase cr-over">
            <h2>{g.result.winner === me ? "You win! 🎉" : `${g.players[g.result.winner].name} wins.`}</h2>
            <div className="cr-lbl">{g.players.map((p, i) => `${i === me ? "You" : p.name} ${p.total}`).join(" · ")}</div>
            {onNewGame && (
              <button className="reveal-replay" onClick={onNewGame}>
                New game
              </button>
            )}
          </div>
        ) : (
          <>
            {/* draw / discard piles */}
            <div className="sf-piles">
              <button
                className="sf-pile"
                disabled={!(myTurn && g.phase === "draw")}
                onClick={() => onDraw("deck")}
              >
                <span className="sf-pile-back">🂠</span>
                <span className="cr-lbl">stock {g.deck.length}</span>
              </button>
              <button
                className="sf-pile"
                disabled={!(myTurn && g.phase === "draw") || !discardTop}
                onClick={() => onDraw("discard")}
              >
                {discardTop ? <Chip c={discardTop} wild={isWild(discardTop, wild)} /> : <span className="cr-lbl">—</span>}
                <span className="cr-lbl">discard</span>
              </button>
            </div>

            {/* the live hand analyzer */}
            <div className="sf-analyzer">
              <div className="sf-a-head">
                Your hand · deadwood <strong>{analysis.points}</strong>
                {analysis.points === 0 && hand.length >= g.handSize && <span className="fk-good"> · ready to Pay Me!</span>}
              </div>
              <div className="sf-groups">
                {analysis.melds.map((m, k) => (
                  <span className="sf-meld" key={`m${k}`}>
                    {m.map((c) => (
                      <Chip
                        key={c.id}
                        c={c}
                        wild={isWild(c, wild)}
                        onClick={myTurn && g.phase === "discard" ? () => onDiscard(c.id) : undefined}
                      />
                    ))}
                  </span>
                ))}
                {analysis.deadwood.length > 0 && (
                  <span className="sf-dead">
                    {analysis.deadwood.map((c) => (
                      <Chip
                        key={c.id}
                        c={c}
                        wild={false}
                        onClick={myTurn && g.phase === "discard" ? () => onDiscard(c.id) : undefined}
                      />
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
                  <div className="cr-lbl">tap a card to discard{payMeCard ? " — or go out:" : ""}</div>
                  {payMeCard && (
                    <button className="big play-primary" onClick={() => onPayMe(payMeCard.id)}>
                      💰 Pay Me!
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
