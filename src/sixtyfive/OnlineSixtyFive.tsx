import { useEffect } from "react";
import { draw, discard, payMe, nextRound, newGame } from "./game";
import { aiStep } from "./ai";
import { SixtyFiveBoard } from "./SixtyFiveBoard";
import { useOnlineSixtyFive, MIN_SF_SEATS, MAX_SF_SEATS } from "./online";
import { OnlineConnecting } from "../ui/OnlineConnecting";
import { useTurnAlert } from "../ui/useTurnAlert";
import { Lobby as SeatLobby, type LobbySeat, type LobbyFriend } from "../online/Lobby";

/** A live 2–6 player "65" game over a Supabase room. */
export function OnlineSixtyFive({
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
  const { room, game: g, connected, seats, started, isHost, meIndex, write, start, addBot } = useOnlineSixtyFive(
    code,
    mySeat,
  );
  const me = meIndex >= 0 ? meIndex : 0;

  const myTurn = started && !!g && g.current === me && !g.result && (g.phase === "draw" || g.phase === "discard");
  useTurnAlert(!!myTurn && g?.phase === "draw", "65: your turn");

  // Host drives bot seats, one action at a time.
  useEffect(() => {
    if (!isHost || !g || g.result || g.phase === "roundEnd" || !g.players[g.current].isAI) return;
    const t = setTimeout(() => write(aiStep(g)), 750);
    return () => clearTimeout(t);
  }, [isHost, g, write]);

  if (room && !started) {
    return (
      <SeatLobby
        title="65 · lobby"
        code={code}
        seats={seats}
        meId={mySeat.id}
        hostId={room.hostId}
        isHost={isHost}
        min={MIN_SF_SEATS}
        max={MAX_SF_SEATS}
        friends={friends}
        onInvite={onInvite}
        onStart={start}
        onAddBot={addBot}
        onExit={onExit}
      />
    );
  }

  if (!g) return <OnlineConnecting title="65 · online" code={code} connected={connected} onExit={onExit} />;

  const names = seats.length ? seats.map((s) => s.name) : g.players.map((p) => p.name);
  const ai = seats.length ? seats.map((s) => s.isAI ?? false) : g.players.map((p) => p.isAI);

  return (
    <SixtyFiveBoard
      g={g}
      me={me}
      title="65 · online"
      waiting={!connected ? "Reconnecting…" : null}
      onDraw={(src) => myTurn && write(draw(g, src))}
      onDiscard={(id) => myTurn && write(discard(g, id))}
      onPayMe={(id) => myTurn && write(payMe(g, id))}
      onNextRound={isHost && g.phase === "roundEnd" ? () => write(nextRound(g)) : undefined}
      onNewGame={isHost && g.result ? () => write(newGame(names, ai)) : undefined}
      onExit={onExit}
    />
  );
}
