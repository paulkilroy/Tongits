import { useState } from "react";
import { onlineConfigured } from "../online/supabase";
import { BackButton } from "../ui/Icon";

/** "65" entry: play the bots, host an online game, or join by code. */
export function SixtyFiveMenu({
  onLocal,
  onHost,
  onJoin,
  onExit,
  busy,
  error,
}: {
  onLocal: (players: number) => void;
  onHost: () => void;
  onJoin: (code: string) => void;
  onExit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState("");
  return (
    <main className="app screen sixtyfive">
      <div className="screen-head">
        <BackButton onClick={onExit} label="Back to games" />
        <h1>65</h1>
        <span />
      </div>

      <div className="screen-body">
        <p className="cr-lbl">
          Progressive rummy — hands of 3 up to 13, joker + the hand-size rank wild. Make sets & runs, say “Pay
          Me!”, lowest score wins.
        </p>
        <button className="big play-primary" onClick={() => onLocal(2)}>
          Play vs AI
        </button>
        <button className="big" onClick={() => onLocal(3)}>
          Play vs 2 AI
        </button>

        {onlineConfigured ? (
          <>
            <div className="divider">online</div>
            <button className="big" onClick={onHost} disabled={busy}>
              {busy ? "Creating…" : "Host a game (2–6 players)"}
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
          </>
        ) : (
          <p className="cr-lbl">Online play isn’t configured on this build.</p>
        )}
      </div>
    </main>
  );
}
