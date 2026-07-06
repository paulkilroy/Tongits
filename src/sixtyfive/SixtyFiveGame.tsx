import { useEffect, useState } from "react";
import { newGame, draw, discard, payMe, nextRound, type SFState } from "./game";
import { aiStep } from "./ai";
import { SixtyFiveBoard } from "./SixtyFiveBoard";

const HUMAN = 0;

/** Local "65" vs 1–3 AI bots; the human is seat 0. */
export function SixtyFiveGame({ players = 3, onExit }: { players?: number; onExit: () => void }) {
  const names = ["You", ...Array.from({ length: players - 1 }, (_, i) => (players > 2 ? `Bot ${i + 1}` : "Bot"))];
  const ai = names.map((_, i) => i !== HUMAN);
  const [g, setG] = useState<SFState>(() => newGame(names, ai));

  // Drive the bots one action at a time so draws/discards are watchable.
  useEffect(() => {
    if (g.result || g.phase === "roundEnd" || !g.players[g.current].isAI) return;
    const t = setTimeout(() => setG((s) => aiStep(s)), 700);
    return () => clearTimeout(t);
  }, [g]);

  return (
    <SixtyFiveBoard
      g={g}
      me={HUMAN}
      title={players > 2 ? `65 · ${players}-hand` : "65"}
      onDraw={(src) => setG((s) => draw(s, src))}
      onDiscard={(id) => setG((s) => discard(s, id))}
      onPayMe={(id) => setG((s) => payMe(s, id))}
      onNextRound={() => setG((s) => nextRound(s))}
      onNewGame={() => setG(newGame(names, ai))}
      onExit={onExit}
    />
  );
}
