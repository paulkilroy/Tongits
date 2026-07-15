import { useEffect, useMemo, useRef, useState } from "react";
import { type Card, cardId, cardLabel, cardPoints, SUIT_CLASS } from "../engine/cards";
import { bestMelds } from "../engine/meldFinder";
import { type GinState, deadwoodPts, canKnock, KNOCK_MAX, TARGET } from "./game";
import { sortHand, type SortMode } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";
import { GameScreen, ScoreRow, DiscardPiles, HandPanel, type CardDragProps } from "../ui/CardTable";
import { ReviewReplay } from "../ui/ReviewReplay";
import { reviewGinHand, type GinObs } from "./review";
import { analyzeGinTurns } from "./analysis";

function Chip({
  c,
  onClick,
  dim,
  selected,
  isNew,
  inMeld,
  mini,
  drag,
}: {
  c: Card;
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
      label={cardLabel(c)}
      suitClass={SUIT_CLASS[c.suit]}
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
  const [fanned, setFanned] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewStep, setReviewStep] = useState(0);
  useEffect(() => setSel(null), [g.current, g.phase]);
  // The discard fan stays open until your turn ends, then folds away on its own.
  useEffect(() => {
    if (!myTurn) setFanned(false);
  }, [myTurn]);

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
  const knockReview = showReview ? reviewGinHand(obsRef.current).knock : null;
  const reviewTurns = useMemo(() => (showReview ? analyzeGinTurns(obsRef.current) : []), [showReview]);

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
    <GameScreen title={title} onExit={onExit}>
        <ScoreRow
          players={g.players.map((p, i) => ({
            name: i === me ? "You" : p.name,
            score: p.score,
            active: g.current === i && !g.result,
            sub: (
              <div className="cr-track">
                <div className="cr-track-fill" style={{ width: `${Math.min(100, (p.score / TARGET) * 100)}%` }} />
              </div>
            ),
          }))}
        />
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
                <button
                  className="cr-coach-btn"
                  onClick={() => {
                    setReviewStep(0);
                    setShowReview(true);
                  }}
                >
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
            <DiscardPiles
              stockCount={g.deck.length}
              canDrawStock={myTurn && g.phase === "draw"}
              onDrawStock={() => onDraw("deck")}
              discard={g.discard}
              topCard={discardTop ?? null}
              canTakeDiscard={myTurn && g.phase === "draw" && !!discardTop}
              onTakeDiscard={() => onDraw("discard")}
              renderCard={(c, mini) => <Chip c={c} mini={mini} />}
              fanned={fanned}
              setFanned={setFanned}
            />

            <HandPanel
              cards={hand}
              sorted={sorted}
              idOf={cardId}
              sortMode={sortMode}
              onSortChange={setSortMode}
              onTapCard={(c) => {
                if (canDiscard) setSel((s) => (s === cardId(c) ? null : cardId(c)));
              }}
              header={
                <>
                  Your hand · deadwood <strong>{deadPts}</strong> · <span className="legend">green = meld</span>
                  {deadPts === 0 && hand.length >= 7 && <span className="fk-good"> · Gin!</span>}
                </>
              }
              renderCard={(c, drag) => (
                <Chip
                  key={cardId(c)}
                  c={c}
                  inMeld={meldedIds.has(cardId(c))}
                  selected={sel === cardId(c)}
                  isNew={g.drawnId === cardId(c)}
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

        {showReview && reviewTurns.length > 0 && (
          <div className="reveal-backdrop" onClick={() => setShowReview(false)}>
            <div className="reveal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <h2 className="reveal-title">Hand review</h2>
              <ReviewReplay
                turns={reviewTurns}
                step={reviewStep}
                setStep={setReviewStep}
                discardTitle="If you discard… · chance of success"
                extra={(_t, i) =>
                  knockReview && i === reviewTurns.length - 1 ? (
                    <div className="rp-section">
                      <div className="rp-label">Your knock</div>
                      <div className="replay">
                        <div className="rp-nav-mid" style={{ justifyContent: "flex-start" }}>
                          <span
                            className={`rv-grade grade-${
                              knockReview.verdict === "risky" ? "mistake" : knockReview.verdict === "fair" ? "good" : "best"
                            }`}
                          >
                            {knockReview.verdict === "gin"
                              ? "Gin"
                              : knockReview.verdict === "strong"
                                ? "Strong knock"
                                : knockReview.verdict === "fair"
                                  ? "Fair knock"
                                  : "Risky knock"}
                          </span>
                        </div>
                        <div className="rv-reason">{knockReview.note}</div>
                      </div>
                    </div>
                  ) : null
                }
              />
              <div className="modal-actions">
                <button onClick={() => setShowReview(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
    </GameScreen>
  );
}
