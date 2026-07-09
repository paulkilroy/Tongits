import { useEffect, useMemo, useState } from "react";
import { BackButton } from "../ui/Icon";
import { type Suit, SUITS, SUIT_CLASS } from "../engine/cards";
import { type RCard, isWild, rlabel, isJoker, ord, type Rank } from "./rules";
import { analyze } from "./meld";
import { type SFState } from "./game";
import { SortToggle, type SortMode } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";
import { DiscardHistory } from "../ui/DiscardHistory";

/** Sort a "65" hand (jokers/wilds trail the end). */
function sortRHand(hand: RCard[], mode: SortMode, wild: Rank | null): RCard[] {
  const si = (s: Suit | null) => (s ? SUITS.indexOf(s) : 99);
  const wo = (c: RCard) => (isWild(c, wild) ? 99 : 0);
  return [...hand].sort((a, b) => {
    if (wo(a) !== wo(b)) return wo(a) - wo(b);
    if (mode === "suit") return si(a.suit) !== si(b.suit) ? si(a.suit) - si(b.suit) : ord(b.rank as Rank) - ord(a.rank as Rank);
    const ra = a.rank === "JOKER" ? 0 : ord(a.rank as Rank);
    const rb = b.rank === "JOKER" ? 0 : ord(b.rank as Rank);
    return ra !== rb ? rb - ra : si(a.suit) - si(b.suit);
  });
}

function Chip({
  c,
  wild,
  onClick,
  dim,
  selected,
  isNew,
  inMeld,
  mini,
}: {
  c: RCard;
  wild: boolean;
  onClick?: () => void;
  dim?: boolean;
  selected?: boolean;
  isNew?: boolean;
  inMeld?: boolean;
  mini?: boolean;
}) {
  return (
    <PlayingCard
      label={rlabel(c)}
      suitClass={isJoker(c) ? "" : SUIT_CLASS[c.suit as Suit]}
      joker={isJoker(c)}
      wild={wild}
      dim={dim}
      mini={mini}
      selected={selected}
      isNew={isNew}
      inMeld={inMeld}
      onClick={onClick}
    />
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

  const [sel, setSel] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("suit");
  const [showDiscards, setShowDiscards] = useState(false);
  // Clear the selection when the turn/phase changes.
  useEffect(() => setSel(null), [g.current, g.phase, g.handSize]);

  const analysis = useMemo(() => analyze(hand, wild), [hand, wild]);
  const meldedIds = useMemo(() => new Set(analysis.melds.flat().map((c) => c.id)), [analysis]);
  const sorted = useMemo(() => sortRHand(hand, sortMode, wild), [hand, sortMode, wild]);
  const canDiscard = myTurn && g.phase === "discard";
  // A card we could discard to go out (all remaining melded) — prefer the selected one.
  const payMeCard = useMemo(() => {
    if (!canDiscard || hand.length - 1 !== g.handSize) return null;
    if (sel && analyze(hand.filter((x) => x.id !== sel), wild).points === 0) return sel;
    for (const c of hand) if (analyze(hand.filter((x) => x.id !== c.id), wild).points === 0) return c.id;
    return null;
  }, [hand, wild, canDiscard, g.handSize, sel]);

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
                        <Chip key={c.id} c={c} wild={isWild(c, wild)} mini />
                      ))}
                    </span>
                  ))}
                  {r.deadwood.length > 0 && (
                    <span className="sf-dead">
                      {r.deadwood.map((c) => (
                        <Chip key={c.id} c={c} wild={false} dim mini />
                      ))}
                    </span>
                  )}
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
                disabled={g.discard.length === 0}
                onClick={() => setShowDiscards(true)}
              >
                {discardTop ? <Chip c={discardTop} wild={isWild(discardTop, wild)} /> : <span className="cr-lbl">—</span>}
                <span className="cr-lbl">discard · {g.discard.length}</span>
              </button>
            </div>

            {showDiscards && (
              <DiscardHistory
                count={g.discard.length}
                onClose={() => setShowDiscards(false)}
                onTake={myTurn && g.phase === "draw" ? () => { setShowDiscards(false); onDraw("discard"); } : undefined}
              >
                {[...g.discard].reverse().map((c, i) => (
                  <Chip key={`${c.id}-${i}`} c={c} wild={isWild(c, wild)} mini />
                ))}
              </DiscardHistory>
            )}

            {/* the live hand analyzer — green cards are melded */}
            <div className="sf-analyzer">
              <div className="sf-a-head">
                Your hand · deadwood <strong>{analysis.points}</strong> · <span className="legend">green = meld</span>
                {analysis.points === 0 && hand.length >= g.handSize && <span className="fk-good"> · ready to Pay Me!</span>}
              </div>
              <SortToggle mode={sortMode} onChange={setSortMode} />
              <div className="sf-hand">
                {sorted.map((c) => (
                  <Chip
                    key={c.id}
                    c={c}
                    wild={isWild(c, wild)}
                    inMeld={meldedIds.has(c.id)}
                    selected={sel === c.id}
                    isNew={g.drawnId === c.id}
                    onClick={canDiscard ? () => setSel((s) => (s === c.id ? null : c.id)) : undefined}
                  />
                ))}
              </div>
            </div>

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
                    {payMeCard && (
                      <button className="cr-coach-btn" onClick={() => onPayMe(payMeCard)}>
                        💰 Pay Me!
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
