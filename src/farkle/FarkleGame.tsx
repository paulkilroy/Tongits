import { useEffect, useState } from "react";
import { type FarkleRules } from "./rules";
import { newGame, roll, setAside, bank, nextTurn, takePiggyback, type FarkleState } from "./game";
import { aiStep } from "./ai";
import { FarkleBoard } from "./FarkleBoard";

/** Local game vs the AI; the human is seat 0. */
export function FarkleGame({ rules, name, onExit }: { rules: FarkleRules; name: string; onExit: () => void }) {
  const fresh = () => newGame(rules, ["You", "Bot"], [false, true]);
  const [g, setG] = useState<FarkleState>(fresh);

  useEffect(() => {
    if (g.result || !g.players[g.current].isAI) return;
    // Slow the bot enough to follow each roll / set-aside / bank.
    const t = setTimeout(() => setG((s) => aiStep(s)), 1200);
    return () => clearTimeout(t);
  }, [g]);

  return (
    <FarkleBoard
      g={g}
      me={0}
      title={name}
      onRoll={() => setG((s) => roll(s, Math.random))}
      onPress={(keep) => setG((s) => roll(setAside(s, keep), Math.random))}
      onBank={(keep) => setG((s) => bank(setAside(s, keep)))}
      onNextTurn={() => setG((s) => nextTurn(s))}
      onPiggyback={() => setG((s) => takePiggyback(s, Math.random))}
      onNewGame={() => setG(fresh())}
      onExit={onExit}
    />
  );
}
