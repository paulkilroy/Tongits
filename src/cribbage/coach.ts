import { type Card, cardId } from "../engine/cards";
import { freshDeck, makeRng, shuffle } from "../engine/deck";
import { scoreShow } from "./scoring";

// Cribbage coaching. The single biggest skill is the DISCARD: which 4 of your 6
// cards to keep, and which 2 to lay in the crib. We evaluate every choice by
// expected value:
//   - hand EV  = exact average show value over every possible starter (46 cards);
//   - crib EV  = the two you lay away, scored with a sampled opponent pair + a
//                sampled starter (Monte Carlo) — added if the crib is yours,
//                subtracted if it's your opponent's.

export type CribGrade = "best" | "good" | "ok" | "loose";

export interface DiscardEval {
  discard: Card[];
  keep: Card[];
  handEV: number; // expected points from your kept hand
  cribEV: number; // expected points the laid-away pair adds to the crib
  net: number; // handEV ± cribEV (by crib ownership)
}

const combos6choose2: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) out.push([i, j]);
  return out;
})();

/** Exact expected show value of a 4-card keep over every possible starter. */
function handExpectation(keep: Card[], starters: Card[]): number {
  let sum = 0;
  for (const st of starters) sum += scoreShow(keep, st, false).total;
  return sum / starters.length;
}

/** Monte-Carlo expected crib value of your two lay-aways (opp pair + starter sampled). */
function cribExpectation(discard: Card[], pool: Card[], samples: number, rng: () => number): number {
  let sum = 0;
  for (let s = 0; s < samples; s++) {
    const shuffled = shuffle(pool, rng);
    const opp = [shuffled[0], shuffled[1]];
    const starter = shuffled[2];
    sum += scoreShow([...discard, ...opp], starter, true).total;
  }
  return sum / samples;
}

/** Rank every keep/discard choice for a 6-card hand, best net EV first. */
export function analyzeDiscard(
  hand: Card[],
  ownsCrib: boolean,
  samples = 240,
  seed = 0x5eed,
): DiscardEval[] {
  const seen = new Set(hand.map(cardId));
  const starters = freshDeck().filter((c) => !seen.has(cardId(c)));
  const sign = ownsCrib ? 1 : -1;
  const out: DiscardEval[] = [];
  for (const [i, j] of combos6choose2) {
    const discard = [hand[i], hand[j]];
    const keep = hand.filter((_, k) => k !== i && k !== j);
    // The crib pool excludes the whole hand (starter + opponent cards are unseen).
    const cribEV = cribExpectation(discard, starters, samples, makeRng(seed));
    const handEV = handExpectation(keep, starters);
    out.push({ discard, keep, handEV, cribEV, net: handEV + sign * cribEV });
  }
  return out.sort((a, b) => b.net - a.net);
}

const sameChoice = (a: Card[], b: Card[]): boolean => {
  const ids = new Set(a.map(cardId));
  return b.length === a.length && b.every((c) => ids.has(cardId(c)));
};

/** Grade a chosen keep against the best available, by net EV given up. */
export function gradeDiscard(evs: DiscardEval[], keptFour: Card[]): { grade: CribGrade; lost: number } {
  const best = evs[0].net;
  const mine = evs.find((e) => sameChoice(e.keep, keptFour));
  const lost = mine ? best - mine.net : 0;
  const grade: CribGrade = lost <= 0.3 ? "best" : lost <= 1 ? "good" : lost <= 2 ? "ok" : "loose";
  return { grade, lost };
}
