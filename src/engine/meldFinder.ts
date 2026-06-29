import { type Card, type Rank, type Suit, cardId, cardPoints, rankOrder } from "./cards";
import { classifyMeld, type Meld } from "./melds";

// Finds the OPTIMAL set of non-overlapping melds in a hand — the partition that
// leaves the fewest deadwood POINTS. Greedy isn't enough: e.g. with four Q's,
// four J's, 8-9-10♣ and a 3♠, greedy grabs both 4-card sets and strands the
// 8-9-10 run (30 pts), when the right answer melds everything but the 3♠ (3 pts).

/** Every candidate meld in the hand: sets of 3 and 4, and all contiguous sub-runs
 *  of length ≥ 3 (so a 4-run also offers its 3-card pieces). */
function candidateMelds(hand: readonly Card[]): Meld[] {
  const out: Meld[] = [];

  const byRank = new Map<Rank, Card[]>();
  for (const c of hand) (byRank.get(c.rank) ?? byRank.set(c.rank, []).get(c.rank)!).push(c);
  for (const cards of byRank.values()) {
    if (cards.length === 3) out.push(classifyMeld(cards)!);
    else if (cards.length === 4) {
      out.push(classifyMeld(cards)!); // the full 4-set
      for (let skip = 0; skip < 4; skip++) {
        out.push(classifyMeld(cards.filter((_, i) => i !== skip))!); // each 3-of-4 (frees a card for a run)
      }
    }
  }

  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) (bySuit.get(c.suit) ?? bySuit.set(c.suit, []).get(c.suit)!).push(c);
  for (const cards of bySuit.values()) {
    const sorted = [...cards].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && rankOrder(sorted[j + 1].rank) === rankOrder(sorted[j].rank) + 1) j++;
      const block = sorted.slice(i, j + 1); // a maximal consecutive run
      for (let a = 0; a < block.length; a++) {
        for (let b = a + 2; b < block.length; b++) {
          out.push(classifyMeld(block.slice(a, b + 1))!); // every sub-run length ≥ 3
        }
      }
      i = j + 1;
    }
  }
  return out;
}

/** The non-overlapping melds that minimise leftover deadwood points (optimal). */
export function bestMelds(hand: readonly Card[]): Meld[] {
  const n = hand.length;
  if (n === 0) return [];
  const index = new Map(hand.map((c, i) => [cardId(c), i] as const));
  const pts = hand.map(cardPoints);

  const cands = candidateMelds(hand).map((meld) => {
    let mask = 0;
    for (const c of meld.cards) mask |= 1 << index.get(cardId(c))!;
    return { mask, meld };
  });
  const covering: number[][] = Array.from({ length: n }, () => []);
  cands.forEach((cm, ci) => {
    for (let i = 0; i < n; i++) if (cm.mask & (1 << i)) covering[i].push(ci);
  });

  const memo = new Map<number, { dead: number; melds: number[] }>();
  const solve = (rem: number): { dead: number; melds: number[] } => {
    if (rem === 0) return { dead: 0, melds: [] };
    const hit = memo.get(rem);
    if (hit) return hit;

    let lo = 0;
    while (!(rem & (1 << lo))) lo++;

    // Option 1: leave the lowest remaining card as deadwood.
    const rest = solve(rem & ~(1 << lo));
    let best = { dead: rest.dead + pts[lo], melds: rest.melds };

    // Option 2: cover it with any candidate meld whose cards are all still available.
    for (const ci of covering[lo]) {
      const cm = cands[ci];
      if ((cm.mask & rem) !== cm.mask) continue;
      const sub = solve(rem & ~cm.mask);
      if (sub.dead < best.dead) best = { dead: sub.dead, melds: [ci, ...sub.melds] };
    }

    memo.set(rem, best);
    return best;
  };

  return solve((1 << n) - 1).melds.map((ci) => cands[ci].meld);
}

/** Find a single meld in `hand` that includes `card` (set preferred, else run),
 *  or null if none exists. Used to play a card taken from the discard, which the
 *  rules require be melded the same turn. */
export function meldUsing(hand: readonly Card[], card: Card): Meld | null {
  const sameRank = hand.filter((c) => c.rank === card.rank);
  if (sameRank.length >= 3) return classifyMeld(sameRank);

  const suited = hand
    .filter((c) => c.suit === card.suit)
    .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
  let run: Card[] = [];
  const containsCard = (cards: Card[]) => cards.some((c) => cardId(c) === cardId(card));
  for (const c of suited) {
    if (run.length === 0 || rankOrder(c.rank) === rankOrder(run[run.length - 1].rank) + 1) {
      run.push(c);
    } else {
      if (run.length >= 3 && containsCard(run)) return classifyMeld(run);
      run = [c];
    }
  }
  if (run.length >= 3 && containsCard(run)) return classifyMeld(run);
  return null;
}

/** Cards left over after taking out the best melds — your "deadwood". */
export function deadwood(hand: readonly Card[]): Card[] {
  const melded = new Set<string>();
  for (const meld of bestMelds(hand)) {
    meld.cards.forEach((c) => melded.add(cardId(c)));
  }
  return hand.filter((c) => !melded.has(cardId(c)));
}
