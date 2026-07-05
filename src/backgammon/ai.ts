import { type Board, POINTS, mine, opp } from "./rules";
import { type BgState, type Move, applyBoardMove, legalMoves, roll, applyMove } from "./game";

// A practice-strength backgammon heuristic: prefer hitting blots, making points,
// bearing off and general pip progress; avoid leaving fresh blots. It plays one
// die at a time greedily — not equity-perfect, but a reasonable opponent.

function moveScore(b: Board, player: number, m: Move): number {
  let s = 0;
  const hit = m.to !== "off" && opp(b.points, player, m.to as number) === 1;
  const nb = applyBoardMove(b, player, m);
  if (hit) s += 10;
  if (m.to === "off") s += 8;
  if (m.to !== "off" && mine(nb.points, player, m.to as number) >= 2) s += 5; // made/held a point
  if (m.to !== "off" && mine(nb.points, player, m.to as number) === 1) s -= 2; // left a blot

  const fromIdx = m.from === "bar" ? (player === 0 ? POINTS : -1) : m.from;
  const toIdx = m.to === "off" ? (player === 0 ? -1 : POINTS) : (m.to as number);
  const progress = player === 0 ? fromIdx - toIdx : toIdx - fromIdx;
  s += progress * 0.1; // reward moving checkers homeward
  if (m.from === "bar") s += 3; // getting off the bar is urgent
  return s;
}

/** One AI action: roll to open the turn, or play the best available die. */
export function aiStep(state: BgState, rng: () => number = Math.random): BgState {
  if (state.result) return state;
  if (state.phase === "roll") return roll(state, rng);
  if (state.phase === "move" && state.players[state.current].isAI) {
    const moves = legalMoves(state);
    if (!moves.length) return state;
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const sc = moveScore(state.board, state.current, m);
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    }
    return applyMove(state, best.from, best.die);
  }
  return state;
}

/** Play a whole AI turn to completion. */
export function takeAITurn(state: BgState, rng: () => number = Math.random): BgState {
  let s = state;
  let guard = 0;
  const start = s.current;
  // Roll if needed, then play out every die this turn.
  while (!s.result && s.current === start && guard++ < 30) {
    const next = aiStep(s, rng);
    if (next === s) break;
    s = next;
    if (s.phase === "roll") break; // turn passed to the opponent
  }
  return s;
}
