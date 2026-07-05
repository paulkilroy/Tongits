import { useEffect } from "react";
import { type Orient } from "./rules";
import { placeShip, autoPlace, setReady, fire, newGame } from "./game";
import { aiStep } from "./ai";
import { BattleshipBoard } from "./BattleshipBoard";
import { useOnlineBattleship, MIN_BS_SEATS, MAX_BS_SEATS } from "./online";
import { BackButton } from "../ui/Icon";
import { useTurnAlert } from "../ui/useTurnAlert";
import { Lobby as SeatLobby, type LobbySeat, type LobbyFriend } from "../online/Lobby";

/** A live 2-player Battleship game over a Supabase room. */
export function OnlineBattleship({
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
  const { room, game: g, connected, seats, started, isHost, meIndex, mutate, start, addBot } = useOnlineBattleship(
    code,
    mySeat,
  );
  const me = meIndex >= 0 ? meIndex : 0;

  const myTurn = started && !!g && g.phase === "play" && g.current === me && !g.result;
  useTurnAlert(myTurn, "Battleship: your shot");

  // Host drives a bot seat (placement + firing).
  useEffect(() => {
    if (!isHost || !g || g.result) return;
    const aiActs =
      (g.phase === "place" && g.players.some((p) => p.isAI && !p.ready)) ||
      (g.phase === "play" && g.players[g.current].isAI);
    if (!aiActs) return;
    const t = setTimeout(() => mutate((s) => aiStep(s)), 700);
    return () => clearTimeout(t);
  }, [isHost, g, mutate]);

  if (room && !started) {
    return (
      <SeatLobby
        title="Battleship · lobby"
        code={code}
        seats={seats}
        meId={mySeat.id}
        hostId={room.hostId}
        isHost={isHost}
        min={MIN_BS_SEATS}
        max={MAX_BS_SEATS}
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
      <main className="app screen battleship">
        <div className="screen-head">
          <BackButton onClick={onExit} />
          <h1>Battleship · online</h1>
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

  let waiting: string | null = null;
  if (!connected) waiting = "Reconnecting…";
  else if (g.phase === "place" && g.players[me].ready) waiting = "Waiting for your opponent to place…";

  const names = seats.length ? seats.map((s) => s.name) : g.players.map((p) => p.name);
  const ai = seats.length ? seats.map((s) => s.isAI ?? false) : g.players.map((p) => p.isAI);

  return (
    <BattleshipBoard
      g={g}
      me={me}
      title="Battleship · online"
      waiting={waiting}
      onPlace={(key: string, start: number, orient: Orient) => mutate((s) => placeShip(s, me, key, start, orient))}
      onAutoPlace={() => mutate((s) => autoPlace(s, me))}
      onReady={() => mutate((s) => setReady(s, me))}
      onFire={(cell) => mutate((s) => fire(s, me, cell))}
      onExit={onExit}
      onNewGame={isHost && g.result ? () => mutate(() => newGame(names, ai)) : undefined}
    />
  );
}
