import { useEffect, useState } from "react";
import { newGame, roll, applyMove, type BgState } from "./game";
import { aiStep } from "./ai";
import { BackgammonBoard } from "./BackgammonBoard";

const HUMAN = 0;

/** Local Backgammon vs the AI; the human is player 0. */
export function BackgammonGame({ onExit }: { onExit: () => void }) {
  const [g, setG] = useState<BgState>(() => newGame(["You", "Bot"], [false, true]));

  // Drive the bot one ply at a time (roll, then each die) so moves are watchable.
  useEffect(() => {
    if (g.result || !g.players[g.current].isAI) return;
    const t = setTimeout(() => setG((s) => aiStep(s)), 750);
    return () => clearTimeout(t);
  }, [g]);

  return (
    <BackgammonBoard
      g={g}
      me={HUMAN}
      title="Backgammon"
      onRoll={() => setG((s) => roll(s, Math.random))}
      onMove={(from, die) => setG((s) => applyMove(s, from, die))}
      onExit={onExit}
      onNewGame={() => setG(newGame(["You", "Bot"], [false, true]))}
    />
  );
}
