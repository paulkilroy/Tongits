import { useEffect } from "react";
import { type Card } from "../engine/cards";
import { newRound, playCard, go, nextShow, roundComplete, STANDARD_CRIB_RULES } from "./game";
import { takeAITurn } from "./ai";
import { CribbageBoard } from "./CribbageBoard";
import { useOnlineCribbage, MIN_CRIB_SEATS, MAX_CRIB_SEATS } from "./online";
import { BackButton } from "../ui/Icon";
import { useTurnAlert } from "../ui/useTurnAlert";
import { Lobby as SeatLobby, type LobbySeat, type LobbyFriend } from "../online/Lobby";

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

/** A live 2–3 player cribbage game over a Supabase room. */
export function OnlineCribbage({
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
  const { room, game: g, connected, seats, started, isHost, meIndex, write, discard, start, addBot } =
    useOnlineCribbage(code, mySeat);
  const me = meIndex >= 0 ? meIndex : 0;

  const needsMe =
    started && !!g && ((g.phase === "play" && g.current === me) || (g.phase === "discard" && !g.players[me].discarded));
  useTurnAlert(needsMe, "Cribbage: your turn");

  // Host drives the show count on a timer so everyone watches it flow.
  useEffect(() => {
    if (!isHost || !g) return;
    if (g.phase === "show" && !roundComplete(g)) {
      const t = setTimeout(() => write(nextShow(g)), 1500);
      return () => clearTimeout(t);
    }
  }, [isHost, g, write]);

  // Host drives any bot seats (lay-away + pegging).
  useEffect(() => {
    if (!isHost || !g || g.result) return;
    const aiPending =
      (g.phase === "discard" && g.players.some((p) => p.isAI && !p.discarded)) ||
      (g.phase === "play" && g.players[g.current].isAI);
    if (!aiPending) return;
    const t = setTimeout(() => write(takeAITurn(g)), 750);
    return () => clearTimeout(t);
  }, [isHost, g, write]);

  if (room && !started) {
    return (
      <SeatLobby
        title="Cribbage · lobby"
        code={code}
        seats={seats}
        meId={mySeat.id}
        hostId={room.hostId}
        isHost={isHost}
        min={MIN_CRIB_SEATS}
        max={MAX_CRIB_SEATS}
        friends={friends}
        onInvite={onInvite}
        onStart={() => void start()}
        onAddBot={() => void addBot()}
        onExit={onExit}
      />
    );
  }

  if (!g) {
    return (
      <main className="app screen cribbage">
        <div className="screen-head">
          <BackButton onClick={onExit} />
          <h1>Cribbage · online</h1>
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

  const myTurn = g.phase === "play" && g.current === me;

  let waiting: string | null = null;
  if (!connected) waiting = "Reconnecting…";
  else if (g.phase === "discard" && g.players[me].discarded) waiting = "Waiting for others to lay away…";

  const names = seats.length ? seats.map((s) => s.name) : g.players.map((p) => p.name);
  const ai = seats.length ? seats.map((s) => s.isAI ?? false) : g.players.map((p) => p.isAI);

  const dealNext = () =>
    write(newRound(STANDARD_CRIB_RULES, randSeed(), names, ai, (g.dealer + 1) % g.players.length, g.players.map((p) => p.score)));

  return (
    <CribbageBoard
      g={g}
      me={me}
      title="Cribbage · online"
      onExit={onExit}
      coach
      canDiscard={g.phase === "discard" && !g.players[me].discarded}
      waiting={waiting}
      onDiscard={(cards: Card[]) => {
        if (g.phase === "discard" && !g.players[me].discarded) void discard(me, cards);
      }}
      onPlay={(c) => {
        if (myTurn) write(playCard(g, c));
      }}
      onGo={() => {
        if (myTurn) write(go(g));
      }}
      // Host paces structural steps; guests wait.
      onNextRound={isHost && roundComplete(g) ? dealNext : undefined}
      onNewGame={
        isHost && g.phase === "gameOver"
          ? () => write(newRound(STANDARD_CRIB_RULES, randSeed(), names, ai, 0, names.map(() => 0)))
          : undefined
      }
    />
  );
}
