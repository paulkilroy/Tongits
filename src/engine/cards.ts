// Core card model for Tongits. A standard 52-card French deck (no jokers by default).

export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export type Suit = (typeof SUITS)[number];

export const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

/** CSS class per suit, driving the shared four-colour deck (see index.css). Every
 *  card game uses this so suit colouring is identical everywhere. */
export const SUIT_CLASS: Record<Suit, string> = {
  clubs: "s-club",
  diamonds: "s-diamond",
  hearts: "s-heart",
  spades: "s-spade",
};

// Ranks ace–king. The numeric value is the *sequence order* used for runs (ace low).
// Scoring points are separate — see `cardPoints`.
export const RANKS = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
] as const;
export type Rank = (typeof RANKS)[number];

/** 1 for ace … 13 for king — used to detect consecutive runs. */
export function rankOrder(rank: Rank): number {
  return RANKS.indexOf(rank) + 1;
}

/** Tongits scoring value: face cards are 10, ace is 1, pips are face value. */
export function rankPoints(rank: Rank): number {
  switch (rank) {
    case "J":
    case "Q":
    case "K":
      return 10;
    case "A":
      return 1;
    default:
      return Number(rank);
  }
}

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

export function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

/** Stable identity for a card (a deck holds 52 unique cards). Handy as a React key. */
export function cardId(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

export function cardPoints(c: Card): number {
  return rankPoints(c.rank);
}

export function cardLabel(c: Card): string {
  return `${c.rank}${SUIT_SYMBOL[c.suit]}`;
}

/** Sort comparator: by suit, then by rank. A sensible default for a hand. */
export function compareCards(a: Card, b: Card): number {
  if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  return rankOrder(a.rank) - rankOrder(b.rank);
}
