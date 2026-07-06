import { type Suit, SUITS, SUIT_SYMBOL, type Rank, RANKS } from "../engine/cards";

// "65" (aka Pay Me) — a progressive contract-rummy. Played from a 2–3 deck shoe
// WITH jokers, so cards repeat: each card carries a unique instance id. Each round
// deals one more card (3 → 13); the joker and the rank matching the hand size are
// wild that round. Aces are HIGH in runs (…Q-K-A, no wrap). Melds are sets or
// runs of 3+. Wilds can always be melded, so they never count against you.

export type RRank = Rank | "JOKER";

/** A card instance in the shoe (id makes duplicates distinct). */
export interface RCard {
  id: string;
  rank: RRank;
  suit: Suit | null; // null for jokers
}

export const isJoker = (c: RCard): boolean => c.rank === "JOKER";

/** The rank that's wild on the hand of `size` cards: 3s on the 3-card hand … Ks at 13. */
export function wildRankFor(handSize: number): Rank | null {
  // handSize 3..13 → rank order 3..13 (3 … K). Aces are never wild.
  if (handSize < 3 || handSize > 13) return null;
  return RANKS[handSize - 1] ?? null; // RANKS[2]="3" … RANKS[12]="K"
}

export const isWild = (c: RCard, wildRank: Rank | null): boolean =>
  isJoker(c) || (wildRank != null && c.rank === wildRank);

/** Run order with the ace HIGH only: 2→2 … K→13, A→14. */
export function ord(rank: Rank): number {
  if (rank === "A") return 14;
  return RANKS.indexOf(rank) + 1; // "2"→2 … "K"→13
}

/** Deadwood value: 2–8 = 5, 9–K = 10, Ace = 15. Wilds never count (always meldable). */
export function pointOf(c: RCard, wildRank: Rank | null): number {
  if (isWild(c, wildRank)) return 0;
  if (c.rank === "A") return 15;
  if (c.rank === "JOKER") return 0;
  const n = ord(c.rank); // 2..13
  return n <= 8 ? 5 : 10;
}

export function rlabel(c: RCard): string {
  return isJoker(c) ? "🃏" : `${c.rank}${SUIT_SYMBOL[c.suit as Suit]}`;
}

/** How many decks to shuffle together for a given player count. */
export const deckCount = (players: number): number => (players <= 4 ? 2 : 3);

/** Build a shuffled shoe: `decks` × (52 cards + 2 jokers), seeded. */
export function buildShoe(decks: number, seed: number): RCard[] {
  const cards: RCard[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: `${d}-${rank}${suit}`, rank, suit });
    cards.push({ id: `${d}-J1`, rank: "JOKER", suit: null });
    cards.push({ id: `${d}-J2`, rank: "JOKER", suit: null });
  }
  // Seeded Fisher–Yates (mulberry32).
  let a = seed >>> 0;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export const FIRST_HAND = 3;
export const LAST_HAND = 13;
export { SUITS, RANKS, type Suit, type Rank };
