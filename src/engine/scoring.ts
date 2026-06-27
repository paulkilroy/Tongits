import { type Card, cardPoints } from "./cards";

// Scoring in Tongits is about the cards left in your hand: fewer/lower points is
// better. At a showdown (laban) the lowest hand-point total wins the round; an
// empty hand ("Tongits") is the strongest possible outcome.

/** Sum of the scoring values of the cards still in a hand (lower is better). */
export function handPoints(hand: readonly Card[]): number {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

/** A hand with no cards left — the player has gone out ("Tongits"). */
export function isEmptyHand(hand: readonly Card[]): boolean {
  return hand.length === 0;
}
