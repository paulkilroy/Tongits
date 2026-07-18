import { useEffect, useRef, useState } from "react";
import { type Card, cardId, cardLabel, cardPoints, SUIT_CLASS } from "../engine/cards";
import { bestMelds } from "../engine/meldFinder";
import { type GinState, discard, deadwoodPts, canKnock, KNOCK_MAX, TARGET } from "./game";
import { ginAutopsy, type GinOutcome } from "./winodds";
import { CardDeepDive, topDiscards, deepRows } from "../ui/CardDeepDive";
import { sortHand } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";
import { RummyBoard, type Chip, type RummyCard } from "../ui/RummyBoard";
import { ReviewModal } from "../ui/ReviewModal";
import { useReviewWorker } from "../ui/useReviewWorker";
import { reviewGinHand, type GinObs } from "./review";
import { ginReviewToText } from "./analysis";

const chip: Chip<Card> = (c, o) => (
  <PlayingCard
    key={cardId(c)}
    label={cardLabel(c)}
    suitClass={SUIT_CLASS[c.suit]}
    dim={o.dim}
    mini={o.mini}
    selected={o.selected}
    isNew={o.isNew}
    inMeld={o.inMeld}
    dataCardId={o.drag?.["data-card-id"]}
    onPointerDown={o.drag?.onPointerDown}
    onPointerMove={o.drag?.onPointerMove}
    onPointerUp={o.drag?.onPointerUp}
  />
);

const ginCard: RummyCard<Card> = {
  id: cardId,
  chip,
  meldedIds: (h) => new Set(bestMelds(h).flatMap((m) => m.cards.map(cardId))),
  sort: sortHand,
  deadwood: deadwoodPts,
};

// Outcome buckets for the deep-dive bar, wins first (green) then losses (red).
const GIN_SEGMENTS: { key: keyof GinOutcome; label: string; cls: string }[] = [
  { key: "youGin", label: "you go Gin", cls: "w1" },
  { key: "youKnock", label: "you knock & win", cls: "w2" },
  { key: "youUndercut", label: "you undercut", cls: "w3" },
  { key: "oppKnock", label: "opponent wins", cls: "l1" },
  { key: "youUndercutLoss", label: "you get undercut", cls: "l2" },
];
const SAMPLES = 300;

