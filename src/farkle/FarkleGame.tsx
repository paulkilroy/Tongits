import { useEffect, useState } from "react";
import { type FarkleRules } from "./rules";
import { newGame, roll, setAside, bank, type FarkleState } from "./game";
import { aiStep } from "./ai";
import { FarkleBoard } from "./FarkleBoard";

/** Local game vs the AI; the human is seat 0. */
export function FarkleGame({ rules, onExit }: { rules: FarkleRules; onExit: () => void }) {
  const fresh = () => newGame(rules, ["You", "Bot"], [false, true]);
  const [g, setG] = useState<FarkleState>(fresh);

  useEffect(() => {
    if (g.result || !g.players[g.current].isAI) return;
    const t = setTimeout(() => setG((s) => aiStep(s)), 700);
    return () => clearTimeout(t);
  }, [g]);

  return (
    <FarkleBoard
      g={g}
      me={0}
      title="Press Your Luck"
      onRoll={() => setG((s) => roll(s, Math.random))}
      onSetAside={(values) => setG((s) => setAside(s, values))}
      onBank={() => setG((s) => bank(s))}
      onNewGame={() => setG(fresh())}
      onExit={onExit}
    />
  );
}
