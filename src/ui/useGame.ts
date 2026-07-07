import { useCallback, useEffect, useRef, useState } from "react";
import { newRound, currentPlayer, type GameState } from "../engine/game";
import { takeAITurn } from "../engine/ai";
import { loadProfile } from "./profile";
import { loadRules } from "./rulesStore";

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

function configFor(botCount: 1 | 2) {
  const me = loadProfile();
  const names = ["You", "Bot 1", "Bot 2"].slice(0, botCount + 1);
  const avatars = [me.avatar, "🤖", "🦊"].slice(0, botCount + 1);
  const ai = names.map((_, i) => i !== 0);
  return { names, avatars, ai, playerCount: (botCount + 1) as 2 | 3 };
}

function deal(botCount: 1 | 2, dealer: number): GameState {
  const { names, avatars, ai, playerCount } = configFor(botCount);
  return newRound({ ...loadRules(), playerCount }, randomSeed(), names, ai, dealer, avatars);
}

/**
 * Holds the current round, the match score (games won — first to `gamesToWin`
 * takes the match), and auto-plays the AI turns. The dealer alternates each game.
 */
export function useGame(initialBots: 1 | 2 = 1) {
  const [botCount, setBotCount] = useState<1 | 2>(initialBots);
  const [state, setState] = useState<GameState>(() => deal(initialBots, 0));
  const [wins, setWins] = useState<number[]>(() => configFor(initialBots).names.map(() => 0));
  const counted = useRef<GameState | null>(null); // ensures each round counts once

  const target = state.rules.gamesToWin;
  const matchOver = wins.some((w) => w >= target);

  // Drive AI turns — and AI fold/fight replies to a pending Laban (which may be
  // owed even when it's not an AI's "turn", e.g. the human called it).
  useEffect(() => {
    if (state.result || matchOver) return;
    const drive = state.pendingLaban
      ? state.pendingLaban.responses.some((r, i) => r === null && state.players[i].isAI)
      : currentPlayer(state).isAI;
    if (!drive) return;
    const id = setTimeout(() => setState((s) => takeAITurn(s)), 800);
    return () => clearTimeout(id);
  }, [state, matchOver]);

  // Tally a game win exactly once when a round resolves.
  useEffect(() => {
    if (state.result && counted.current !== state) {
      counted.current = state;
      if (state.result.winner >= 0) {
        setWins((w) => w.map((n, i) => (i === state.result!.winner ? n + 1 : n)));
      }
    }
  }, [state]);

  const newMatch = useCallback((bots: 1 | 2) => {
    setBotCount(bots);
    setWins(configFor(bots).names.map(() => 0));
    counted.current = null;
    setState(deal(bots, 0));
  }, []);

  const nextGame = useCallback(() => {
    counted.current = null;
    setState((prev) => deal(botCount, (prev.dealer + 1) % prev.players.length));
  }, [botCount]);

  return { state, setState, wins, target, matchOver, nextGame, newMatch };
}
