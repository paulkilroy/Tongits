import { useState } from "react";
import { STANDARD_CRIB_RULES, newRound } from "./game";
import { CribbageGame } from "./CribbageGame";
import { OnlineCribbage } from "./OnlineCribbage";
import { createRoomData, makeCode, onlineConfigured } from "../online/supabase";

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

type Screen =
  | { kind: "menu" }
  | { kind: "local" }
  | { kind: "online"; code: string; isHost: boolean };

/** Cribbage entry: play the bot, host an online game, or join one by code. */
export function CribbageHome({ name, onExit }: { name: string; onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = () => setScreen({ kind: "menu" });

  async function host() {
    setBusy(true);
    setError(null);
    try {
      const roomCode = makeCode(randSeed());
      const game = newRound(STANDARD_CRIB_RULES, randSeed(), [name || "You", "Opponent"], [false, false], 0);
      await createRoomData(roomCode, { game, version: 1 });
      setScreen({ kind: "online", code: roomCode, isHost: true });
    } catch (e) {
      setError((e as Error).message ?? "Could not create the room.");
    } finally {
      setBusy(false);
    }
  }

  function join() {
    const clean = code.trim().toUpperCase();
    if (clean.length >= 4) setScreen({ kind: "online", code: clean, isHost: false });
  }

  if (screen.kind === "local") return <CribbageGame onExit={back} />;
  if (screen.kind === "online")
    return <OnlineCribbage code={screen.code} isHost={screen.isHost} onExit={back} />;

  return (
    <main className="app screen cribbage">
      <div className="screen-head">
        <button className="back-btn" onClick={onExit} aria-label="Back to games">
          ‹
        </button>
        <h1>Cribbage</h1>
        <span />
      </div>

      <div className="screen-body">
        <button className="big play-primary" onClick={() => setScreen({ kind: "local" })}>
          Play vs AI
        </button>

        {onlineConfigured ? (
          <>
            <div className="divider">online</div>
            <button className="big" onClick={host} disabled={busy}>
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
              <button onClick={join} disabled={code.trim().length < 4}>
                Join
              </button>
            </div>
            {error && <p className="cr-lbl" style={{ color: "#ff7a7a" }}>{error}</p>}
            <p className="cr-lbl">Host, share the code with Ella; she taps Join.</p>
          </>
        ) : (
          <p className="cr-lbl">Online play isn’t configured on this build.</p>
        )}
      </div>
    </main>
  );
}
