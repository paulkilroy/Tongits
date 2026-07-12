import { type Card, cardId, cardLabel, cardPoints } from "../engine/cards";
import { deadwood } from "../engine/meldFinder";
import { KNOCK_MAX } from "./game";

// A light post-hand coach for Gin. Given each of your turns (the 8-card hand you
// held after drawing, and the card you threw), it grades your discard against the
// one that would have left the least deadwood, and flags when you could have
// knocked earlier. Pure + testable — no UI.

export interface GinTurn {
  hand8: Card[]; // your hand right after drawing (8 cards), before the discard
  discarded: Card;
  drewDiscard: boolean; // did you take the upcard (vs the stock) this turn?
}

export type Grade = "best" | "good" | "inaccuracy" | "mistake";

export interface TurnReview {
  n: number;
  discarded: Card;
  best: Card;
  deadwoodAfter: number;
  bestDeadwood: number;
  grade: Grade;
  note: string;
}

export interface GinReview {
  turns: TurnReview[];
  knockedTurn: number; // the turn you went out
  couldKnockTurn: number | null; // earliest turn a best-play line was already knockable
}

const dwPts = (h: Card[]): number => deadwood(h).reduce((a, c) => a + cardPoints(c), 0);

/** Fewest deadwood points achievable by discarding one card from an 8-card hand. */
function bestDiscard(hand8: Card[]): { card: Card; dw: number } {
  let card = hand8[0];
  let dw = Infinity;
  for (const c of hand8) {
    const after = dwPts(hand8.filter((x) => cardId(x) !== cardId(c)));
    // tie-break: prefer throwing the higher-value card
    if (after < dw || (after === dw && cardPoints(c) > cardPoints(card))) {
      dw = after;
      card = c;
    }
  }
  return { card, dw };
}

const gradeOf = (loss: number): Grade =>
  loss <= 0 ? "best" : loss <= 2 ? "good" : loss <= 5 ? "inaccuracy" : "mistake";

export function reviewGinHand(turns: GinTurn[]): GinReview {
  const out: TurnReview[] = [];
  let couldKnockTurn: number | null = null;

  turns.forEach((t, i) => {
    const best = bestDiscard(t.hand8);
    const after = dwPts(t.hand8.filter((x) => cardId(x) !== cardId(t.discarded)));
    const loss = after - best.dw;
    const grade = gradeOf(loss);
    const note =
      loss <= 0
        ? "best discard"
        : `throwing ${cardLabel(t.discarded)} leaves ${loss} more deadwood than ${cardLabel(best.card)}`;
    out.push({ n: i + 1, discarded: t.discarded, best: best.card, deadwoodAfter: after, bestDeadwood: best.dw, grade, note });
    if (couldKnockTurn === null && best.dw <= KNOCK_MAX) couldKnockTurn = i + 1;
  });

  return { turns: out, knockedTurn: turns.length, couldKnockTurn };
}
