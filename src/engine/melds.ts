import { type Card, type Suit, cardId, rankOrder, compareCards } from "./cards";

// A meld is a group of cards a player lays on the table. Tongits has two kinds:
//   - "set"  (tercia):   3+ cards of the SAME rank, all different suits.
//   - "run"  (escalera): 3+ consecutive cards of the SAME suit (ace is low).
//
// Aces are low by default (A-2-3 is a run; Q-K-A is not). A future house-rule
// toggle can allow high aces; the engine reads that flag when we add it.

export type MeldKind = "set" | "run";

export interface Meld {
  readonly kind: MeldKind;
  /** Always stored in canonical order (see `compareCards` / run order). */
  readonly cards: readonly Card[];
}

/** A set: 3+ cards, identical rank, all suits distinct. */
export function isSet(cards: readonly Card[]): boolean {
  if (cards.length < 3) return false;
  const rank = cards[0].rank;
  if (!cards.every((c) => c.rank === rank)) return false;
  const suits = new Set<Suit>(cards.map((c) => c.suit));
  return suits.size === cards.length; // no duplicate suits
}

function isConsecutive(nums: number[]): boolean {
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) return false; // gap or duplicate
  }
  return true;
}

/**
 * Order cards into a valid run, or return null. The ace is always LOW for us
 * (A-2-3 is a run; Q-K-A is not).
 */
export function runOrdered(cards: readonly Card[]): Card[] | null {
  if (cards.length < 3) return null;
  const suit = cards[0].suit;
  if (!cards.every((c) => c.suit === suit)) return null;
  const ordered = [...cards].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
  return isConsecutive(ordered.map((c) => rankOrder(c.rank))) ? ordered : null;
}

/** A run: 3+ cards, same suit, consecutive ranks (ace low). */
export function isRun(cards: readonly Card[]): boolean {
  return runOrdered(cards) !== null;
}

export function isValidMeld(cards: readonly Card[]): boolean {
  return isSet(cards) || isRun(cards);
}

/** Classify a group of cards into a Meld in canonical order, or null if invalid. */
export function classifyMeld(cards: readonly Card[]): Meld | null {
  if (isSet(cards)) {
    return { kind: "set", cards: [...cards].sort(compareCards) };
  }
  const run = runOrdered(cards);
  if (run) {
    return { kind: "run", cards: run };
  }
  return null;
}

/**
 * Sapaw / lay-off: can this single card legally extend an existing meld?
 *  - set: same rank, and its suit isn't already in the meld.
 *  - run: same suit, and it sits immediately below the low end or above the high
 *         end (staying within ace-low … king bounds).
 */
export function canLayOff(meld: Meld, card: Card): boolean {
  if (meld.cards.some((c) => cardId(c) === cardId(card))) return false; // already present
  // A card lays off if the meld plus that card is still a valid meld of the same
  // kind — which naturally allows a 4th of a set, a run extension at either end,
  // and an ace at the high end of a king-run.
  const grown = classifyMeld([...meld.cards, card]);
  return grown !== null && grown.kind === meld.kind;
}

/** Return a new meld with `card` laid off, or null if the lay-off is illegal. */
export function layOff(meld: Meld, card: Card): Meld | null {
  if (!canLayOff(meld, card)) return null;
  return classifyMeld([...meld.cards, card]);
}
