import { useEffect, useState } from "react";
import { type Orient } from "./rules";
import { newGame, placeShip, autoPlace, setReady, fire, type BattleState } from "./game";
import { aiStep } from "./ai";
import { BattleshipBoard } from "./BattleshipBoard";

const HUMAN = 0;

/** Local Battleship vs the AI; the human is player 0. */
export function BattleshipGame({ onExit }: { onExit: () => void }) {
  const [g, setG] = useState<BattleState>(() => newGame(["You", "Bot"], [false, true]));

  // Drive the bot: place + ready, then fire on its turn.
  useEffect(() => {
    if (g.result) return;
    const aiActs =
      (g.phase === "place" && g.players.some((p) => p.isAI && !p.ready)) ||
      (g.phase === "play" && g.players[g.current].isAI);
    if (!aiActs) return;
    const t = setTimeout(() => setG((s) => aiStep(s)), 650);
    return () => clearTimeout(t);
  }, [g]);

  return (
    <BattleshipBoard
      g={g}
      me={HUMAN}
      title="Battleship"
      onPlace={(key: string, start: number, orient: Orient) => setG((s) => placeShip(s, HUMAN, key, start, orient))}
      onAutoPlace={() => setG((s) => autoPlace(s, HUMAN))}
      onReady={() => setG((s) => setReady(s, HUMAN))}
      onFire={(cell) => setG((s) => fire(s, HUMAN, cell))}
      onExit={onExit}
      onNewGame={() => setG(newGame(["You", "Bot"], [false, true]))}
    />
  );
}
