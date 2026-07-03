import { useEffect, useRef, useState } from "react";
import { BackButton } from "../ui/Icon";
import { scoreDice, bestKeep } from "./scoring";
import { rollStats, rollEV } from "./odds";
import { canBank, type FarkleState } from "./game";

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
  onRoll: () => void;
  onSetAside: (values: number[]) => void;
  onBank: () => void;
  onExit: () => void;
  onNewGame?: () => void;
  waiting?: string | null;
}

export function FarkleBoard({ g, me, title, onRoll, onSetAside, onBank, onExit, onNewGame, waiting }: FarkleBoardProps) {
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
  // Clear a stale selection whenever the roll changes.
  useEffect(() => setSel([]), [g.dice, g.current, g.phase]);

  const myTurn = g.current === me && !g.result;
  const selValues = sel.map((i) => g.dice[i]);
  const selScore = selValues.length ? scoreDice(selValues, g.rules) : { score: 0, allScoring: false };
  const canSet = myTurn && g.phase === "pick" && selValues.length > 0 && selScore.allScoring;
  const best = myTurn && g.phase === "pick" ? bestKeep(g.dice, g.rules) : { keep: [], score: 0 };

  const showAdvice = myTurn && g.phase === "roll" && g.turnScore > 0;
  const pFarkle = showAdvice ? Math.round(rollStats(g.diceLeft, g.rules).pFarkle * 100) : 0;
  const ev = showAdvice ? rollEV(g.turnScore, g.diceLeft, g.rules) : 0;

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
            </div>
          ))}
        </div>
        <div className="fk-target cr-lbl">
          first to {g.rules.target} · {g.rules.name} rules
        </div>

        {flash && <div className="cr-flash">{flash}</div>}
        {waiting && <div className="cr-waiting">{waiting}</div>}

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
        ) : !myTurn ? (
          <div className="cr-turn">{g.players[g.current].name} is rolling…</div>
        ) : g.phase === "pick" ? (
          <div className="fk-actions">
            <div className="fk-coach">
              {selValues.length ? (
                selScore.allScoring ? (
                  <>
                    selection scores <strong>{selScore.score}</strong>
                  </>
                ) : (
                  <span className="fk-warn">that set includes a non-scoring die</span>
                )
              ) : (
                <>tap the scoring dice to set aside · best keep {best.score}</>
              )}
            </div>
            <button className="reveal-replay" disabled={!canSet} onClick={() => onSetAside(selValues)}>
              Set aside {canSet ? selScore.score : ""}
            </button>
          </div>
        ) : (
          <div className="fk-actions">
            <div className="fk-coach">
              {g.turnScore === 0 ? (
                <>Your turn — roll to start.</>
              ) : (
                <>
                  {g.diceLeft} dice · <strong>{pFarkle}%</strong> farkle ·{" "}
                  <span className={ev > 0 ? "fk-good" : "fk-bad"}>{ev > 0 ? "rolling is +EV" : "bank it"}</span>
                </>
              )}
            </div>
            <div className="cr-row2">
              <button className="reveal-replay cr-discard-btn" onClick={onRoll}>
                Roll {g.turnScore > 0 ? g.diceLeft : 6}
              </button>
              {canBank(g) && (
                <button className="cr-coach-btn" onClick={onBank}>
                  Bank {g.turnScore}
                </button>
              )}
            </div>
            {!canBank(g) && g.turnScore > 0 && (
              <div className="cr-lbl">need {g.rules.onBoardMin} to get on the board</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