function GinDeepDive({ state, me, yourDiscardId }: { state?: GinState; me: number; yourDiscardId: string }) {
  if (!state) return null;
  const decision = state;
  return (
    <CardDeepDive
      samples={SAMPLES}
      compute={() => {
        const hand = decision.players[me].hand;
        const cands = topDiscards(hand, cardId, (c) => deadwoodPts(hand.filter((x) => cardId(x) !== cardId(c))), yourDiscardId);
        return deepRows(cands, {
          cardId,
          label: cardLabel,
          yourId: yourDiscardId,
          autopsy: (c, i) => ginAutopsy(discard(decision, cardId(c)), me, SAMPLES, ((i + 1) * 0x9e3779b1) >>> 0),
          segments: GIN_SEGMENTS,
          legend: (o) => (
            <>
              wins — Gin {Math.round(o.youGin * 100)}% · knock {Math.round(o.youKnock * 100)}% · undercut{" "}
              {Math.round(o.youUndercut * 100)}%
              <br />
              losses — opp {Math.round(o.oppKnock * 100)}% · got undercut {Math.round(o.youUndercutLoss * 100)}%
            </>
          ),
        });
      }}
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
  const [showReview, setShowReview] = useState(false);

  // Record this hand's observations for the post-hand coach: my own turns (hand +
  // discard) plus what's OBSERVABLE about the opponent — pickups off the pile and
  // turn count. Resets when a new hand is dealt.
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
        pendingRef.current[p] = {
          drewDiscard: g.drewFrom === "discard",
          hand8: p === me ? hp.map((c) => ({ rank: c.rank, suit: c.suit })) : undefined,
          state: p === me ? structuredClone(g) : undefined,
        };
      } else if (pendingRef.current[p] && hp.length === 7) {
        const pend = pendingRef.current[p];
        const top = g.discard[g.discard.length - 1];
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
  const hasHand = showReview && obsRef.current.myTurns.length > 0;
  const mc = useReviewWorker("gin", showReview ? obsRef.current : null);
  const reviewTurns = mc.turns ?? [];

  const deadPts = deadwoodPts(hand);

  const reveal =
    g.phase === "roundEnd" && g.round ? (
      <div className="cr-phase">
        <h2 className="sf-h2">
          {g.players[g.round.knocker].name} {g.round.gin ? "goes Gin!" : "knocks"} ·{" "}
          {g.players[g.round.scorer].name} +{g.round.points}
          {g.round.undercut ? " (undercut!)" : ""}
        </h2>
        {[
          { seat: g.round.knocker, melds: g.round.knockerMelds, dead: g.round.knockerDeadwood, tag: "knocks" },
          { seat: (g.round.knocker + 1) % 2, melds: g.round.defenderMelds, dead: g.round.defenderDeadwood, tag: "defends" },
        ].map(({ seat, melds, dead, tag }) => (
          <div className="sf-reveal" key={seat}>
            <div className="sf-reveal-name">
              {seat === me ? "You" : g.players[seat].name} · {tag} ·{" "}
              <strong>{dead.reduce((a, c) => a + cardPoints(c), 0)} deadwood</strong>
            </div>
            <div className="sf-melds">
              {melds.map((m, k) => (
                <span className="sf-meld" key={k}>
                  {m.map((c) => chip(c, { mini: true }))}
                </span>
              ))}
              {dead.length > 0 && <span className="sf-dead">{dead.map((c) => chip(c, { dim: true, mini: true }))}</span>}
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
    ) : null;

  const reviewModal = hasHand ? (
    <ReviewModal
      title="Hand review"
      turns={reviewTurns}
      toText={() => ginReviewToText(reviewTurns, knockReview)}
      onClose={() => setShowReview(false)}
      discardTitle="If you discard… · chance of success"
      progress={mc.progress}
      progressLabel="Simulating your hand"
      showGraph
      caption={(t) => (
        <>
          Chance of success · {t[0].yourPct}% → <strong>{t[t.length - 1].yourPct}%</strong>
          <span className="wg-legend"> · simulated · dot colour = grade</span>
        </>
      )}
      extra={(t, i) => (
        <>
          <GinDeepDive key={i} state={obsRef.current.myTurns[i]?.state} me={me} yourDiscardId={t.yourDiscard ?? ""} />
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
  ) : null;

  return (
    <RummyBoard
      g={g}
      me={me}
      title={title}
      onExit={onExit}
      waiting={waiting}
      flash={g.log.length ? g.log[g.log.length - 1] : null}
      card={ginCard}
      roundInfo={`Gin · knock at ≤${KNOCK_MAX} · first to ${TARGET}`}
      handHint={deadPts === 0 && hand.length >= 7 ? <span className="fk-good"> · Gin!</span> : null}
      scorePlayers={g.players.map((p, i) => ({
        name: i === me ? "You" : p.name,
        score: p.score,
        active: g.current === i && !g.result,
        sub: (
          <div className="cr-track">
            <div className="cr-track-fill" style={{ width: `${Math.min(100, (p.score / TARGET) * 100)}%` }} />
          </div>
        ),
      }))}
      onDraw={onDraw}
      onDiscard={onDiscard}
      declare={(sel) => {
        let kid = sel && canKnock(g, sel) ? sel : null;
        if (!kid) for (const c of hand) if (canKnock(g, cardId(c))) { kid = cardId(c); break; }
        if (!kid) return null;
        const knockId = kid;
        const gin = deadwoodPts(hand.filter((c) => cardId(c) !== knockId)) === 0;
        return { id: knockId, label: gin ? "✊ Gin!" : "✊ Knock", onClick: () => onKnock(knockId) };
      }}
      reveal={reveal}
      onNewGame={onNewGame}
      reviewModal={reviewModal}
    />
  );
}
