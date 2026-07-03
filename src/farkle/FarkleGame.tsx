import { useEffect, useRef, useState } from "react";
import { BackButton } from "../ui/Icon";
import { type FarkleRules } from "./rules";
import { scoreDice, bestKeep } from "./scoring";
import { rollStats, rollEV } from "./odds";
import { newGame, roll, setAside, bank, canBank, type FarkleState } from "./game";
import { aiStep } from "./ai";

const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function Die({
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

const HUMAN = 0;

export function FarkleGame({ rules, onExit }: { rules: FarkleRules; onExit: () => void }) {
  const fresh = () => newGame(rules, ["You", "Bot"], [false, true]);
  const [g, setG] = useState<FarkleState>(fresh);
  const [sel, setSel] = useState<number[]>([]);
  const seenLog = useRef(0);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (g.log.length > seenLog.current) {
      seenLog.current = g.log.length;
      setFlash(g.log[g.log.length - 1]);
    } else if (g.log.length < seenLog.current) {
      seenLog.current = g.log.length;
    }
  }, [g.log]);

  // Drive the AI a step at a time so its turn animates.
  useEffect(() => {
    if (g.result || !g.players[g.current].isAI) return;
    const t = setTimeout(() => setG((s) => aiStep(s)), 700);
    return () => clearTimeout(t);
  }, [g]);

  const myTurn = g.current === HUMAN && !g.result;
  const selValues = sel.map((i) => g.dice[i]);
  const selScore = selValues.length ? scoreDice(selValues, g.rules) : { score: 0, allScoring: false };
  const canSet = myTurn && g.phase === "pick" && selValues.length > 0 && selScore.allScoring;
  const best = g.phase === "pick" ? bestKeep(g.dice, g.rules) : { keep: [], score: 0 };

  const pFarkle = Math.round(rollStats(g.diceLeft, g.rules).pFarkle * 100);
  const ev = rollEV(g.turnScore, g.diceLeft, g.rules);

  function toggle(i: number) {
    setSel((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  }
  const doRoll = () => {
    setG((s) => roll(s, Math.random));
    setSel([]);
  };
  const doSet = () => {
    setG((s) => setAside(s, selValues));
    setSel([]);
  };
  const doBank = () => {
    setG((s) => bank(s));
    setSel([]);
  };

  return (
    <main className="app screen farkle">
      <div className="screen-head">
        <BackButton onClick={onExit} label="Back to games" />
        <h1>Press Your Luck</h1>
        <span />
      </div>

      <div className="screen-body">
        <div className="cr-scores">
          {g.players.map((p, i) => (
            <div className={`cr-score ${g.current === i && !g.result ? "active" : ""}`} key={i}>
              <div className="cr-score-top">
                <span>
                  {i === HUMAN ? "You" : p.name}
                  {!p.onBoard && <span className="fk-off" title="not on the board yet">•</span>}
                </span>
                <strong>{p.score}</strong>
              </div>
              <div className="cr-track">
                <div className="cr-track-fill" style={{ width: `${Math.min(100, (p.score / rules.target) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="fk-target cr-lbl">first to {rules.target} · {rules.name} rules</div>

        {flash && <div className="cr-flash">{flash}</div>}

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

        {/* current roll */}
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
            <h2>{g.result.winner === HUMAN ? "You win!" : g.players[g.result.winner].name + " wins!"}</h2>
            <div className="cr-lbl">
              {g.players[HUMAN].score} – {g.players[1].score}
            </div>
            <button
              className="reveal-replay"
              onClick={() => {
                setG(fresh());
                setSel([]);
                seenLog.current = 0;
              }}
            >
              New game
            </button>
          </div>
        ) : !myTurn ? (
          <div className="cr-turn">{g.players[g.current].name} is rolling…</div>
        ) : g.phase === "pick" ? (
          <div className="fk-actions">
            <div className="fk-coach">
              {selValues.length ? (
                selScore.allScoring ? (
                  <>selection scores <strong>{selScore.score}</strong></>
                ) : (
                  <span className="fk-warn">that set includes a non-scoring die</span>
                )
              ) : (
                <>tap the scoring dice to set aside · best keep {best.score}</>
              )}
            </div>
            <button className="reveal-replay" disabled={!canSet} onClick={doSet}>
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
              <button className="reveal-replay cr-discard-btn" onClick={doRoll}>
                Roll {g.turnScore > 0 ? g.diceLeft : 6}
              </button>
              {canBank(g) && (
                <button className="cr-coach-btn" onClick={doBank}>
                  Bank {g.turnScore}
                </button>
              )}
            </div>
            {!canBank(g) && g.turnScore > 0 && (
              <div className="cr-lbl">need {rules.onBoardMin} to get on the board</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
