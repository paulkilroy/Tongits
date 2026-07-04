import { bestKeep } from "./scoring";
import { rollEV } from "./odds";
import { type FarkleState, currentPlayer, roll, setAside, bank, canBank, nextTurn, takePiggyback } from "./game";

// A practice-strength AI. It keeps the highest-scoring dice, then presses only
// while another roll is worth it (positive expected value); once it's ahead of
// the odds it banks. If it's not yet on the board it keeps rolling regardless.

/** Do a single AI action (roll / set aside / bank) — lets the UI animate turns. */
export function aiStep(state: FarkleState, rng: () => number = Math.random): FarkleState {
  if (state.result || !currentPlayer(state).isAI) return state;
  if (state.phase === "farkle") return nextTurn(state);
  if (state.phase === "pick") return setAside(state, bestKeep(state.dice, state.rules).keep);
  if (state.phase === "roll") {
    // Piggyback offer on the table: take it only when rolling on that inherited
    // score is +EV (a high base with few dice is a farkle trap — pass on it).
    if (state.piggyback) {
      const { score, dice } = state.piggyback;
      return rollEV(score, dice, state.rules) > 0 ? takePiggyback(state, rng) : roll(state, rng);
    }
    if (canBank(state) && rollEV(state.turnScore, state.diceLeft, state.rules) <= 0) return bank(state);
    return roll(state, rng);
  }
  return state;
}

/** Play a whole AI turn to completion (turn passes or the game ends). */
export function takeAITurn(state: FarkleState, rng: () => number = Math.random): FarkleState {
  let s = state;
  const me = s.current;
  let guard = 0;
  while (s.current === me && !s.result && guard++ < 60) {
    const next = aiStep(s, rng);
    if (next === s) break;
    s = next;
  }
  return s;
}
