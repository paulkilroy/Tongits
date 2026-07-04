import { roll, setAside, bank, nextTurn, takePiggyback } from "./game";
import { FarkleBoard } from "./FarkleBoard";
import { useOnlineFarkle, MIN_FARKLE_SEATS, MAX_FARKLE_SEATS } from "./online";
import { Lobby, type LobbySeat, type LobbyFriend } from "../online/Lobby";
import { useTurnAlert } from "../ui/useTurnAlert";

/** A live 2–6 player Press Your Luck game over a Supabase room. */
export function OnlineFarkle({
  code,
  me,
  gameName,
  friends,
  onInvite,
  onExit,
}: {
  code: string;
  me: LobbySeat;
  gameName: string;
  friends: LobbyFriend[];
  onInvite: (friendId: string) => void;
  onExit: () => void;
}) {
  const { room, game: g, connected, seats, started, isHost, meIndex, write, start, restart } = useOnlineFarkle(
    code,
    me,
  );

  const seat = meIndex >= 0 ? meIndex : 0;
  const myTurn = started && !!g && g.current === seat && !g.result;
  useTurnAlert(myTurn, `${gameName}: your roll`);

  if (!room) {
    return (
      <main className="app screen farkle">
        <div className="screen-head">
          <button className="back-btn" onClick={onExit} aria-label="Back">
            ‹
          </button>
          <h1>{gameName} · online</h1>
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

  if (!started || !g) {
    return (
      <Lobby
        title={`${gameName} · lobby`}
        code={code}
        seats={seats}
        meId={me.id}
        hostId={room.hostId}
        isHost={isHost}
        min={MIN_FARKLE_SEATS}
        max={MAX_FARKLE_SEATS}
        friends={friends}
        onInvite={onInvite}
        onStart={start}
        onExit={onExit}
      />
    );
  }

  return (
    <FarkleBoard
      g={g}
      me={seat}
      title={`${gameName} · online`}
      waiting={!connected ? "Reconnecting…" : null}
      onRoll={() => myTurn && write(roll(g, Math.random))}
      onPress={(keep) => myTurn && write(roll(setAside(g, keep), Math.random))}
      onBank={(keep) => myTurn && write(bank(setAside(g, keep)))}
      onNextTurn={() => myTurn && write(nextTurn(g))}
      onPiggyback={() => myTurn && write(takePiggyback(g, Math.random))}
      onNewGame={isHost && g.result ? restart : undefined}
      onExit={onExit}
    />
  );
}
