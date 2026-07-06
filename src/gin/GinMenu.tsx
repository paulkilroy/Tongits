import { useState } from "react";
import { onlineConfigured } from "../online/supabase";
import { BackButton } from "../ui/Icon";

/** Gin entry: play the bot, host an online game, or join by code. */
export function GinMenu({
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
    <main className="app screen sixtyfive">
      <div className="screen-head">
        <BackButton onClick={onExit} label="Back to games" />
        <h1>Gin</h1>
        <span />
      </div>

      <div className="screen-body">
        <p className="cr-lbl">7-card Gin Rummy — make sets & runs, knock at ≤5 deadwood (or go Gin). First to 100.</p>
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
          </>
        ) : (
          <p className="cr-lbl">Online play isn’t configured on this build.</p>
        )}
      </div>
    </main>
  );
}
