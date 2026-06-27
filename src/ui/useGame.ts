import { useCallback, useEffect, useState } from "react";
import { STANDARD_RULES } from "../engine/rules";
import { newRound, currentPlayer, type GameState } from "../engine/game";
import { takeAITurn } from "../engine/ai";

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

/** Start a fresh game with the human as player 0 and `botCount` AI opponents. */
export function startGame(botCount: 1 | 2): GameState {
  const names = ["You", "Bot 1", "Bot 2"].slice(0, botCount + 1);
  const ai = names.map((_, i) => i !== 0);
  return newRound({ ...STANDARD_RULES, playerCount: (botCount + 1) as 2 | 3 }, randomSeed(), names, ai);
}

/**
 * Holds the game state and automatically plays out AI turns (one every ~800ms
 * so you can follow what the bots do). Human actions just call `setState`.
 */
export function useGame(initialBots: 1 | 2 = 1) {
  const [state, setState] = useState<GameState>(() => startGame(initialBots));

  useEffect(() => {
    if (state.result) return;
    if (!currentPlayer(state).isAI) return;
    const id = setTimeout(() => setState((s) => takeAITurn(s)), 800);
    return () => clearTimeout(id);
  }, [state]);

  const reset = useCallback((bots: 1 | 2) => setState(startGame(bots)), []);

  return { state, setState, reset };
}
