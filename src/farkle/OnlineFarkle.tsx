import { newGame, roll, setAside, bank, nextTurn } from "./game";
import { FarkleBoard } from "./FarkleBoard";
import { useOnlineFarkle } from "./online";

/** A live 2-player Press Your Luck game over a Supabase room. Host is seat 0. */
export function OnlineFarkle({ code, isHost, onExit }: { code: string; isHost: boolean; onExit: () => void }) {
  const { game: g, connected, write } = useOnlineFarkle(code, isHost);
  const me = isHost ? 0 : 1;

  if (!g) {
    return (
      <main className="app screen farkle">
        <div className="screen-head">
          <button className="back-btn" onClick={onExit} aria-label="Back">
            ‹
          </button>
          <h1>Press Your Luck · online</h1>
          <span />
        </div>
        <div className="screen-body">
          <p className="cr-instr">
            {connected ? "Waiting for the room…" : "Connecting…"}
            <br />
            <span className="cr-lbl">Share code: {code}</span>
          </p>
        </div>
      </main>
    );
  }

  const myTurn = g.current === me && !g.result;

  return (
    <FarkleBoard
      g={g}
      me={me}
      title="Press Your Luck · online"
      waiting={!connected ? "Reconnecting…" : null}
      onRoll={() => myTurn && write(roll(g, Math.random))}
      onPress={(keep) => myTurn && write(roll(setAside(g, keep), Math.random))}
      onBank={(keep) => myTurn && write(bank(setAside(g, keep)))}
      onNextTurn={() => myTurn && write(nextTurn(g))}
      onNewGame={
        isHost && g.result
          ? () => write(newGame(g.rules, g.players.map((p) => p.name), [false, false]))
          : undefined
      }
      onExit={onExit}
    />
  );
}
