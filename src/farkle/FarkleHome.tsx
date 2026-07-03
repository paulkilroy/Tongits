import { useState } from "react";
import { BackButton } from "../ui/Icon";
import { RULESETS, type RulesetKey } from "./rules";
import { FarkleGame } from "./FarkleGame";

/** Press Your Luck entry: pick a ruleset, then play the bot. (Online later.) */
export function FarkleHome({ onExit }: { onExit: () => void }) {
  const [ruleset, setRuleset] = useState<RulesetKey>("classic");
  const [playing, setPlaying] = useState(false);

  if (playing) return <FarkleGame rules={RULESETS[ruleset]} onExit={() => setPlaying(false)} />;

  return (
    <main className="app screen farkle">
      <div className="screen-head">
        <BackButton onClick={onExit} label="Back to games" />
        <h1>Press Your Luck</h1>
        <span />
      </div>

      <div className="screen-body">
        <div className="cr-lbl">choose a ruleset</div>
        <div className="fk-rulesets">
          {(Object.keys(RULESETS) as RulesetKey[]).map((k) => {
            const r = RULESETS[k];
            const on = k === ruleset;
            return (
              <button key={k} className={`panel fk-ruleset ${on ? "on" : ""}`} onClick={() => setRuleset(k)}>
                <span className="fk-ruleset-name">{r.name}</span>
                <span className="cr-lbl">
                  {r.onBoardMin ? `${r.onBoardMin} to get on the board · ` : "no minimum · "}
                  {r.nOfKind === "double" ? "doubling 4/5/6-of-a-kind" : "flat 1000/2000/3000"}
                  {r.farkleStreakPenalty ? ` · −${r.farkleStreakPenalty} for ${r.farkleStreakLen} farkles` : ""}
                </span>
              </button>
            );
          })}
        </div>

        <button className="big play-primary" onClick={() => setPlaying(true)}>
          Play vs AI
        </button>
        <p className="cr-lbl">
          Roll six dice, set aside scoring dice (1 = 100, 5 = 50, three-of-a-kind and more), then press your luck for
          another roll — or bank. Roll nothing scoring and you farkle, losing the turn. First to {RULESETS[ruleset].target}.
        </p>
      </div>
    </main>
  );
}
