import { useEffect, useMemo, useRef, useState } from "react";
import { type Card, type Suit, cardId, cardLabel } from "../engine/cards";
import { analyzeDiscard, gradeDiscard, type DiscardEval } from "./coach";
import {
  type CribState,
  newRound,
  discardToCrib,
  playCard,
  go,
  nextShow,
  legalPlays,
  canPlay,
  pone,
  roundComplete,
  STANDARD_CRIB_RULES,
} from "./game";
import { describeShow } from "./scoring";
import { takeAITurn } from "./ai";

const SUIT_CLASS: Record<Suit, string> = {
  clubs: "s-club",
  diamonds: "s-diamond",
  hearts: "s-heart",
  spades: "s-spade",
};

const randSeed = () => Math.floor(Math.random() * 2 ** 31);
const HUMAN = 0;

function CribCard({
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
    <button
      type="button"
      className={`${mini ? "mc" : "card"} ${SUIT_CLASS[card.suit]} ${selected ? "selected" : ""}`}
      onClick={onClick}
      disabled={disabled || !onClick}
    >
      {cardLabel(card)}
    </button>
  );
}

function ScoreBoard({ g }: { g: CribState }) {
  return (
    <div className="cr-scores">
      {g.players.map((p, i) => (
        <div className={`cr-score ${g.current === i && g.phase === "play" ? "active" : ""}`} key={i}>
          <div className="cr-score-top">
            <span>
              {p.name}
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

export function CribbageGame({ onExit }: { onExit: () => void }) {
  const [g, setG] = useState<CribState>(() =>
    newRound(STANDARD_CRIB_RULES, randSeed(), ["You", "Bot"], [false, true], 0),
  );
  const [sel, setSel] = useState<Card[]>([]);
  const [showCoach, setShowCoach] = useState(false);
  const seenLog = useRef(0);
  const [flash, setFlash] = useState<string | null>(null);

  // Surface the newest log line as a brief on-table message.
  useEffect(() => {
    if (g.log.length > seenLog.current) {
      seenLog.current = g.log.length;
      setFlash(g.log[g.log.length - 1]);
    }
  }, [g.log]);

  // Drive the AI: discard, or peg on its turn.
  useEffect(() => {
    if (g.result) return;
    const aiActs =
      (g.phase === "discard" && g.players.some((p) => p.isAI && !p.discarded)) ||
      (g.phase === "play" && g.players[g.current].isAI);
    if (!aiActs) return;
    const t = setTimeout(() => setG((s) => takeAITurn(s)), 550);
    return () => clearTimeout(t);
  }, [g]);

  const me = g.players[HUMAN];
  const myLegal = new Set(legalPlays(g, HUMAN).map(cardId));
  const myTurn = g.phase === "play" && g.current === HUMAN;
  const ownsCrib = g.dealer === HUMAN;
  const handKey = me.hand.map(cardId).join(",");
  const discardEvs = useMemo<DiscardEval[]>(
    () => (g.phase === "discard" ? analyzeDiscard(me.hand, ownsCrib) : []),
    // hand is stable through the discard phase; handKey captures its contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g.phase, handKey, ownsCrib],
  );
  const myKeep = sel.length === 2 ? me.hand.filter((c) => !sel.some((s) => cardId(s) === cardId(c))) : null;
  const myGrade = myKeep && discardEvs.length ? gradeDiscard(discardEvs, myKeep) : null;

  function toggle(c: Card) {
    const id = cardId(c);
    setSel((prev) =>
      prev.some((s) => cardId(s) === id)
        ? prev.filter((s) => cardId(s) !== id)
        : prev.length < 2
          ? [...prev, c]
          : prev,
    );
  }
  function confirmDiscard() {
    if (sel.length !== 2) return;
    setG((s) => discardToCrib(s, HUMAN, sel));
    setSel([]);
  }
  function nextRound() {
    setG((s) =>
      newRound(
        STANDARD_CRIB_RULES,
        randSeed(),
        ["You", "Bot"],
        [false, true],
        (s.dealer + 1) % 2,
        s.players.map((p) => p.score),
      ),
    );
    seenLog.current = 0;
  }

  const showLabel = ["Count " + g.players[pone(g)]?.name + "’s hand", "Count " + g.players[g.dealer]?.name + "’s hand", "Count the crib"];

  return (
    <main className="app screen cribbage">
      <div className="screen-head">
        <button className="back-btn" onClick={onExit} aria-label="Back to games">
          ‹
        </button>
        <h1>Cribbage</h1>
        <span />
      </div>

      <div className="screen-body">
        <ScoreBoard g={g} />

        {flash && <div className="cr-flash">{flash}</div>}

        {/* ---- discard ---- */}
        {g.phase === "discard" && (
          <div className="cr-phase">
            <p className="cr-instr">
              Lay 2 cards into {g.dealer === HUMAN ? "your" : g.players[g.dealer].name + "’s"} crib.
            </p>
            <div className="cr-hand">
              {me.hand.map((c) => (
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
              <button className="cr-coach-btn" onClick={() => setShowCoach((v) => !v)}>
                {showCoach ? "Hide coach" : "💡 Coach"}
              </button>
              <button className="reveal-replay cr-discard-btn" disabled={sel.length !== 2} onClick={confirmDiscard}>
                Discard {sel.length}/2
              </button>
            </div>
            {showCoach && (
              <div className="cr-coach">
                <div className="cr-lbl">
                  keep these 4 · net EV {ownsCrib ? "(your crib +)" : "(their crib −)"}
                </div>
                {discardEvs.slice(0, 6).map((e, i) => {
                  const isMine = myKeep && e.keep.every((c) => myKeep.some((k) => cardId(k) === cardId(c)));
                  return (
                    <div className={`cr-coach-row ${i === 0 ? "best" : ""} ${isMine ? "mine" : ""}`} key={i}>
                      <span className="cr-coach-keep">
                        {e.keep.map((c) => (
                          <CribCard key={cardId(c)} card={c} mini />
                        ))}
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
        )}

        {/* ---- play ---- */}
        {g.phase === "play" && (
          <div className="cr-phase">
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
                  <div key={i} className={`cr-laid ${g.seqBy[i] === HUMAN ? "mine" : "theirs"}`}>
                    <CribCard card={c} mini />
                  </div>
                ))
              ) : (
                <span className="cr-lbl">fresh count</span>
              )}
            </div>
            <div className="cr-oppline">
              {g.players[1].name}: {g.players[1].hand.length} card{g.players[1].hand.length === 1 ? "" : "s"} left
            </div>
            <div className="cr-hand">
              {me.hand.map((c) => (
                <CribCard
                  key={cardId(c)}
                  card={c}
                  disabled={!myTurn || !myLegal.has(cardId(c))}
                  onClick={myTurn && myLegal.has(cardId(c)) ? () => setG((s) => playCard(s, c)) : undefined}
                />
              ))}
            </div>
            {myTurn && !canPlay(g, HUMAN) && (
              <button className="reveal-replay" onClick={() => setG((s) => go(s))}>
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
                  {g.players[g.lastReveal.who].name}
                  {g.lastReveal.isCrib ? "’s crib" : "’s hand"} — <strong>{g.lastReveal.score.total}</strong>
                </div>
                <div className="cr-seq">
                  {g.lastReveal.hand.map((c) => (
                    <CribCard key={cardId(c)} card={c} mini />
                  ))}
                  {g.starter && <CribCard card={g.starter} mini />}
                </div>
                <div className="cr-lbl">{describeShow(g.lastReveal.score)}</div>
              </div>
            )}
            {!roundComplete(g) ? (
              <button className="reveal-replay" onClick={() => setG((s) => nextShow(s))}>
                {showLabel[g.showStage] ?? "Next"}
              </button>
            ) : (
              <button className="reveal-replay" onClick={nextRound}>
                Next hand
              </button>
            )}
          </div>
        )}

        {/* ---- game over ---- */}
        {g.phase === "gameOver" && g.result && (
          <div className="cr-phase cr-over">
            <h2>{g.players[g.result.winner].name} wins!</h2>
            <div className="cr-lbl">
              {g.players[0].score} – {g.players[1].score}
            </div>
            <button
              className="reveal-replay"
              onClick={() => {
                setG(newRound(STANDARD_CRIB_RULES, randSeed(), ["You", "Bot"], [false, true], 0));
                seenLog.current = 0;
              }}
            >
              New game
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
