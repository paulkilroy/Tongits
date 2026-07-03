import { type FarkleRules } from "./rules";
import { hasScore, bestKeep } from "./scoring";

// The heart of press-your-luck: how risky is another roll? For `k` open dice we
// compute P(farkle) and the average points a non-farkle roll banks, by exact
// enumeration of all 6^k rolls (k ≤ 6 → ≤ 46,656). Results are cached per ruleset.

export interface RollStats {
  pFarkle: number; // chance a roll of k dice scores nothing
  avgGain: number; // average best-keep score of a non-farkle roll
}

const cache = new Map<string, RollStats>();
const key = (k: number, r: FarkleRules) => `${k}|${r.nOfKind}|${r.straight}|${r.threePairs}|${r.twoTriplets}`;

function enumRolls(k: number, cb: (dice: number[]) => void): void {
  const dice = new Array<number>(k);
  const rec = (i: number) => {
    if (i === k) return cb(dice);
    for (let v = 1; v <= 6; v++) {
      dice[i] = v;
      rec(i + 1);
    }
  };
  rec(0);
}

export function rollStats(k: number, rules: FarkleRules): RollStats {
  if (k <= 0) return { pFarkle: 0, avgGain: 0 };
  const ck = key(k, rules);
  const hit = cache.get(ck);
  if (hit) return hit;
  let total = 0;
  let farkle = 0;
  let gain = 0;
  enumRolls(k, (d) => {
    total++;
    if (!hasScore(d, rules)) farkle++;
    else gain += bestKeep(d, rules).score;
  });
  const stats = { pFarkle: farkle / total, avgGain: total > farkle ? gain / (total - farkle) : 0 };
  cache.set(ck, stats);
  return stats;
}

/** Expected value of rolling once more vs. banking now (myopic): positive ⇒ roll. */
export function rollEV(turnScore: number, diceLeft: number, rules: FarkleRules): number {
  const { pFarkle, avgGain } = rollStats(diceLeft, rules);
  return (1 - pFarkle) * avgGain - pFarkle * turnScore;
}
