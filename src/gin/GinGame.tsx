import { useEffect, useState } from "react";
import { newGame, draw, discard, knock, nextRound, type GinState } from "./game";
import { aiStep } from "./ai";
import { GinBoard } from "./GinBoard";

const HUMAN = 0;

/** Local 7-card Gin vs the AI; the human is seat 0. */
export function GinGame({ onExit }: { onExit: () => void }) {
  const [g, setG] = useState<GinState>(() => newGame(["You", "Bot"], [false, true]));

  useEffect(() => {
    if (g.result || g.phase === "roundEnd" || !g.players[g.current].isAI) return;
    const t = setTimeout(() => setG((s) => aiStep(s)), 700);
    return () => clearTimeout(t);
  }, [g]);

  return (
    <GinBoard
      g={g}
      me={HUMAN}
      title="Gin"
      onDraw={(src) => setG((s) => draw(s, src))}
      onDiscard={(id) => setG((s) => discard(s, id))}
      onKnock={(id) => setG((s) => knock(s, id))}
      onNextRound={() => setG((s) => nextRound(s))}
      onNewGame={() => setG(newGame(["You", "Bot"], [false, true]))}
      onExit={onExit}
    />
  );
}
