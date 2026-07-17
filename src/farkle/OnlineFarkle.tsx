import { useEffect } from "react";
import { roll, setAside, bank, nextTurn, takePiggyback } from "./game";
import { aiStep } from "./ai";
import { FarkleBoard } from "./FarkleBoard";
import { useOnlineFarkle, MIN_FARKLE_SEATS, MAX_FARKLE_SEATS } from "./online";
import { Lobby, type LobbySeat, type LobbyFriend } from "../online/Lobby";
import { useTurnAlert } from "../ui/useTurnAlert";
import { OnlineConnecting } from "../ui/OnlineConnecting";

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
  const { room, game: g, connected, seats, started, isHost, meIndex, write, start, addBot, restart } = useOnlineFarkle(
    code,
    me,
  );

  const seat = meIndex >= 0 ? meIndex : 0;
  const myTurn = started && !!g && g.current === seat && !g.result;
  useTurnAlert(myTurn, `${gameName}: your roll`);

  // Host drives bot seats, one action at a time so rolls/set-asides are watchable.
  useEffect(() => {
    if (!isHost || !g || g.result || !g.players[g.current]?.isAI) return;
    const t = setTimeout(() => write(aiStep(g)), 1000);
    return () => clearTimeout(t);
  }, [isHost, g, write]);

  if (!room) return <OnlineConnecting title={`${gameName} · online`} variant="farkle" code={code} connected={connected} onExit={onExit} />;

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
        onAddBot={addBot}
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
