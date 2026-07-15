import { useEffect, useMemo, useState } from "react";
import { type Suit, SUITS, SUIT_CLASS } from "../engine/cards";
import { type RCard, isWild, rlabel, isJoker, ord, type Rank } from "./rules";
import { analyze } from "./meld";
import { type SFState } from "./game";
import { type SortMode } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";
import { GameScreen, ScoreRow, DiscardPiles, HandPanel, type CardDragProps } from "../ui/CardTable";

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
  drag,
}: {
  c: RCard;
  wild: boolean;
  onClick?: () => void;
  dim?: boolean;
  selected?: boolean;
  isNew?: boolean;
  inMeld?: boolean;
  mini?: boolean;
  drag?: CardDragProps;
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
      dataCardId={drag?.["data-card-id"]}
      onPointerDown={drag?.onPointerDown}
      onPointerMove={drag?.onPointerMove}
      onPointerUp={drag?.onPointerUp}
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
  const [fanned, setFanned] = useState(false);
  // Clear the selection when the turn/phase changes.
  useEffect(() => setSel(null), [g.current, g.phase, g.handSize]);
  // The discard fan stays open until your turn ends, then folds away on its own.
  useEffect(() => {
    if (!myTurn) setFanned(false);
  }, [myTurn]);

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
    <GameScreen title={title} onExit={onExit}>
        <ScoreRow
          players={g.players.map((p, i) => ({
            name: i === me ? "You" : p.name,
            score: p.total,
            active: g.current === i && !g.result,
            sub: g.reveals ? <div className="cr-lbl">+{g.reveals[i].points} this hand</div> : undefined,
          }))}
        />
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
            <DiscardPiles
              stockCount={g.deck.length}
              canDrawStock={myTurn && g.phase === "draw"}
              onDrawStock={() => onDraw("deck")}
              discard={g.discard}
              topCard={discardTop ?? null}
              canTakeDiscard={myTurn && g.phase === "draw" && !!discardTop}
              onTakeDiscard={() => onDraw("discard")}
              renderCard={(c, mini) => <Chip c={c} wild={isWild(c, wild)} mini={mini} />}
              fanned={fanned}
              setFanned={setFanned}
            />

            <HandPanel
              cards={hand}
              sorted={sorted}
              idOf={(c) => c.id}
              sortMode={sortMode}
              onSortChange={setSortMode}
              onTapCard={(c) => {
                if (canDiscard) setSel((s) => (s === c.id ? null : c.id));
              }}
              header={
                <>
                  Your hand · deadwood <strong>{analysis.points}</strong> · <span className="legend">green = meld</span>
                  {analysis.points === 0 && hand.length >= g.handSize && <span className="fk-good"> · ready to Pay Me!</span>}
                </>
              }
              renderCard={(c, drag) => (
                <Chip
                  key={c.id}
                  c={c}
                  wild={isWild(c, wild)}
                  inMeld={meldedIds.has(c.id)}
                  selected={sel === c.id}
                  isNew={g.drawnId === c.id}
                  drag={drag}
                />
              )}
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
    </GameScreen>
  );
}
