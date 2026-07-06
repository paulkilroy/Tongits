import { type Card, cardId, cardPoints } from "../engine/cards";
import { type GinState, draw, discard, knock, deadwoodPts, KNOCK_MAX } from "./game";

// Practice-strength Gin bot: take the upcard only when it lowers your deadwood,
// throw the card that leaves the least deadwood, and knock as soon as you're at
// or under the knock limit (gin when you can).

function bestDiscard(hand: Card[]): { id: string; pts: number } {
  let best = { id: cardId(hand[0]), pts: Infinity, tossVal: -1 };
  for (const c of hand) {
    const pts = deadwoodPts(hand.filter((x) => cardId(x) !== cardId(c)));
    const tossVal = cardPoints(c);
    if (pts < best.pts || (pts === best.pts && tossVal > best.tossVal)) best = { id: cardId(c), pts, tossVal };
  }
  return best;
}

export function aiStep(state: GinState, _rng: () => number = Math.random): GinState {
  if (state.result || !state.players[state.current].isAI) return state;
  const hand = state.players[state.current].hand;

  if (state.phase === "draw") {
    const top = state.discard[state.discard.length - 1];
    const cur = deadwoodPts(hand);
    const take = top && bestDiscard([...hand, top]).pts < cur;
    return draw(state, take ? "discard" : "deck");
  }

  if (state.phase === "discard") {
    const choice = bestDiscard(hand);
    if (choice.pts <= KNOCK_MAX) return knock(state, choice.id);
    return discard(state, choice.id);
  }
  return state;
}

export function takeAITurn(state: GinState, rng: () => number = Math.random): GinState {
  let s = state;
  const seat = s.current;
  let guard = 0;
  while (!s.result && s.current === seat && s.players[seat]?.isAI && guard++ < 4) {
    const next = aiStep(s, rng);
    if (next === s) break;
    s = next;
    if (s.phase === "roundEnd" || s.phase === "gameOver") break;
  }
  return s;
}
