import { type Card, cardId, cardPoints, rankOrder } from "../engine/cards";
import { freshDeck } from "../engine/deck";
import { scorePlay, scoreShow } from "./scoring";
import {
  type CribState,
  discardToCrib,
  playCard,
  go,
  legalPlays,
} from "./game";

// A practice-strength cribbage AI:
//  - Discard by EXPECTED hand value (average over every possible starter), nudged
//    by whether the crib is yours (keep points in) or the opponent's (dump junk).
//  - Peg greedily for points, avoiding leaving the opponent an easy 15/31.

/** Average show value of `keep` over every card that could still be the starter. */
export function expectedHandValue(keep: Card[], starters: Card[]): number {
  let sum = 0;
  for (const st of starters) sum += scoreShow(keep, st, false).total;
  return sum / starters.length;
}

/** Rough worth of a two-card pair sitting in the crib (5s and made points shine). */
function cribPotential(a: Card, b: Card): number {
  let v = 0;
  if (a.rank === b.rank) v += 2; // a pair in the crib
  if (cardPoints(a) + cardPoints(b) === 15) v += 2;
  if (Math.abs(rankOrder(a.rank) - rankOrder(b.rank)) === 1) v += 1; // run potential
  if (a.rank === "5") v += 1;
  if (b.rank === "5") v += 1;
  return v;
}

const pairIndices = (n: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
};

/** Choose the two cards to lay away, given whether this seat owns the crib. */
export function chooseDiscard(hand: Card[], ownsCrib: boolean): Card[] {
  const seen = new Set(hand.map(cardId));
  const starters = freshDeck().filter((c) => !seen.has(cardId(c)));
  const sign = ownsCrib ? 1 : -1;
  let best: { pts: number; discard: Card[] } | null = null;
  for (const [i, j] of pairIndices(hand.length)) {
    const discard = [hand[i], hand[j]];
    const keep = hand.filter((_, k) => k !== i && k !== j);
    const pts = expectedHandValue(keep, starters) + sign * 0.5 * cribPotential(discard[0], discard[1]);
    if (!best || pts > best.pts) best = { pts, discard };
  }
  return best!.discard;
}

/** Choose a card to lay during the play, or null to say "go". */
export function choosePlay(state: CribState, player: number): Card | null {
  const legal = legalPlays(state, player);
  if (!legal.length) return null;
  let best: { rank: number; card: Card } | null = null;
  for (const c of legal) {
    const total = state.total + cardPoints(c);
    const pts = scorePlay([...state.seq, c], total);
    // Reward scoring; avoid parking the total at 5 or 21 (an easy 15/31 for them);
    // don't lead a 5. Prefer shedding higher cards when nothing scores.
    let rank = pts * 100;
    if (total === 5 || total === 21) rank -= 6;
    if (state.seq.length === 0 && c.rank === "5") rank -= 4;
    if (pts === 0) rank += cardPoints(c); // dump big cards while safe
    if (!best || rank > best.rank) best = { rank, card: c };
  }
  return best!.card;
}

/** Advance whatever the AI should do right now (discard or peg). */
export function takeAITurn(state: CribState): CribState {
  if (state.result) return state;
  if (state.phase === "discard") {
    for (let p = 0; p < state.players.length; p++) {
      if (state.players[p].isAI && !state.players[p].discarded) {
        return discardToCrib(state, p, chooseDiscard(state.players[p].hand, p === state.dealer));
      }
    }
    return state;
  }
  if (state.phase === "play" && state.players[state.current].isAI) {
    const card = choosePlay(state, state.current);
    return card ? playCard(state, card) : go(state);
  }
  return state;
}
