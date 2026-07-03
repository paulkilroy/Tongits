import { useEffect } from "react";
import { type Card } from "../engine/cards";
import { newRound, playCard, go, nextShow, roundComplete, STANDARD_CRIB_RULES } from "./game";
import { CribbageBoard } from "./CribbageBoard";
import { useOnlineCribbage } from "./online";
import { BackButton } from "../ui/Icon";

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

/** A live 2-player cribbage game over a Supabase room. Host is seat 0. */
export function OnlineCribbage({ code, isHost, onExit }: { code: string; isHost: boolean; onExit: () => void }) {
  const { game: g, connected, write, discard } = useOnlineCribbage(code, isHost);
  const me = isHost ? 0 : 1;

  // Host drives the show: count each hand out on a timer so both watch it flow.
  useEffect(() => {
    if (!isHost || !g) return;
    if (g.phase === "show" && !roundComplete(g)) {
      const t = setTimeout(() => write(nextShow(g)), 1500);
      return () => clearTimeout(t);
    }
  }, [isHost, g, write]);

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

  const oppName = g.players[(me + 1) % 2].name;
  const myTurn = g.phase === "play" && g.current === me;

  let waiting: string | null = null;
  if (!connected) waiting = "Reconnecting…";
  else if (g.phase === "discard" && g.players[me].discarded)
    waiting = `Waiting for ${oppName} to lay away…`;

  const dealNext = () =>
    write(
      newRound(
        STANDARD_CRIB_RULES,
        randSeed(),
        g.players.map((p) => p.name),
        [false, false],
        (g.dealer + 1) % 2,
        g.players.map((p) => p.score),
      ),
    );

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
      // Host paces structural steps; guest waits.
      onNextRound={isHost && roundComplete(g) ? dealNext : undefined}
      onNewGame={
        isHost && g.phase === "gameOver"
          ? () =>
              write(
                newRound(STANDARD_CRIB_RULES, randSeed(), g.players.map((p) => p.name), [false, false], 0, [0, 0]),
              )
          : undefined
      }
    />
  );
}
