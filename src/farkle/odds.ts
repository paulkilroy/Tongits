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

const FACT = [1, 1, 2, 6, 24, 120, 720];

/** Enumerate the distinct dice multisets of size k (nondecreasing), with the
 *  number of ordered rolls each represents (multinomial weight). ~462 for k=6. */
function enumMultisets(k: number, cb: (dice: number[], weight: number) => void): void {
  const dice = new Array<number>(k);
  const rec = (pos: number, start: number) => {
    if (pos === k) {
      const counts = [0, 0, 0, 0, 0, 0, 0];
      for (const d of dice) counts[d]++;
      let w = FACT[k];
      for (let v = 1; v <= 6; v++) w /= FACT[counts[v]];
      cb(dice, w);
      return;
    }
    for (let v = start; v <= 6; v++) {
      dice[pos] = v;
      rec(pos + 1, v);
    }
  };
  rec(0, 1);
}

export function rollStats(k: number, rules: FarkleRules): RollStats {
  if (k <= 0) return { pFarkle: 0, avgGain: 0 };
  const ck = key(k, rules);
  const hit = cache.get(ck);
  if (hit) return hit;
  let total = 0;
  let farkle = 0;
  let gain = 0;
  enumMultisets(k, (d, w) => {
    total += w;
    if (!hasScore(d, rules)) farkle += w;
    else gain += w * bestKeep(d, rules).score;
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
