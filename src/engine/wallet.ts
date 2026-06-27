import { type GameState } from "./game";

// How much a seat's play-money balance changes when a game ends. Money moves
// only in online ALL-HUMAN games. Each loser pays the stake to the winner; a
// TONGITS! win pays double. (LIKID folds will pay half once 3-player fold lands.)
export function settlementDelta(game: GameState, seat: number): number {
  const r = game.result;
  if (!r || r.winner < 0) return 0;
  if (game.players.some((p) => p.isAI)) return 0; // friendly/practice — no money
  const perLoser = (game.rules.stake ?? 10) * (r.reason === "tongits" ? 2 : 1);
  if (seat === r.winner) return perLoser * (game.players.length - 1);
  return -perLoser;
}
