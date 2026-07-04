import { useEffect, useRef, useState } from "react";
import { BackButton } from "../ui/Icon";
import { scoreDice, bestKeep } from "./scoring";
import { rollStats, rollEV } from "./odds";
import { type FarkleState } from "./game";

const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export function Die({
  value,
  selected,
  dim,
  onClick,
}: {
  value: number;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
}) {
  const on = new Set(PIPS[value]);
  return (
    <button
      type="button"
      className={`die ${selected ? "sel" : ""} ${dim ? "dim" : ""}`}
      onClick={onClick}
      disabled={!onClick}
      aria-label={`die ${value}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip ${on.has(i + 1) ? "on" : ""}`} />
      ))}
    </button>
  );
}

export interface FarkleBoardProps {
  g: FarkleState;
  me: number;
  title: string;
  onRoll: () => void; // initial roll of the turn
  onPress: (keep: number[]) => void; // set aside + roll again
  onBank: (keep: number[]) => void; // set aside + bank the turn
  onNextTurn: () => void; // resolve a farkle reveal
  onPiggyback?: () => void; // take the previous player's banked score + dice
  onExit: () => void;
  onNewGame?: () => void;
  waiting?: string | null;
}

export function FarkleBoard({
  g,
  me,
  title,
  onRoll,
  onPress,
  onBank,
  onNextTurn,
  onPiggyback,
  onExit,
  onNewGame,
  waiting,
}: FarkleBoardProps) {
  const [sel, setSel] = useState<number[]>([]);
  const seenLog = useRef(0);
  const [flash, setFlash] = useState<string | null>(null);
  const opp = (me + 1) % g.players.length;

  useEffect(() => {
    if (g.log.length > seenLog.current) {
      seenLog.current = g.log.length;
      setFlash(g.log[g.log.length - 1]);
    } else if (g.log.length < seenLog.current) {
      seenLog.current = g.log.length;
    }
  }, [g.log]);
  // Clear the selection only when the roll actually changes — key on dice VALUES,
  // not the array reference, so online re-syncs (which rebuild g every poll with
  // identical dice) don't wipe what the player is mid-picking.
  const rollKey = `${g.dice.join(",")}|${g.current}|${g.phase}`;
  useEffect(() => setSel([]), [rollKey]);

  const myTurn = g.current === me && !g.result;
  const selValues = sel.map((i) => g.dice[i]);
  const hasManual = selValues.length > 0;
  const manualScore = hasManual ? scoreDice(selValues, g.rules) : { score: 0, allScoring: false };
  const manualValid = hasManual && manualScore.allScoring;
  const best = myTurn && g.phase === "pick" ? bestKeep(g.dice, g.rules) : { keep: [], score: 0 };

  // Effective keep: your hand-picked dice if valid, else fall back to the best
  // keep — so Press/Bank never dead-end when you haven't tapped anything (an
  // invalid hand-pick still disables, to nudge you to fix it). This is the fix
  // for the "rolled, wanted to press, but it locked up" trap.
  const effKeep = hasManual ? (manualValid ? selValues : []) : best.keep;
  const effScore = effKeep.length ? scoreDice(effKeep, g.rules).score : 0;
  const canAct = myTurn && g.phase === "pick" && effKeep.length > 0;

  // After keeping this selection: new turn total, dice left, and the odds of pressing.
  const newTurn = g.turnScore + effScore;
  const remaining = g.dice.length - effKeep.length;
  const nextDice = remaining === 0 ? 6 : remaining; // 0 ⇒ hot dice, roll all six
  const pFarkleNext = canAct ? Math.round(rollStats(nextDice, g.rules).pFarkle * 100) : 0;
  const pressEV = canAct ? rollEV(newTurn, nextDice, g.rules) : 0;
  const bankOk = canAct && (g.players[me].onBoard || newTurn >= g.rules.onBoardMin);

  const toggle = (i: number) => setSel((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  return (
    <main className="app screen farkle">
      <div className="screen-head">
        <BackButton onClick={onExit} label="Back" />
        <h1>{title}</h1>
        <span />
      </div>

      <div className="screen-body">
        <div className="cr-scores">
          {g.players.map((p, i) => (
            <div className={`cr-score ${g.current === i && !g.result ? "active" : ""}`} key={i}>
              <div className="cr-score-top">
                <span>
                  {i === me ? "You" : p.name}
                  {!p.onBoard && <span className="fk-off" title="not on the board yet">•</span>}
                </span>
                <strong>{p.score}</strong>
              </div>
              <div className="cr-track">
                <div className="cr-track-fill" style={{ width: `${Math.min(100, (p.score / g.rules.target) * 100)}%` }} />
              </div>
              {(p.hots > 0 || p.farkles > 0) && (
                <div className="fk-luck" title="hot dice / farkles this game">
                  {Array.from({ length: p.hots }, (_, k) => (
                    <span key={`h${k}`}>🔥</span>
                  ))}
                  {Array.from({ length: p.farkles }, (_, k) => (
                    <span key={`f${k}`} className="fk-skull">
                      ☠️
                    </span>
                  ))}
                </div>
              )}
              {p.last && (p.last.chunks.length > 0 || p.last.farkled) && (
                <div className="fk-lastturn" title="last turn">
                  {p.last.chunks.map((c, ci) => (
                    <span className="fk-chunk" key={ci}>
                      {c.gain}
                      {c.hot && <span className="fk-fire">🔥</span>}
                    </span>
                  ))}
                  {p.last.farkled ? (
                    <span className="fk-skull">☠️</span>
                  ) : (
                    <span className="fk-arrow">→ {p.last.banked}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="fk-target cr-lbl">
          first to {g.rules.target} · {g.rules.name} rules
        </div>

        {flash && <div className="cr-flash">{flash}</div>}
        {waiting && <div className="cr-waiting">{waiting}</div>}
        {g.hotDice && <div className="fk-rolling">🔥 …and rooollling!</div>}

        <div className="fk-turn">
          this turn <strong>{g.turnScore}</strong>
          {g.hotDice && <span className="fk-hot"> 🔥 hot dice!</span>}
        </div>
        {g.kept.length > 0 && (
          <div className="fk-dice kept">
            {g.kept.map((v, i) => (
              <Die key={i} value={v} dim />
            ))}
          </div>
        )}
        {g.dice.length > 0 && (
          <div className="fk-dice">
            {g.dice.map((v, i) => (
              <Die
                key={i}
                value={v}
                selected={sel.includes(i)}
                onClick={myTurn && g.phase === "pick" ? () => toggle(i) : undefined}
              />
            ))}
          </div>
        )}

        {g.result ? (
          <div className="cr-phase cr-over">
            <h2>{g.result.winner === me ? "You win!" : g.players[g.result.winner].name + " wins!"}</h2>
            <div className="cr-lbl">
              {g.players[me].score} – {g.players[opp].score}
            </div>
            {onNewGame && (
              <button className="reveal-replay" onClick={onNewGame}>
                New game
              </button>
            )}
          </div>
        ) : g.phase === "farkle" ? (
          <div className="fk-actions">
            <div className="fk-coach fk-farkle-msg">
              💥 {g.current === me ? "You" : g.players[g.current].name} farkled
              {g.turnScore > 0 ? ` — lost ${g.turnScore}` : ""}!
            </div>
            {g.current === me && (
              <button className="reveal-replay" onClick={onNextTurn}>
                Next player
              </button>
            )}
          </div>
        ) : !myTurn ? (
          <div className="cr-turn">{g.players[g.current].name} is rolling…</div>
        ) : g.phase === "pick" ? (
          <div className="fk-actions">
            <div className="fk-coach">
              {hasManual && !manualScore.allScoring ? (
                <span className="fk-warn">that set includes a non-scoring die</span>
              ) : !hasManual ? (
                <>
                  keeps best <strong>{best.score}</strong> · then {nextDice} dice, {pFarkleNext}% farkle —{" "}
                  <span className={pressEV > 0 ? "fk-good" : "fk-bad"}>{pressEV > 0 ? "press is +EV" : "bank it"}</span>{" "}
                  · tap dice to choose
                </>
              ) : (
                <>
                  keep <strong>{effScore}</strong> · then {nextDice} dice, {pFarkleNext}% farkle —{" "}
                  <span className={pressEV > 0 ? "fk-good" : "fk-bad"}>{pressEV > 0 ? "press is +EV" : "bank it"}</span>
                </>
              )}
            </div>
            <div className="cr-row2">
              <button className="reveal-replay cr-discard-btn" disabled={!canAct} onClick={() => onPress(effKeep)}>
                Press my luck
              </button>
              <button className="cr-coach-btn" disabled={!bankOk} onClick={() => onBank(effKeep)}>
                Bank {canAct ? newTurn : g.turnScore}
              </button>
            </div>
            {canAct && !bankOk && (
              <div className="cr-lbl">need {g.rules.onBoardMin} in a turn to get on the board</div>
            )}
          </div>
        ) : g.piggyback ? (
          <div className="fk-actions">
            <div className="fk-coach">
              {g.players[(g.current + g.players.length - 1) % g.players.length].name} left{" "}
              <strong>{g.piggyback.score}</strong> on {g.piggyback.dice}{" "}
              {g.piggyback.dice === 1 ? "die" : "dice"}. Piggyback it, or roll fresh?
            </div>
            <div className="cr-row2">
              <button className="reveal-replay cr-discard-btn" onClick={onPiggyback}>
                Take {g.piggyback.score} · roll {g.piggyback.dice}
              </button>
              <button className="cr-coach-btn" onClick={onRoll}>
                Roll fresh
              </button>
            </div>
          </div>
        ) : (
          <div className="fk-actions">
            <div className="fk-coach">Your turn — roll to start.</div>
            <button className="reveal-replay" onClick={onRoll}>
              Roll
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
