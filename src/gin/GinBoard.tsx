import { useEffect, useMemo, useRef, useState } from "react";
import { type Card, cardId, cardLabel, cardPoints, SUIT_CLASS } from "../engine/cards";
import { bestMelds } from "../engine/meldFinder";
import { type GinState, discard, deadwoodPts, canKnock, KNOCK_MAX, TARGET } from "./game";
import { ginAutopsy, type GinOutcome } from "./winodds";
import { DeepDivePanel, type DeepRow } from "../ui/DeepDivePanel";
import { sortHand, type SortMode } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";
import { GameScreen, ScoreRow, DiscardPiles, HandPanel, type CardDragProps } from "../ui/CardTable";
import { ReviewModal } from "../ui/ReviewModal";
import { WinGraph } from "../ui/WinGraph";
import { useReviewWorker } from "../ui/useReviewWorker";
import { reviewGinHand, type GinObs } from "./review";
import { analyzeGinTurns, ginReviewToText } from "./analysis";

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

// Outcome buckets for the deep-dive bar, wins first (green) then losses (red).
const GIN_SEGMENTS: { key: keyof GinOutcome; label: string; cls: string }[] = [
  { key: "youGin", label: "you go Gin", cls: "w1" },
  { key: "youKnock", label: "you knock & win", cls: "w2" },
  { key: "youUndercut", label: "you undercut", cls: "w3" },
  { key: "oppKnock", label: "opponent wins", cls: "l1" },
  { key: "youUndercutLoss", label: "you get undercut", cls: "l2" },
];

const SAMPLES = 300;

// On-demand Monte-Carlo autopsy for one turn: play this turn's top discards out many
// times (re-dealing the hidden opponent hand) and show how the hands actually end.
// Runs on the main thread after a paint tick — a couple seconds' work behind a
// "running…" label. (A worker is the proper fix for a fully smooth spinner.)
function GinDeepDive({ state, me, yourDiscardId }: { state?: GinState; me: number; yourDiscardId: string }) {
  const [rows, setRows] = useState<DeepRow[] | null>(null);
  const [running, setRunning] = useState(false);
  if (!state) return null;
  const decision = state;

  function run() {
    setRunning(true);
    setRows(null);
    setTimeout(() => {
      const hand = decision.players[me].hand;
      const byDw = hand
        .map((c) => ({ c, dw: deadwoodPts(hand.filter((x) => cardId(x) !== cardId(c))) }))
        .sort((a, b) => a.dw - b.dw);
      const chosen = new Map<string, Card>();
      for (const { c } of byDw.slice(0, 2)) chosen.set(cardId(c), c); // the two lowest-deadwood throws
      const yourC = hand.find((c) => cardId(c) === yourDiscardId);
      if (yourC) chosen.set(yourDiscardId, yourC); // always include what you actually threw
      const results: DeepRow[] = [...chosen.values()]
        .map((c, i) => {
          const o = ginAutopsy(discard(decision, cardId(c)), me, SAMPLES, ((i + 1) * 0x9e3779b1) >>> 0);
          return {
            label: `Discard ${cardLabel(c)}`,
            isYours: cardId(c) === yourDiscardId,
            pct: Math.round(o.winPct * 100),
            segs: GIN_SEGMENTS.map((s) => ({ cls: s.cls, frac: o[s.key] as number, label: s.label })),
            legend: (
              <>
                wins — Gin {Math.round(o.youGin * 100)}% · knock {Math.round(o.youKnock * 100)}% · undercut{" "}
                {Math.round(o.youUndercut * 100)}%
                <br />
                losses — opp {Math.round(o.oppKnock * 100)}% · got undercut {Math.round(o.youUndercutLoss * 100)}%
              </>
            ),
          };
        })
        .sort((a, b) => b.pct - a.pct);
      setRows(results);
      setRunning(false);
    }, 20);
  }

  return (
    <div className="rp-section">
      <div className="rp-label">
        Deep dive
        <button className="dd-run" onClick={run} disabled={running}>
          {running ? "running…" : `run ${SAMPLES} sims`}
        </button>
      </div>
      {!rows && !running && (
        <div className="rp-disc-more">
          Play this turn's top discards out {SAMPLES}× each — see how the hands actually end.
        </div>
      )}
      {rows && <DeepDivePanel rows={rows} />}
    </div>
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
  const pendingRef = useRef<Record<number, { drewDiscard: boolean; hand8?: Card[]; state?: GinState }>>({});
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
        // just drew, about to discard — snapshot my decision state so the deep-dive
        // can play each candidate discard out from here.
        pendingRef.current[p] = {
          drewDiscard: g.drewFrom === "discard",
          hand8: p === me ? hp.map((c) => ({ rank: c.rank, suit: c.suit })) : undefined,
          state: p === me ? structuredClone(g) : undefined,
        };
      } else if (pendingRef.current[p] && hp.length === 7) {
        const pend = pendingRef.current[p];
        const top = g.discard[g.discard.length - 1]; // whatever they just threw
        if (p === me) {
          const disc = pend.hand8?.find((c) => !hp.some((x) => cardId(x) === cardId(c)));
          if (pend.hand8 && disc)
            obsRef.current.myTurns.push({ hand8: pend.hand8, discarded: disc, drewDiscard: pend.drewDiscard, state: pend.state });
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
  const heuristicTurns = useMemo(() => (showReview ? analyzeGinTurns(obsRef.current) : []), [showReview]);
  // Refine the odds with real Monte-Carlo off the main thread; show heuristic meanwhile.
  const mc = useReviewWorker("gin", showReview ? obsRef.current : null);
  const reviewTurns = mc.turns ?? heuristicTurns;

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
                  onClick={() => setShowReview(true)}
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
          <ReviewModal
            title="Hand review"
            turns={reviewTurns}
            toText={() => ginReviewToText(reviewTurns, knockReview)}
            onClose={() => setShowReview(false)}
            discardTitle="If you discard… · chance of success"
            header={(step, setStep) => (
              <>
                <div className="wg-caption">
                  Chance of success · {reviewTurns[0].yourPct}% →{" "}
                  <strong>{reviewTurns[reviewTurns.length - 1].yourPct}%</strong>
                  <span className="wg-legend">
                    {" "}
                    · {mc.turns ? "simulated" : `refining with sims… ${Math.round(mc.progress * 100)}%`}
                  </span>
                </div>
                <WinGraph turns={reviewTurns} current={Math.min(step, reviewTurns.length - 1)} onSelect={setStep} />
              </>
            )}
            extra={(t, i) => (
              <>
                <GinDeepDive state={obsRef.current.myTurns[i]?.state} me={me} yourDiscardId={t.yourDiscard ?? ""} />
                {knockReview && i === reviewTurns.length - 1 && (
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
                )}
              </>
            )}
          />
        )}
    </GameScreen>
  );
}
