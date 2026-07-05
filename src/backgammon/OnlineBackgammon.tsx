import { useEffect } from "react";
import { roll, applyMove, newGame } from "./game";
import { aiStep } from "./ai";
import { BackgammonBoard } from "./BackgammonBoard";
import { useOnlineBackgammon, MIN_BG_SEATS, MAX_BG_SEATS } from "./online";
import { BackButton } from "../ui/Icon";
import { useTurnAlert } from "../ui/useTurnAlert";
import { Lobby as SeatLobby, type LobbySeat, type LobbyFriend } from "../online/Lobby";

/** A live 2-player Backgammon game over a Supabase room. */
export function OnlineBackgammon({
  code,
  mySeat,
  friends,
  onInvite,
  onExit,
}: {
  code: string;
  mySeat: LobbySeat;
  friends: LobbyFriend[];
  onInvite: (friendId: string) => void;
  onExit: () => void;
}) {
  const { room, game: g, connected, seats, started, isHost, meIndex, write, start, addBot } = useOnlineBackgammon(
    code,
    mySeat,
  );
  const me = meIndex >= 0 ? meIndex : 0;

  const myTurn = started && !!g && g.current === me && !g.result;
  useTurnAlert(myTurn && g?.phase === "roll", "Backgammon: your turn");

  // Host drives a bot seat, one ply at a time.
  useEffect(() => {
    if (!isHost || !g || g.result || !g.players[g.current].isAI) return;
    const t = setTimeout(() => write(aiStep(g)), 800);
    return () => clearTimeout(t);
  }, [isHost, g, write]);

  if (room && !started) {
    return (
      <SeatLobby
        title="Backgammon · lobby"
        code={code}
        seats={seats}
        meId={mySeat.id}
        hostId={room.hostId}
        isHost={isHost}
        min={MIN_BG_SEATS}
        max={MAX_BG_SEATS}
        friends={friends}
        onInvite={onInvite}
        onStart={start}
        onAddBot={addBot}
        onExit={onExit}
      />
    );
  }

  if (!g) {
    return (
      <main className="app screen backgammon">
        <div className="screen-head">
          <BackButton onClick={onExit} />
          <h1>Backgammon · online</h1>
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

  const names = seats.length ? seats.map((s) => s.name) : g.players.map((p) => p.name);
  const ai = seats.length ? seats.map((s) => s.isAI ?? false) : g.players.map((p) => p.isAI);

  return (
    <BackgammonBoard
      g={g}
      me={me}
      title="Backgammon · online"
      waiting={!connected ? "Reconnecting…" : null}
      onRoll={() => myTurn && write(roll(g, Math.random))}
      onMove={(from, die) => myTurn && write(applyMove(g, from, die))}
      onExit={onExit}
      onNewGame={isHost && g.result ? () => write(newGame(names, ai)) : undefined}
    />
  );
}
