import { useState, type ReactNode } from "react";
import { BackButton } from "./Icon";
import { onlineConfigured } from "../online/supabase";

// The one game-entry menu, shared by every game: back button + title, a blurb, the
// game's own local-play buttons (children), and — identical across all of them — the
// online block (host + join-by-code + error, or a "not configured" note). Each menu
// file was a copy of this frame; now they're ~10 lines of game-specific config.

export interface MenuOnline {
  onHost: () => void;
  onJoin: (code: string) => void;
  busy: boolean;
  error: string | null;
  /** Host-button label, e.g. "Host a game (2–6 players)". */
  hostLabel?: string;
  /** A note under the join block, e.g. "Host, share the code; your friend taps Join." */
  hint?: ReactNode;
}

export function GameMenu({
  title,
  blurb,
  variant = "sixtyfive",
  onExit,
  online,
  children,
}: {
  title: ReactNode;
  blurb?: ReactNode;
  /** Screen style variant (sixtyfive / farkle / battleship / backgammon). */
  variant?: string;
  onExit: () => void;
  /** Present when the game supports online play. */
  online?: MenuOnline;
  /** The game's local-play buttons / ruleset picker. */
  children: ReactNode;
}) {
  return (
    <main className={`app screen ${variant}`.trim()}>
      <div className="screen-head">
        <BackButton onClick={onExit} label="Back to games" />
        <h1>{title}</h1>
        <span />
      </div>
      <div className="screen-body">
        {blurb && <p className="cr-lbl">{blurb}</p>}
        {children}
        {online &&
          (onlineConfigured ? (
            <OnlineJoin {...online} />
          ) : (
            <p className="cr-lbl">Online play isn’t configured on this build.</p>
          ))}
      </div>
    </main>
  );
}

function OnlineJoin({ onHost, onJoin, busy, error, hostLabel = "Host a game", hint }: MenuOnline) {
  const [code, setCode] = useState("");
  return (
    <>
      <div className="divider">online</div>
      <button className="big" onClick={onHost} disabled={busy}>
        {busy ? "Creating…" : hostLabel}
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
      {hint && <p className="cr-lbl">{hint}</p>}
    </>
  );
}
