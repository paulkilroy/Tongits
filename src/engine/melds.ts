import { type Card, type Suit, rankOrder, compareCards } from "./cards";

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

/** A run: 3+ cards, same suit, strictly consecutive ranks (ace low). */
export function isRun(cards: readonly Card[]): boolean {
  if (cards.length < 3) return false;
  const suit = cards[0].suit;
  if (!cards.every((c) => c.suit === suit)) return false;
  const orders = cards.map((c) => rankOrder(c.rank)).sort((a, b) => a - b);
  for (let i = 1; i < orders.length; i++) {
    if (orders[i] !== orders[i - 1] + 1) return false; // gap or duplicate
  }
  return true;
}

export function isValidMeld(cards: readonly Card[]): boolean {
  return isSet(cards) || isRun(cards);
}

/** Classify a group of cards into a Meld in canonical order, or null if invalid. */
export function classifyMeld(cards: readonly Card[]): Meld | null {
  if (isSet(cards)) {
    return { kind: "set", cards: [...cards].sort(compareCards) };
  }
  if (isRun(cards)) {
    // runs sort by rank within the single suit
    return { kind: "run", cards: [...cards].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank)) };
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
  if (meld.kind === "set") {
    if (card.rank !== meld.cards[0].rank) return false;
    return !meld.cards.some((c) => c.suit === card.suit);
  }
  // run
  if (card.suit !== meld.cards[0].suit) return false;
  const orders = meld.cards.map((c) => rankOrder(c.rank));
  const low = orders[0];
  const high = orders[orders.length - 1];
  const o = rankOrder(card.rank);
  return o === low - 1 || o === high + 1;
}

/** Return a new meld with `card` laid off, or null if the lay-off is illegal. */
export function layOff(meld: Meld, card: Card): Meld | null {
  if (!canLayOff(meld, card)) return null;
  return classifyMeld([...meld.cards, card]);
}
