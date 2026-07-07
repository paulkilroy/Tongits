import { useEffect, useMemo, useRef, useState } from "react";
import { type Card, cardId, cardLabel, SUIT_CLASS } from "../engine/cards";
import { type CribState, legalPlays, canPlay, roundComplete, discardCount } from "./game";
import { describeShow } from "./scoring";
import { analyzeDiscard, gradeDiscard, type DiscardEval } from "./coach";
import { reviewHand, type HandReview } from "./review";
import { CribReview } from "./CribReview";
import { CribGameReview } from "./CribGameReview";
import { BackButton } from "../ui/Icon";
import { SortToggle, sortHand, type SortMode } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";

export function CribCard({
  card,
  onClick,
  disabled,
  selected,
  mini,
}: {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  mini?: boolean;
}) {
  return (
    <PlayingCard
      label={cardLabel(card)}
      suitClass={SUIT_CLASS[card.suit]}
      mini={mini}
      selected={selected}
      disabled={disabled}
      onClick={onClick}
    />
  );
}

export function ScoreBoard({ g, me }: { g: CribState; me: number }) {
  return (
    <div className="cr-scores">
      {g.players.map((p, i) => (
        <div className={`cr-score ${g.current === i && g.phase === "play" ? "active" : ""}`} key={i}>
          <div className="cr-score-top">
            <span>
              {i === me ? "You" : p.name}
              {g.dealer === i && <span className="cr-dealer" title="dealer">D</span>}
            </span>
            <strong>{p.score}</strong>
          </div>
          <div className="cr-track">
            <div className="cr-track-fill" style={{ width: `${Math.min(100, (p.score / g.rules.target) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface BoardProps {
  g: CribState;
  me: number;
  title: string;
  onExit: () => void;
  onDiscard: (cards: Card[]) => void;
  onPlay: (c: Card) => void;
  onGo: () => void;
  /** Provided → show a "count" button (local pacing). Absent → passive (host drives). */
  onAdvanceShow?: () => void;
  /** Provided → show a "Next hand" button. Absent → wait for the controller. */
  onNextRound?: () => void;
  onNewGame?: () => void;
  /** Is it my turn/step to lay away right now? */
  canDiscard: boolean;
  /** Banner shown while waiting on the opponent/host. */
  waiting?: string | null;
  /** Enable the discard coach for my hand. */
  coach?: boolean;
}

export function CribbageBoard(props: BoardProps) {
  const { g, me, onDiscard, onPlay, onGo, onAdvanceShow, onNextRound, onNewGame, canDiscard, waiting, coach } = props;
  const N = g.players.length;
  const count = discardCount(N); // cards to lay away (2 heads-up, 1 three-hand)
  const opp = (me + 1) % N; // first opponent (review / single references)
  const opponents = g.players.map((_, i) => i).filter((i) => i !== me);
  const canCoach = !!coach && count === 2; // the discard coach is heads-up only
  const [sel, setSel] = useState<Card[]>([]);
  const [showCoach, setShowCoach] = useState(false);
  const [review, setReview] = useState<HandReview | null>(null);
  const [gameReview, setGameReview] = useState(false);
  const [history, setHistory] = useState<{ state: CribState; sig: string }[]>([]);
  const seenLog = useRef(0);
  const [flash, setFlash] = useState<string | null>(null);

  // Record each finished hand (deduped/updated by its deal) for the game review.
  useEffect(() => {
    if (!(roundComplete(g) || g.phase === "gameOver")) return;
    const sig = g.players[me].deal.map(cardId).join(",");
    setHistory((h) => {
      const entry = { state: structuredClone(g), sig };
      if (h.length && h[h.length - 1].sig === sig) return [...h.slice(0, -1), entry];
      return [...h, entry];
    });
  }, [g, me]);

  useEffect(() => {
    if (g.log.length > seenLog.current) {
      seenLog.current = g.log.length;
      setFlash(g.log[g.log.length - 1]);
    } else if (g.log.length < seenLog.current) {
      seenLog.current = g.log.length; // a new round reset the log
    }
  }, [g.log]);

  const [sortMode, setSortMode] = useState<SortMode>("suit");
  const myHand = useMemo(() => sortHand(g.players[me].hand, sortMode), [g.players, me, sortMode]);
  const myLegal = new Set(legalPlays(g, me).map(cardId));
  const myTurn = g.phase === "play" && g.current === me;
  const ownsCrib = g.dealer === me;
  const handKey = myHand.map(cardId).join(",");
  const discardEvs = useMemo<DiscardEval[]>(
    () => (g.phase === "discard" && canDiscard && canCoach ? analyzeDiscard(myHand, ownsCrib) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g.phase, handKey, ownsCrib, canDiscard, canCoach],
  );
  const myKeep = sel.length === count && count === 2 ? myHand.filter((c) => !sel.some((s) => cardId(s) === cardId(c))) : null;
  const myGrade = myKeep && discardEvs.length ? gradeDiscard(discardEvs, myKeep) : null;

  function toggle(c: Card) {
    const id = cardId(c);
    setSel((prev) =>
      prev.some((s) => cardId(s) === id)
        ? prev.filter((s) => cardId(s) !== id)
        : prev.length < count
          ? [...prev, c]
          : prev,
    );
  }
  function confirm() {
    if (sel.length !== count) return;
    onDiscard(sel);
    setSel([]);
    setShowCoach(false);
  }

  // Show order: each hand starting left of the dealer, dealer last, then the crib.
  const showLabel = [
    ...Array.from({ length: N }, (_, k) => (g.dealer + 1 + k) % N).map(
      (who) => "Count " + (who === me ? "your" : g.players[who].name + "’s") + " hand",
    ),
    "Count the crib",
  ];

  return (
    <main className="app screen cribbage">
      {review && (
        <CribReview review={review} me={me} oppName={g.players[opp].name} onClose={() => setReview(null)} />
      )}
      {gameReview && history.length > 0 && (
        <CribGameReview
          hands={history.map((h) => h.state)}
          me={me}
          oppName={g.players[opp].name}
          onClose={() => setGameReview(false)}
        />
      )}
      <div className="screen-head">
        <BackButton onClick={props.onExit} />
        <h1>{props.title}</h1>
        <span />
      </div>

      <div className="screen-body">
        <ScoreBoard g={g} me={me} />
        {flash && <div className="cr-flash">{flash}</div>}
        {waiting && <div className="cr-waiting">{waiting}</div>}

        {/* ---- discard ---- */}
        {g.phase === "discard" &&
          (canDiscard ? (
            <div className="cr-phase">
              <p className="cr-instr">
                Lay {count === 1 ? "1 card" : "2 cards"} into {ownsCrib ? "your" : g.players[g.dealer].name + "’s"} crib.
              </p>
              <SortToggle mode={sortMode} onChange={setSortMode} />
              <div className="cr-hand">
                {myHand.map((c) => (
                  <CribCard
                    key={cardId(c)}
                    card={c}
                    selected={sel.some((s) => cardId(s) === cardId(c))}
                    onClick={() => toggle(c)}
                  />
                ))}
              </div>
              {myGrade && (
                <div className={`cr-mychoice grade-${myGrade.grade}`}>
                  Your keep · {myGrade.grade}
                  {myGrade.lost > 0.3 && <> · gives up {myGrade.lost.toFixed(1)} pts</>}
                </div>
              )}
              <div className="cr-row2">
                {canCoach && (
                  <button className="cr-coach-btn" onClick={() => setShowCoach((v) => !v)}>
                    {showCoach ? "Hide coach" : "💡 Coach"}
                  </button>
                )}
                <button className="reveal-replay cr-discard-btn" disabled={sel.length !== count} onClick={confirm}>
                  Discard {sel.length}/{count}
                </button>
              </div>
              {showCoach && (
                <div className="cr-coach">
                  <div className="cr-lbl">keep these 4 · net EV {ownsCrib ? "(your crib +)" : "(their crib −)"}</div>
                  {discardEvs.slice(0, 6).map((e, i) => {
                    const isMine = myKeep && e.keep.every((c) => myKeep.some((k) => cardId(k) === cardId(c)));
                    return (
                      <div className={`cr-coach-row ${i === 0 ? "best" : ""} ${isMine ? "mine" : ""}`} key={i}>
                        <span className="cr-coach-keep">
                          {e.keep.map((c) => (
                            <CribCard key={cardId(c)} card={c} mini />
                          ))}
                          <span className="cr-coach-toss" title="into the crib">
                            {e.discard.map((c) => (
                              <CribCard key={cardId(c)} card={c} mini />
                            ))}
                          </span>
                        </span>
                        <span className="cr-coach-ev">
                          <strong>{e.net.toFixed(1)}</strong>
                          <span className="cr-coach-split">
                            hand {e.handEV.toFixed(1)} · crib {ownsCrib ? "+" : "−"}
                            {e.cribEV.toFixed(1)}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="cr-phase">
              <p className="cr-instr">{waiting ?? "Waiting for the other player to discard…"}</p>
              {!g.players[me].discarded && <div className="cr-lbl">you’ll lay away next</div>}
            </div>
          ))}

        {/* ---- play ---- */}
        {g.phase === "play" && (
          <div className="cr-phase">
            <div className="cr-board">
              <div className="cr-play-total">
                count <strong>{g.total}</strong> / 31
              </div>
              {g.starter && (
                <div className="cr-cut">
                  <CribCard card={g.starter} mini />
                  <span className="cr-lbl">cut</span>
                </div>
              )}
              <div className="cr-lanes">
                {g.seq.length ? (
                  g.seq.map((c, i) => (
                    <div key={i} className={`cr-laid ${g.seqBy[i] === me ? "mine" : "theirs"}`}>
                      <CribCard card={c} mini />
                    </div>
                  ))
                ) : (
                  <span className="cr-lbl">fresh count</span>
                )}
              </div>
            </div>
            <div className={`cr-turn ${myTurn ? "you" : ""}`}>
              {myTurn
                ? canPlay(g, me)
                  ? "Your turn"
                  : "Your turn — say “Go”"
                : `Waiting for ${g.players[g.current].name}…`}
            </div>
            <div className="cr-oppline">
              {opponents.map((i) => (
                <span key={i} className="cr-opp">
                  {g.players[i].name}: {g.players[i].hand.length} card{g.players[i].hand.length === 1 ? "" : "s"}
                </span>
              ))}
            </div>
            <SortToggle mode={sortMode} onChange={setSortMode} />
            <div className="cr-hand">
              {myHand.map((c) => (
                <CribCard
                  key={cardId(c)}
                  card={c}
                  disabled={!myTurn || !myLegal.has(cardId(c))}
                  onClick={myTurn && myLegal.has(cardId(c)) ? () => onPlay(c) : undefined}
                />
              ))}
            </div>
            {myTurn && !canPlay(g, me) && (
              <button className="reveal-replay" onClick={onGo}>
                Say “Go”
              </button>
            )}
          </div>
        )}

        {/* ---- show ---- */}
        {g.phase === "show" && (
          <div className="cr-phase">
            {g.lastReveal && (
              <div className="cr-reveal">
                <div className="cr-reveal-head">
                  {g.lastReveal.who === me ? "Your" : g.players[g.lastReveal.who].name + "’s"}
                  {g.lastReveal.isCrib ? " crib" : " hand"} — <strong>{g.lastReveal.score.total}</strong>
                </div>
                <div className="cr-seq">
                  {g.lastReveal.hand.map((c) => (
                    <CribCard key={cardId(c)} card={c} mini />
                  ))}
                  {g.starter && (
                    <span className="cr-rv-cut">
                      <CribCard card={g.starter} mini />
                    </span>
                  )}
                </div>
                <div className="cr-lbl">{describeShow(g.lastReveal.score)}</div>
              </div>
            )}
            {!roundComplete(g) ? (
              onAdvanceShow ? (
                <button className="reveal-replay" onClick={onAdvanceShow}>
                  {showLabel[g.showStage] ?? "Next"}
                </button>
              ) : (
                <div className="cr-lbl">counting…</div>
              )
            ) : (
              <div className="cr-row2">
                <button className="cr-coach-btn" onClick={() => setReview(reviewHand(g, me))}>
                  🔍 Review hand
                </button>
                {onNextRound ? (
                  <button className="reveal-replay cr-discard-btn" onClick={onNextRound}>
                    Next hand
                  </button>
                ) : (
                  <div className="cr-lbl">{waiting ?? "waiting for next hand…"}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- game over ---- */}
        {g.phase === "gameOver" && g.result && (
          <div className="cr-phase cr-over">
            <h2>{g.result.winner === me ? "You win!" : g.players[g.result.winner].name + " wins!"}</h2>
            <div className="cr-lbl">{g.players.map((p, i) => `${i === me ? "You" : p.name} ${p.score}`).join(" · ")}</div>
            <div className="cr-row2">
              {history.length > 0 && (
                <button className="cr-coach-btn" onClick={() => setGameReview(true)}>
                  🎬 Game review
                </button>
              )}
              {onNewGame && (
                <button className="reveal-replay cr-discard-btn" onClick={onNewGame}>
                  New game
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
