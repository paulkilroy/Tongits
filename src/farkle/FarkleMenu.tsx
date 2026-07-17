import { useState } from "react";
import { GameMenu } from "../ui/GameMenu";
import { RULESETS, type RulesetKey, type FarkleRules } from "./rules";

/** Press Your Luck entry: pick a ruleset, then play the bot / host / join.
 *  Routing (local/online) is owned by the App so cross-game challenges work. */
export function FarkleMenu({
  name,
  onLocal,
  onHost,
  onJoin,
  onExit,
  busy,
  error,
}: {
  name: string;
  onLocal: (rules: FarkleRules) => void;
  onHost: (rules: FarkleRules) => void;
  onJoin: (code: string) => void;
  onExit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [ruleset, setRuleset] = useState<RulesetKey>("classic");
  const rules = RULESETS[ruleset];

  return (
    <GameMenu
      title={name}
      variant="farkle"
      onExit={onExit}
      online={{
        onHost: () => onHost(rules),
        onJoin,
        busy,
        error,
        hostLabel: `Host a game (${rules.name})`,
        hint: "The host picks the ruleset; share the code and your friend taps Join.",
      }}
    >
      <div className="cr-lbl">choose a ruleset</div>
      <div className="fk-rulesets">
        {(Object.keys(RULESETS) as RulesetKey[]).map((k) => {
          const r = RULESETS[k];
          return (
            <button key={k} className={`panel fk-ruleset ${k === ruleset ? "on" : ""}`} onClick={() => setRuleset(k)}>
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

      <button className="big play-primary" onClick={() => onLocal(rules)}>
        Play vs AI
      </button>
    </GameMenu>
  );
}
