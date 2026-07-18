import { useEffect, useMemo, useRef, useState } from "react";
import { type Suit, SUITS, SUIT_CLASS } from "../engine/cards";
import { type RCard, isWild, rlabel, isJoker, ord, type Rank } from "./rules";
import { analyze } from "./meld";
import { type SFState, discard as sfDiscard } from "./game";
import { type SortMode } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";
import { RummyBoard, type Chip, type RummyCard } from "../ui/RummyBoard";
import { ReviewModal } from "../ui/ReviewModal";
import { CardDeepDive, topDiscards, deepRows } from "../ui/CardDeepDive";
import { sixtyFiveReviewToText, type SFObs } from "./analysis";
import { sixtyFiveAutopsy, type SixtyFiveOutcome } from "./winodds";
import { useReviewWorker } from "../ui/useReviewWorker";

/** A 65 card render function bound to this hand's wild rank. */
function chip65(wild: Rank | null): Chip<RCard> {
  return (c, o) => (
    <PlayingCard
      key={c.id}
      label={rlabel(c)}
      suitClass={isJoker(c) ? "" : SUIT_CLASS[c.suit as Suit]}
      joker={isJoker(c)}
      wild={o.wild ?? isWild(c, wild)}
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
}

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

// Outcome buckets for the 65 deep-dive bar, wins (green) then losses (red).
const SF_SEGMENTS: { key: keyof SixtyFiveOutcome; label: string; cls: string }[] = [
  { key: "youOut", label: "you go out", cls: "w1" },
  { key: "youLow", label: "you're lowest", cls: "w2" },
  { key: "oppOut", label: "opponent out", cls: "l1" },
  { key: "youHigh", label: "you're higher", cls: "l2" },
];
const SF_SAMPLES = 250;

function SixtyFiveDeepDive({ state, me, yourDiscardId }: { state?: SFState; me: number; yourDiscardId: string }) {
  if (!state) return null;
  const decision = state;
  const wildR = decision.wildRank;
  return (
    <CardDeepDive
      samples={SF_SAMPLES}
      compute={() => {
        const hand = decision.players[me].hand;
        const cands = topDiscards(hand, (c) => c.id, (c) => analyze(hand.filter((x) => x.id !== c.id), wildR).points, yourDiscardId);
        return deepRows(cands, {
          cardId: (c) => c.id,
          label: rlabel,
          yourId: yourDiscardId,
          autopsy: (c, i) => sixtyFiveAutopsy(sfDiscard(decision, c.id), me, SF_SAMPLES, ((i + 1) * 0x9e3779b1) >>> 0),
          segments: SF_SEGMENTS,
          legend: (o) => (
            <>
              wins — go out {Math.round(o.youOut * 100)}% · lowest {Math.round(o.youLow * 100)}%
              <br />
              losses — opp out {Math.round(o.oppOut * 100)}% · higher {Math.round(o.youHigh * 100)}%
            </>
          ),
        });
      }}
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
  const [showReview, setShowReview] = useState(false);

  const chip = useMemo(() => chip65(wild), [wild]);
  const card = useMemo<RummyCard<RCard>>(
    () => ({
      id: (c) => c.id,
      chip,
      meldedIds: (h) => new Set(analyze(h, wild).melds.flat().map((c) => c.id)),
      sort: (h, mode) => sortRHand(h, mode, wild),
      deadwood: (h) => analyze(h, wild).points,
    }),
    [wild, chip],
  );

  // Record my turns this hand for the post-hand review (pre-discard hand + the card
  // I threw). Resets each hand (handSize increments 3→13).
  const obsRef = useRef<SFObs>({ myTurns: [], wildRank: wild });
  const pendRef = useRef<{ hand: RCard[]; state: SFState } | null>(null);
  const handRef = useRef(g.handSize);
  useEffect(() => {
    if (g.handSize !== handRef.current) {
      handRef.current = g.handSize;
      obsRef.current = { myTurns: [], wildRank: g.wildRank };
      pendRef.current = null;
    }
    const hp = g.players[me].hand;
    if (g.current === me && g.phase === "discard" && hp.length === g.handSize + 1 && !pendRef.current) {
      pendRef.current = { hand: hp.map((c) => ({ ...c })), state: structuredClone(g) };
    } else if (pendRef.current && hp.length === g.handSize) {
      const { hand: snap, state } = pendRef.current;
      const disc = snap.find((c) => !hp.some((x) => x.id === c.id));
      if (disc) obsRef.current.myTurns.push({ hand: snap, discarded: disc, state });
      pendRef.current = null;
    }
  }, [g, me, wild]);

  const hasHand = showReview && obsRef.current.myTurns.length > 0;
  const mc = useReviewWorker("65", showReview ? obsRef.current : null);
  const reviewTurns = mc.turns ?? [];

  const analysis = useMemo(() => analyze(hand, wild), [hand, wild]);

  const reveal =
    g.phase === "roundEnd" && g.reveals ? (
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
                  {m.map((c) => chip(c, { mini: true }))}
                </span>
              ))}
              {r.deadwood.length > 0 && (
                <span className="sf-dead">{r.deadwood.map((c) => chip(c, { dim: true, mini: true, wild: false }))}</span>
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
              {g.handSize >= 13 ? "Finish" : "Next hand"}
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
      toText={() => sixtyFiveReviewToText(reviewTurns)}
      onClose={() => setShowReview(false)}
      discardTitle="If you discard… · chance of success"
      progress={mc.progress}
      progressLabel="Simulating your hand"
      showGraph
      caption={() => <span className="wg-legend">simulated · dot colour = grade</span>}
      extra={(t, i) => (
        <SixtyFiveDeepDive key={i} state={obsRef.current.myTurns[i]?.state} me={me} yourDiscardId={t.yourDiscard ?? ""} />
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
      card={card}
      roundInfo={`Hand ${g.handSize} of 13 · wild: joker${wild ? ` + ${wild}s` : ""} · lowest wins`}
      handHint={analysis.points === 0 && hand.length >= g.handSize ? <span className="fk-good"> · ready to Pay Me!</span> : null}
      scorePlayers={g.players.map((p, i) => ({
        name: i === me ? "You" : p.name,
        score: p.total,
        active: g.current === i && !g.result,
        sub: g.reveals ? <div className="cr-lbl">+{g.reveals[i].points} this hand</div> : undefined,
      }))}
      onDraw={onDraw}
      onDiscard={onDiscard}
      declare={(sel) => {
        if (hand.length - 1 !== g.handSize) return null;
        let pid = sel && analyze(hand.filter((x) => x.id !== sel), wild).points === 0 ? sel : null;
        if (!pid) for (const c of hand) if (analyze(hand.filter((x) => x.id !== c.id), wild).points === 0) { pid = c.id; break; }
        if (!pid) return null;
        const payId = pid;
        return { id: payId, label: "💰 Pay Me!", onClick: () => onPayMe(payId) };
      }}
      reveal={reveal}
      onNewGame={onNewGame}
      reviewModal={reviewModal}
    />
  );
}
