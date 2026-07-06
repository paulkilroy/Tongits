import { useEffect } from "react";
import { draw, discard, knock, nextRound, newGame } from "./game";
import { aiStep } from "./ai";
import { GinBoard } from "./GinBoard";
import { useOnlineGin, MIN_GIN_SEATS, MAX_GIN_SEATS } from "./online";
import { BackButton } from "../ui/Icon";
import { useTurnAlert } from "../ui/useTurnAlert";
import { Lobby as SeatLobby, type LobbySeat, type LobbyFriend } from "../online/Lobby";

/** A live 2-player Gin game over a Supabase room. */
export function OnlineGin({
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
  const { room, game: g, connected, seats, started, isHost, meIndex, write, start, addBot } = useOnlineGin(code, mySeat);
  const me = meIndex >= 0 ? meIndex : 0;

  const myTurn = started && !!g && g.current === me && !g.result && (g.phase === "draw" || g.phase === "discard");
  useTurnAlert(!!myTurn && g?.phase === "draw", "Gin: your turn");

  useEffect(() => {
    if (!isHost || !g || g.result || g.phase === "roundEnd" || !g.players[g.current].isAI) return;
    const t = setTimeout(() => write(aiStep(g)), 750);
    return () => clearTimeout(t);
  }, [isHost, g, write]);

  if (room && !started) {
    return (
      <SeatLobby
        title="Gin · lobby"
        code={code}
        seats={seats}
        meId={mySeat.id}
        hostId={room.hostId}
        isHost={isHost}
        min={MIN_GIN_SEATS}
        max={MAX_GIN_SEATS}
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
      <main className="app screen sixtyfive">
        <div className="screen-head">
          <BackButton onClick={onExit} />
          <h1>Gin · online</h1>
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
    <GinBoard
      g={g}
      me={me}
      title="Gin · online"
      waiting={!connected ? "Reconnecting…" : null}
      onDraw={(src) => myTurn && write(draw(g, src))}
      onDiscard={(id) => myTurn && write(discard(g, id))}
      onKnock={(id) => myTurn && write(knock(g, id))}
      onNextRound={isHost && g.phase === "roundEnd" ? () => write(nextRound(g)) : undefined}
      onNewGame={isHost && g.result ? () => write(newGame(names, ai)) : undefined}
      onExit={onExit}
    />
  );
}
