import { useState } from "react";
import { onlineConfigured } from "../online/supabase";
import { BackButton } from "../ui/Icon";

/** Backgammon entry: play the bot, host an online game, or join by code. */
export function BackgammonMenu({
  onLocal,
  onHost,
  onJoin,
  onExit,
  busy,
  error,
}: {
  onLocal: () => void;
  onHost: () => void;
  onJoin: (code: string) => void;
  onExit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState("");
  return (
    <main className="app screen backgammon">
      <div className="screen-head">
        <BackButton onClick={onExit} label="Back to games" />
        <h1>Backgammon</h1>
        <span />
      </div>

      <div className="screen-body">
        <button className="big play-primary" onClick={onLocal}>
          Play vs AI
        </button>

        {onlineConfigured ? (
          <>
            <div className="divider">online</div>
            <button className="big" onClick={onHost} disabled={busy}>
              {busy ? "Creating…" : "Host a game"}
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
            <p className="cr-lbl">Host, share the code; your friend taps Join.</p>
          </>
        ) : (
          <p className="cr-lbl">Online play isn’t configured on this build.</p>
        )}
      </div>
    </main>
  );
}
