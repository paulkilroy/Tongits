import { type FarkleRules } from "./rules";

// Score a set of dice (values 1–6). `score` is the points; `allScoring` is true
// when EVERY die contributes (a legal set-aside must be all-scoring). A roll is a
// "farkle" when its best score is 0.

export interface DiceScore {
  score: number;
  allScoring: boolean; // no leftover non-scoring die
}

const FLAT_NOFAKIND = [0, 0, 0, 0, 1000, 2000, 3000]; // by count: 4→1000, 5→2000, 6→3000

export function scoreDice(dice: number[], rules: FarkleRules): DiceScore {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  const n = dice.length;

  // Six-dice specials use all the dice; take the best that applies.
  if (n === 6) {
    const specials: number[] = [];
    if ([1, 2, 3, 4, 5, 6].every((v) => counts[v] === 1)) specials.push(rules.straight);
    if ([1, 2, 3, 4, 5, 6].filter((v) => counts[v] === 2).length === 3) specials.push(rules.threePairs);
    if (rules.twoTriplets && [1, 2, 3, 4, 5, 6].filter((v) => counts[v] === 3).length === 2)
      specials.push(rules.twoTriplets);
    if (specials.length) return { score: Math.max(...specials), allScoring: true };
  }

  let score = 0;
  let leftover = false;
  for (let v = 1; v <= 6; v++) {
    const c = counts[v];
    if (c === 0) continue;
    if (c >= 3) {
      if (rules.nOfKind === "flat") {
        score += c === 3 ? (v === 1 ? 1000 : v * 100) : FLAT_NOFAKIND[c];
      } else {
        const base = v === 1 ? 1000 : v * 100;
        score += base * 2 ** (c - 3);
      }
    } else if (v === 1) {
      score += 100 * c;
    } else if (v === 5) {
      score += 50 * c;
    } else {
      leftover = true; // 2/3/4/6 in ones or twos don't score
    }
  }
  return { score, allScoring: score > 0 && !leftover };
}

/** Does this roll have any scoring die (i.e. it's NOT a farkle)? */
export function hasScore(roll: number[], rules: FarkleRules): boolean {
  return scoreDice(roll, rules).score > 0;
}
