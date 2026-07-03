import { useEffect, useState } from "react";
import { type Card } from "../engine/cards";
import {
  type CribState,
  newRound,
  discardToCrib,
  playCard,
  go,
  nextShow,
  STANDARD_CRIB_RULES,
} from "./game";
import { takeAITurn } from "./ai";
import { CribbageBoard } from "./CribbageBoard";

const randSeed = () => Math.floor(Math.random() * 2 ** 31);
const HUMAN = 0;

/** Local game vs the AI. Owns the state; drives the bot; the human is seat 0. */
export function CribbageGame({ onExit }: { onExit: () => void }) {
  const [g, setG] = useState<CribState>(() =>
    newRound(STANDARD_CRIB_RULES, randSeed(), ["You", "Bot"], [false, true], 0),
  );

  // Drive the AI: discard, or peg on its turn.
  useEffect(() => {
    if (g.result) return;
    const aiActs =
      (g.phase === "discard" && g.players.some((p) => p.isAI && !p.discarded)) ||
      (g.phase === "play" && g.players[g.current].isAI);
    if (!aiActs) return;
    const t = setTimeout(() => setG((s) => takeAITurn(s)), 550);
    return () => clearTimeout(t);
  }, [g]);

  const nextRound = () =>
    setG((s) =>
      newRound(
        STANDARD_CRIB_RULES,
        randSeed(),
        ["You", "Bot"],
        [false, true],
        (s.dealer + 1) % 2,
        s.players.map((p) => p.score),
      ),
    );

  return (
    <CribbageBoard
      g={g}
      me={HUMAN}
      title="Cribbage"
      onExit={onExit}
      coach
      canDiscard={g.phase === "discard" && !g.players[HUMAN].discarded}
      onDiscard={(cards: Card[]) => setG((s) => discardToCrib(s, HUMAN, cards))}
      onPlay={(c) => setG((s) => playCard(s, c))}
      onGo={() => setG((s) => go(s))}
      onAdvanceShow={() => setG((s) => nextShow(s))}
      onNextRound={nextRound}
      onNewGame={() => setG(newRound(STANDARD_CRIB_RULES, randSeed(), ["You", "Bot"], [false, true], 0))}
    />
  );
}
