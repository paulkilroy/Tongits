import { type Card, rankOrder, cardPoints } from "../engine/cards";

// Cribbage scoring. Two distinct phases:
//   - THE SHOW: a 4-card hand + the shared starter is counted for fifteens,
//     pairs, runs, flush and nobs.
//   - THE PLAY (pegging): as cards are laid to a running total, the card just
//     played may score fifteens, thirty-ones, pairs and runs.
// Card pip value (A=1, 2–9 face, 10/J/Q/K=10) is `cardPoints` from the shared deck.

export interface ShowScore {
  fifteens: number;
  pairs: number;
  runs: number;
  flush: number;
  nobs: number;
  total: number;
}

/** Every subset summing to 15 scores 2. */
function scoreFifteens(cards: Card[]): number {
  const n = cards.length;
  let count = 0;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += cardPoints(cards[i]);
    if (sum === 15) count++;
  }
  return count * 2;
}

/** Every pair of equal rank scores 2 (so trips = 6, quads = 12 fall out naturally). */
function scorePairs(cards: Card[]): number {
  let pts = 0;
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) if (cards[i].rank === cards[j].rank) pts += 2;
  return pts;
}

/** Runs of 3+ consecutive ranks, multiplied by the number of distinct card combos. */
function scoreRuns(cards: Card[]): number {
  const counts = new Array(14).fill(0); // index by rankOrder 1..13
  for (const c of cards) counts[rankOrder(c.rank)]++;
  let pts = 0;
  let order = 1;
  while (order <= 13) {
    if (counts[order] === 0) {
      order++;
      continue;
    }
    let len = 0;
    let combos = 1;
    let o = order;
    while (o <= 13 && counts[o] > 0) {
      len++;
      combos *= counts[o];
      o++;
    }
    if (len >= 3) pts += len * combos;
    order = o;
  }
  return pts;
}

/** Flush: 4 in-hand cards same suit = 4; +1 if the starter matches. The crib
 *  only scores a flush when all five share a suit. */
function scoreFlush(hand: Card[], starter: Card, isCrib: boolean): number {
  const suit = hand[0]?.suit;
  const handFlush = hand.length === 4 && hand.every((c) => c.suit === suit);
  if (!handFlush) return 0;
  if (starter.suit === suit) return 5;
  return isCrib ? 0 : 4;
}

/** Nobs: a Jack in hand whose suit matches the starter scores 1. */
function scoreNobs(hand: Card[], starter: Card): number {
  return hand.some((c) => c.rank === "J" && c.suit === starter.suit) ? 1 : 0;
}

/** Count a 4-card hand with the shared starter (the show). */
export function scoreShow(hand: Card[], starter: Card, isCrib = false): ShowScore {
  const all = [...hand, starter];
  const fifteens = scoreFifteens(all);
  const pairs = scorePairs(all);
  const runs = scoreRuns(all);
  const flush = scoreFlush(hand, starter, isCrib);
  const nobs = scoreNobs(hand, starter);
  return { fifteens, pairs, runs, flush, nobs, total: fifteens + pairs + runs + flush + nobs };
}

// ---- The play (pegging) --------------------------------------------------

/** How many of the most-recent cards (incl. the last) share its rank. */
function trailingSameRank(seq: Card[]): number {
  const last = seq[seq.length - 1];
  let k = 0;
  for (let i = seq.length - 1; i >= 0 && seq[i].rank === last.rank; i--) k++;
  return k;
}

/** The longest run (≥3) formed by the most-recent k cards including the last. */
function trailingRun(seq: Card[]): number {
  let best = 0;
  for (let k = 3; k <= seq.length; k++) {
    const tail = seq.slice(seq.length - k);
    const orders = tail.map((c) => rankOrder(c.rank));
    const uniq = new Set(orders);
    if (uniq.size !== k) continue; // a duplicate rank can't be part of a run
    if (Math.max(...orders) - Math.min(...orders) === k - 1) best = k; // consecutive
  }
  return best;
}

/** Points scored by the card just played (the last of `seq`), given the running
 *  total of the current pegging series. Excludes go / last-card (game logic). */
export function scorePlay(seq: Card[], runningTotal: number): number {
  let pts = 0;
  if (runningTotal === 15 || runningTotal === 31) pts += 2;
  const same = trailingSameRank(seq);
  if (same === 2) pts += 2;
  else if (same === 3) pts += 6;
  else if (same >= 4) pts += 12;
  pts += trailingRun(seq);
  return pts;
}

/** Convenience: the running total after a pegging series. */
export function playTotal(seq: Card[]): number {
  return seq.reduce((t, c) => t + cardPoints(c), 0);
}

/** A human breakdown of a show score, e.g. "fifteen 4, pair, run of 3 — 9". */
export function describeShow(s: ShowScore): string {
  const parts: string[] = [];
  if (s.fifteens) parts.push(`fifteens ${s.fifteens}`);
  if (s.pairs) parts.push(`pairs ${s.pairs}`);
  if (s.runs) parts.push(`run ${s.runs}`);
  if (s.flush) parts.push(`flush ${s.flush}`);
  if (s.nobs) parts.push(`nobs ${s.nobs}`);
  return parts.length ? `${parts.join(", ")} — ${s.total}` : "nineteen (nothing)";
}
