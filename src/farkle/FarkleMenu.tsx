import { useState } from "react";
import { BackButton } from "../ui/Icon";
import { onlineConfigured } from "../online/supabase";
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
  const [code, setCode] = useState("");
  const rules = RULESETS[ruleset];

  return (
    <main className="app screen farkle">
      <div className="screen-head">
        <BackButton onClick={onExit} label="Back to games" />
        <h1>{name}</h1>
        <span />
      </div>

      <div className="screen-body">
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

        {onlineConfigured ? (
          <>
            <div className="divider">online</div>
            <button className="big" onClick={() => onHost(rules)} disabled={busy}>
              {busy ? "Creating…" : `Host a game (${rules.name})`}
            </button>
            <div className="join-row">
              <input
                placeholder="Enter code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                autoCapitalize="characters"
              />
              <button onClick={() => onJoin(code.trim().toUpperCase())} disabled={code.trim().length < 4}>
                Join
              </button>
            </div>
            {error && (
              <p className="cr-lbl" style={{ color: "#ff7a7a" }}>
                {error}
              </p>
            )}
            <p className="cr-lbl">The host picks the ruleset; share the code and your friend taps Join.</p>
          </>
        ) : (
          <p className="cr-lbl">Online play isn’t configured on this build.</p>
        )}
      </div>
    </main>
  );
}
