import { isWild, pointOf } from "./rules";
import { analyze } from "./meld";
import { type SFState, draw, discard, payMe, canPayMe } from "./game";

// Practice-strength "65" bot: draw the discard only when it slots in (or it's a
// wild), then throw the most dangerous deadwood card — declaring "Pay Me!" the
// moment the hand can go out. Keeps to ~1 hand analysis per turn to stay fast.

/** One AI action (draw or discard). */
export function aiStep(state: SFState, _rng: () => number = Math.random): SFState {
  if (state.result || !state.players[state.current].isAI) return state;
  const p = state.players[state.current];
  const hand = p.hand;

  if (state.phase === "draw") {
    const top = state.discard[state.discard.length - 1];
    if (top && isWild(top, state.wildRank)) return draw(state, "discard");
    // Take the discard only if it lands in a meld (analysis points don't rise).
    const cur = analyze(hand, state.wildRank).points;
    const withTop = top ? analyze([...hand, top], state.wildRank).points : Infinity;
    return draw(state, top && withTop <= cur ? "discard" : "deck");
  }

  if (state.phase === "discard") {
    const a = analyze(hand, state.wildRank);
    if (a.deadwood.length === 0) {
      // All melded — find a spare card to throw and still go out.
      for (const c of hand) if (canPayMe(state, c.id)) return payMe(state, c.id);
    }
    // Throw the highest-value deadwood card (or, if none, the highest-value card).
    const pool = a.deadwood.length ? a.deadwood : hand;
    let worst = pool[0];
    for (const c of pool) if (pointOf(c, state.wildRank) > pointOf(worst, state.wildRank)) worst = c;
    return discard(state, worst.id);
  }
  return state;
}

/** Play a whole AI turn (draw then discard) to completion. */
export function takeAITurn(state: SFState, rng: () => number = Math.random): SFState {
  let s = state;
  const seat = s.current;
  let guard = 0;
  while (!s.result && s.current === seat && s.players[seat]?.isAI && guard++ < 6) {
    const next = aiStep(s, rng);
    if (next === s) break;
    s = next;
    if (s.phase === "roundEnd" || s.phase === "gameOver") break;
  }
  return s;
}
