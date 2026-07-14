import { useEffect, useMemo, useRef, useState } from "react";
import { BackButton } from "../ui/Icon";
import { type Card, cardId, cardLabel, cardPoints, SUIT_CLASS } from "../engine/cards";
import { bestMelds } from "../engine/meldFinder";
import { type GinState, deadwoodPts, canKnock, KNOCK_MAX, TARGET } from "./game";
import { SortToggle, sortHand, type SortMode } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";
import { DiscardHistory } from "../ui/DiscardHistory";
import { reviewGinHand, type GinObs } from "./review";

function Chip({
  c,
  onClick,
  dim,
  selected,
  isNew,
  inMeld,
  mini,
}: {
  c: Card;
  onClick?: () => void;
  dim?: boolean;
  selected?: boolean;
  isNew?: boolean;
  inMeld?: boolean;
  mini?: boolean;
}) {
  return (
    <PlayingCard
      label={cardLabel(c)}
      suitClass={SUIT_CLASS[c.suit]}
      dim={dim}
      mini={mini}
      selected={selected}
      isNew={isNew}
      inMeld={inMeld}
      onClick={onClick}
    />
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

  const [sel, setSel] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("suit");
  const [showDiscards, setShowDiscards] = useState(false);
  const [showReview, setShowReview] = useState(false);
  useEffect(() => setSel(null), [g.current, g.phase]);

  // Record this hand's observations for the post-hand coach: my own turns (hand +
  // discard) plus what's OBSERVABLE about the opponent — their pickups off the pile
  // and turn count. We see intermediate states because each draw/discard is its own
  // update. Resets when a new hand is dealt.
  const obsRef = useRef<GinObs>({ myTurns: [], oppPickups: 0, oppTurns: 0, oppDiscards: [] });
  const pendingRef = useRef<Record<number, { drewDiscard: boolean; hand8?: Card[] }>>({});
  const handNoRef = useRef(g.handNo);
  useEffect(() => {
    if (g.handNo !== handNoRef.current) {
      handNoRef.current = g.handNo;
      obsRef.current = { myTurns: [], oppPickups: 0, oppTurns: 0, oppDiscards: [] };
      pendingRef.current = {};
    }
    for (let p = 0; p < g.players.length; p++) {
      const hp = g.players[p].hand;
      if (g.current === p && g.phase === "discard" && hp.length === 8 && !pendingRef.current[p]) {
        // just drew, about to discard
        pendingRef.current[p] = {
          drewDiscard: g.drewFrom === "discard",
          hand8: p === me ? hp.map((c) => ({ rank: c.rank, suit: c.suit })) : undefined,
        };
      } else if (pendingRef.current[p] && hp.length === 7) {
        const pend = pendingRef.current[p];
        const top = g.discard[g.discard.length - 1]; // whatever they just threw
        if (p === me) {
          const disc = pend.hand8?.find((c) => !hp.some((x) => cardId(x) === cardId(c)));
          if (pend.hand8 && disc) obsRef.current.myTurns.push({ hand8: pend.hand8, discarded: disc, drewDiscard: pend.drewDiscard });
        } else {
          obsRef.current.oppTurns += 1;
          if (pend.drewDiscard) obsRef.current.oppPickups += 1;
          if (top) obsRef.current.oppDiscards.push({ rank: top.rank, suit: top.suit });
        }
        delete pendingRef.current[p];
      }
    }
  }, [g, me]);
  const review = showReview ? reviewGinHand(obsRef.current) : null;

  const meldedIds = useMemo(() => new Set(bestMelds(hand).flatMap((m) => m.cards.map(cardId))), [hand]);
  const sorted = useMemo(() => sortHand(hand, sortMode), [hand, sortMode]);
  const deadPts = deadwoodPts(hand);
  const canDiscard = myTurn && g.phase === "discard";
  // A card we can knock/gin with — prefer the selected one.
  const knockCardId = useMemo(() => {
    if (!canDiscard) return null;
    if (sel && canKnock(g, sel)) return sel;
    for (const c of hand) if (canKnock(g, cardId(c))) return cardId(c);
    return null;
  }, [g, hand, canDiscard, sel]);
  const knockGin = knockCardId ? deadwoodPts(hand.filter((c) => cardId(c) !== knockCardId)) === 0 : false;

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
            {[
              { seat: g.round.knocker, melds: g.round.knockerMelds, dead: g.round.knockerDeadwood, tag: "knocks" },
              {
                seat: (g.round.knocker + 1) % 2,
                melds: g.round.defenderMelds,
                dead: g.round.defenderDeadwood,
                tag: "defends",
              },
            ].map(({ seat, melds, dead, tag }) => (
              <div className="sf-reveal" key={seat}>
                <div className="sf-reveal-name">
                  {seat === me ? "You" : g.players[seat].name} · {tag} ·{" "}
                  <strong>{dead.reduce((a, c) => a + cardPoints(c), 0)} deadwood</strong>
                </div>
                <div className="sf-melds">
                  {melds.map((m, k) => (
                    <span className="sf-meld" key={k}>
                      {m.map((c) => (
                        <Chip key={cardId(c)} c={c} mini />
                      ))}
                    </span>
                  ))}
                  {dead.length > 0 && (
                    <span className="sf-dead">
                      {dead.map((c) => (
                        <Chip key={cardId(c)} c={c} dim mini />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div className="cr-row2">
              {obsRef.current.myTurns.length > 0 && (
                <button className="cr-coach-btn" onClick={() => setShowReview(true)}>
                  🔍 Review my hand
                </button>
              )}
              {onNextRound ? (
                <button className="big play-primary" onClick={onNextRound}>
                  Next hand
                </button>
              ) : (
                <div className="cr-lbl">waiting for the next hand…</div>
              )}
            </div>
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
                <span className="cr-lbl">take discard</span>
              </button>
              {g.discard.length > 0 && (
                <button className="sf-histfan" onClick={() => setShowDiscards(true)} title="see all discards">
                  <span className="histfan-cards">
                    {g.discard.slice(-3).map((c, i) => (
                      <span className="histfan-card" key={i}>
                        <Chip c={c} mini />
                      </span>
                    ))}
                  </span>
                  <span className="cr-lbl">all {g.discard.length}</span>
                </button>
              )}
            </div>

            {showDiscards && (
              <DiscardHistory count={g.discard.length} onClose={() => setShowDiscards(false)}>
                {[...g.discard].reverse().map((c, i) => (
                  <Chip key={`${cardId(c)}-${i}`} c={c} mini />
                ))}
              </DiscardHistory>
            )}

            <div className="sf-analyzer">
              <div className="sf-a-head">
                Your hand · deadwood <strong>{deadPts}</strong> · <span className="legend">green = meld</span>
                {deadPts === 0 && hand.length >= 7 && <span className="fk-good"> · Gin!</span>}
              </div>
              <SortToggle mode={sortMode} onChange={setSortMode} />
              <div className="sf-hand">
                {sorted.map((c) => (
                  <Chip
                    key={cardId(c)}
                    c={c}
                    inMeld={meldedIds.has(cardId(c))}
                    selected={sel === cardId(c)}
                    isNew={g.drawnId === cardId(c)}
                    onClick={canDiscard ? () => setSel((s) => (s === cardId(c) ? null : cardId(c))) : undefined}
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
                    {knockCardId && (
                      <button className="cr-coach-btn" onClick={() => onKnock(knockCardId)}>
                        {knockGin ? "✊ Gin!" : "✊ Knock"}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {review && (
          <div className="reveal-backdrop" onClick={() => setShowReview(false)}>
            <div className="reveal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <h2 className="reveal-title">Hand review</h2>
              {review.knock && (
                <div
                  className={`gin-knock grade-${
                    review.knock.verdict === "gin" || review.knock.verdict === "strong"
                      ? "best"
                      : review.knock.verdict === "fair"
                        ? "good"
                        : "mistake"
                  }`}
                >
                  <strong className={`grade-${review.knock.verdict === "risky" ? "mistake" : review.knock.verdict === "fair" ? "good" : "best"}`}>
                    {review.knock.verdict === "gin"
                      ? "Gin"
                      : review.knock.verdict === "strong"
                        ? "Strong knock"
                        : review.knock.verdict === "fair"
                          ? "Fair knock"
                          : "Risky knock"}
                  </strong>{" "}
                  · {review.knock.note}
                </div>
              )}
              <p className="cr-lbl">per-turn discards</p>
              <div className="gin-review">
                {review.turns.map((t) => (
                  <div className={`gin-rev-turn grade-${t.grade}`} key={t.n}>
                    <span className="gin-rev-n">T{t.n}</span>
                    <span className="gin-rev-threw">
                      threw <PlayingCard label={cardLabel(t.discarded)} suitClass={SUIT_CLASS[t.discarded.suit]} mini />
                    </span>
                    <span className="gin-rev-note">
                      <strong className={`grade-${t.grade}`}>{t.grade}</strong>
                      {t.grade !== "best" && ` · ${t.note}`} · {t.deadwoodAfter} dw
                    </span>
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button onClick={() => setShowReview(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
