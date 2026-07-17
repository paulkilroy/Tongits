import { useEffect, useMemo, useRef, useState } from "react";
import { type Suit, SUITS, SUIT_CLASS } from "../engine/cards";
import { type RCard, isWild, rlabel, isJoker, ord, type Rank } from "./rules";
import { analyze } from "./meld";
import { type SFState, discard as sfDiscard } from "./game";
import { type SortMode } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";
import { GameScreen, ScoreRow, DiscardPiles, HandPanel, type CardDragProps } from "../ui/CardTable";
import { ReviewModal } from "../ui/ReviewModal";
import { WinGraph } from "../ui/WinGraph";
import { DeepDivePanel, type DeepRow } from "../ui/DeepDivePanel";
import { analyzeSixtyFiveTurns, sixtyFiveReviewToText, type SFObs } from "./analysis";
import { sixtyFiveAutopsy, type SixtyFiveOutcome } from "./winodds";
import { useReviewWorker } from "../ui/useReviewWorker";

// Outcome buckets for the 65 deep-dive bar, wins (green) then losses (red).
const SF_SEGMENTS: { key: keyof SixtyFiveOutcome; label: string; cls: string }[] = [
  { key: "youOut", label: "you go out", cls: "w1" },
  { key: "youLow", label: "you're lowest", cls: "w2" },
  { key: "oppOut", label: "opponent out", cls: "l1" },
  { key: "youHigh", label: "you're higher", cls: "l2" },
];
const SF_SAMPLES = 250;

// On-demand Monte-Carlo autopsy for one 65 turn (top discards + your actual).
function SixtyFiveDeepDive({ state, me, yourDiscardId }: { state?: SFState; me: number; yourDiscardId: string }) {
  const [rows, setRows] = useState<DeepRow[] | null>(null);
  const [running, setRunning] = useState(false);
  if (!state) return null;
  const decision = state;
  function run() {
    setRunning(true);
    setRows(null);
    setTimeout(() => {
      const hand = decision.players[me].hand;
      const wildR = decision.wildRank;
      const byDw = hand
        .map((c) => ({ c, dw: analyze(hand.filter((x) => x.id !== c.id), wildR).points }))
        .sort((a, b) => a.dw - b.dw);
      const chosen = new Map<string, RCard>();
      for (const { c } of byDw.slice(0, 2)) chosen.set(c.id, c);
      const yourC = hand.find((c) => c.id === yourDiscardId);
      if (yourC) chosen.set(yourDiscardId, yourC);
      const results: DeepRow[] = [...chosen.values()]
        .map((c, i) => {
          const o = sixtyFiveAutopsy(sfDiscard(decision, c.id), me, SF_SAMPLES, ((i + 1) * 0x9e3779b1) >>> 0);
          return {
            label: `Discard ${rlabel(c)}`,
            isYours: c.id === yourDiscardId,
            pct: Math.round(o.winPct * 100),
            segs: SF_SEGMENTS.map((s) => ({ cls: s.cls, frac: o[s.key] as number, label: s.label })),
            legend: (
              <>
                wins — go out {Math.round(o.youOut * 100)}% · lowest {Math.round(o.youLow * 100)}%
                <br />
                losses — opp out {Math.round(o.oppOut * 100)}% · higher {Math.round(o.youHigh * 100)}%
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
          {running ? "running…" : `run ${SF_SAMPLES} sims`}
        </button>
      </div>
      {!rows && !running && (
        <div className="rp-disc-more">Play this turn's top discards out {SF_SAMPLES}× each — see how the hands end.</div>
      )}
      {rows && <DeepDivePanel rows={rows} />}
    </div>
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
  const [showReview, setShowReview] = useState(false);
  // Clear the selection when the turn/phase changes.
  useEffect(() => setSel(null), [g.current, g.phase, g.handSize]);
  // The discard fan stays open until your turn ends, then folds away on its own.
  useEffect(() => {
    if (!myTurn) setFanned(false);
  }, [myTurn]);

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
      pendRef.current = { hand: hp.map((c) => ({ ...c })), state: structuredClone(g) }; // snapshot before the discard
    } else if (pendRef.current && hp.length === g.handSize) {
      const { hand: snap, state } = pendRef.current;
      const disc = snap.find((c) => !hp.some((x) => x.id === c.id));
      if (disc) obsRef.current.myTurns.push({ hand: snap, discarded: disc, state });
      pendRef.current = null;
    }
  }, [g, me, wild]);
  const heuristicTurns = useMemo(() => (showReview ? analyzeSixtyFiveTurns(obsRef.current) : []), [showReview]);
  // Refine the odds with real Monte-Carlo off the main thread; show heuristic meanwhile.
  const mc = useReviewWorker("65", showReview ? obsRef.current : null);
  const reviewTurns = mc.turns ?? heuristicTurns;

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

        {showReview && reviewTurns.length > 0 && (
          <ReviewModal
            title="Hand review"
            turns={reviewTurns}
            toText={() => sixtyFiveReviewToText(reviewTurns)}
            onClose={() => setShowReview(false)}
            discardTitle="If you discard… · chance of success"
            header={(step, setStep) => (
              <>
                <div className="wg-caption">
                  <span className="wg-legend">
                    {mc.turns ? "simulated · dot colour = grade" : `refining with sims… ${Math.round(mc.progress * 100)}%`}
                  </span>
                </div>
                {reviewTurns.length > 1 && (
                  <WinGraph turns={reviewTurns} current={Math.min(step, reviewTurns.length - 1)} onSelect={setStep} />
                )}
              </>
            )}
            extra={(t, i) => (
              <SixtyFiveDeepDive key={i} state={obsRef.current.myTurns[i]?.state} me={me} yourDiscardId={t.yourDiscard ?? ""} />
            )}
          />
        )}
    </GameScreen>
  );
}
