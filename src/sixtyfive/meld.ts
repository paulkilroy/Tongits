import { type RCard, type Rank, isWild, ord, pointOf, SUITS } from "./rules";

// The heart of "65": given a hand and the round's wild rank, partition it into the
// set of melds (sets/runs of 3+) that leaves the fewest deadwood points. Wilds
// (jokers + the wild rank) can stand in for any card and never count against you.
// This drives scoring, the AI, and the on-screen hand analyzer.

export interface Analysis {
  melds: RCard[][]; // each a valid set or run
  deadwood: RCard[]; // leftover naturals
  points: number; // deadwood value
}

interface Sol {
  melds: RCard[][];
  dead: RCard[];
  pts: number;
}

const key = (nats: RCard[], wilds: number) => nats.map((c) => c.id).join(",") + "|" + wilds;

/** All subsets of `arr` that include index 0 (the anchor), each as a card list. */
function anchorSubsets(arr: RCard[]): RCard[][] {
  const rest = arr.slice(1);
  const out: RCard[][] = [];
  for (let mask = 0; mask < 1 << rest.length; mask++) {
    const s = [arr[0]];
    for (let i = 0; i < rest.length; i++) if (mask & (1 << i)) s.push(rest[i]);
    out.push(s);
  }
  return out;
}

/** Best partition of a hand for the given wild rank. */
export function analyze(hand: RCard[], wildRank: Rank | null): Analysis {
  const wilds = hand.filter((c) => isWild(c, wildRank));
  const nats = hand
    .filter((c) => !isWild(c, wildRank))
    .sort((a, b) => (a.suit !== b.suit ? SUITS.indexOf(a.suit!) - SUITS.indexOf(b.suit!) : ord(a.rank as Rank) - ord(b.rank as Rank)));

  const memo = new Map<string, Sol>();

  const solve = (rem: RCard[], w: number): Sol => {
    if (rem.length === 0) return { melds: [], dead: [], pts: 0 };
    const k = key(rem, w);
    const hit = memo.get(k);
    if (hit) return hit;

    const anchor = rem[0];
    // Option A: anchor is deadwood.
    const skip = solve(rem.slice(1), w);
    let best: Sol = { melds: skip.melds, dead: [anchor, ...skip.dead], pts: skip.pts + pointOf(anchor, wildRank) };

    const consider = (meldNats: RCard[], wUsed: number, wildCards: RCard[]) => {
      const usedIds = new Set(meldNats.map((c) => c.id));
      const remaining = rem.filter((c) => !usedIds.has(c.id));
      const sub = solve(remaining, w - wUsed);
      if (sub.pts < best.pts) best = { melds: [[...meldNats, ...wildCards], ...sub.melds], dead: sub.dead, pts: sub.pts };
    };

    // Sets: same rank as the anchor (anchor is a natural, so rank is a real Rank).
    const rank = anchor.rank as Rank;
    const sameRank = rem.filter((c) => c.rank === rank);
    if (sameRank.length && sameRank[0].id === anchor.id) {
      for (const subset of anchorSubsets(sameRank)) {
        const s = subset.length;
        const wUsed = Math.max(0, 3 - s);
        if (wUsed <= w) consider(subset, wUsed, allocWilds(wilds, wUsed));
      }
    }

    // Runs: anchor's suit, consecutive ords (ace high), length ≥3, containing the anchor.
    const suit = anchor.suit;
    const natAt = new Map<number, RCard>(); // ord → one natural of this suit at that ord
    for (const c of rem) if (c.suit === suit) natAt.set(ord(c.rank as Rank), c);
    const a = ord(rank);
    for (let L = 3; L <= 13; L++) {
      for (let lo = Math.max(2, a - L + 1); lo <= Math.min(a, 14 - L + 1); lo++) {
        const hi = lo + L - 1;
        if (hi > 14) break;
        const meldNats: RCard[] = [];
        let wUsed = 0;
        for (let o = lo; o <= hi; o++) {
          const nat = o === a ? anchor : natAt.get(o);
          if (nat && nat.id !== anchor.id && meldNats.some((x) => x.id === nat.id)) {
            wUsed++; // shouldn't happen, but guard
          } else if (nat) meldNats.push(nat);
          else wUsed++;
        }
        if (wUsed <= w && meldNats.some((c) => c.id === anchor.id)) consider(meldNats, wUsed, allocWilds(wilds, wUsed));
      }
    }

    memo.set(k, best);
    return best;
  };

  const sol = solve(nats, wilds.length);
  // Wilds not consumed by a meld still "meld" freely (count 0) — attach leftovers to any meld,
  // or leave as a size-0 concern. For display, distribute unused wilds into the last/first meld.
  const usedWildIds = new Set(sol.melds.flat().filter((c) => isWild(c, wildRank)).map((c) => c.id));
  const leftoverWilds = wilds.filter((c) => !usedWildIds.has(c.id));
  const melds = sol.melds.map((m) => [...m]);
  if (leftoverWilds.length && melds.length) melds[0].push(...leftoverWilds);
  else if (leftoverWilds.length) melds.push(leftoverWilds); // all-wild "meld" only if nothing else

  return { melds, deadwood: sol.dead, points: sol.pts };
}

/** Pull `n` wild cards off the pool (deterministic slice — caller tracks usage by id). */
function allocWilds(pool: RCard[], n: number): RCard[] {
  return pool.slice(0, n);
}

/** Whether a specific list of cards forms one valid meld (set OR run of 3+, ≥1 natural). */
export function isValidMeld(cards: RCard[], wildRank: Rank | null): boolean {
  if (cards.length < 3) return false;
  const nats = cards.filter((c) => !isWild(c, wildRank));
  const wilds = cards.length - nats.length;
  if (nats.length === 0) return false;
  // Set?
  if (nats.every((c) => c.rank === nats[0].rank)) return true;
  // Run? same suit, distinct consecutive ords fillable by wilds.
  const suit = nats[0].suit;
  if (!nats.every((c) => c.suit === suit)) return false;
  const ords = nats.map((c) => ord(c.rank as Rank)).sort((x, y) => x - y);
  if (new Set(ords).size !== ords.length) return false; // dup rank can't be in a run
  const span = ords[ords.length - 1] - ords[0] + 1;
  const gaps = span - ords.length;
  return span === cards.length && gaps <= wilds;
}

/** Try to lay `card` off onto one of `melds` — grow a set (same rank) or extend a run
 *  by exactly one at either natural end. Returns the meld index, or −1. Wilds are
 *  never laid off (they already count 0). */
export function layOffTarget(card: RCard, melds: RCard[][], wildRank: Rank | null): number {
  if (isWild(card, wildRank)) return -1;
  const co = ord(card.rank as Rank);
  for (let i = 0; i < melds.length; i++) {
    const nats = melds[i].filter((c) => !isWild(c, wildRank));
    if (!nats.length) continue;
    if (nats.every((c) => c.rank === nats[0].rank)) {
      if (card.rank === nats[0].rank) return i; // grow a set
    } else if (card.suit === nats[0].suit) {
      const ords = nats.map((c) => ord(c.rank as Rank));
      if (co === Math.min(...ords) - 1 || co === Math.max(...ords) + 1) return i; // extend a run
    }
  }
  return -1;
}
