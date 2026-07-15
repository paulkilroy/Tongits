import { type Card, cardId, cardLabel, cardPoints } from "../engine/cards";
import { deadwood } from "../engine/meldFinder";
import { KNOCK_MAX, type GinState } from "./game";

// A post-hand coach for Gin. It grades each discard against the deadwood-minimising
// one, and — crucially — judges your KNOCK timing against an estimate of the
// opponent's hand, not just "could you have knocked". The estimate is read off
// what's observable: how many cards they took from the discard pile (each ≈ a meld
// formed) and how long the hand ran. Knocking early with a small lead risks an
// undercut or leaves a gin on the table; knocking when they look far behind banks
// the lead. Pure + testable.

export interface GinTurn {
  hand8: Card[]; // your hand right after drawing (8 cards), before the discard
  discarded: Card;
  drewDiscard: boolean;
  /** The full decision-point state (8 cards, your turn), for the Monte-Carlo deep dive. */
  state?: GinState;
}

/** What we could observe about the opponent over the hand. */
export interface GinObs {
  myTurns: GinTurn[];
  oppPickups: number; // times they took the upcard (strong "I made a meld" tell)
  oppTurns: number; // turns they played
  oppDiscards: Card[];
}

export type Grade = "best" | "good" | "inaccuracy" | "mistake";
export type KnockVerdict = "gin" | "strong" | "fair" | "risky";

export interface TurnReview {
  n: number;
  discarded: Card;
  best: Card;
  deadwoodAfter: number;
  bestDeadwood: number;
  grade: Grade;
  note: string;
}

export interface KnockReview {
  deadwood: number; // your deadwood when you went out
  gin: boolean;
  estOpp: number; // estimated opponent deadwood
  oppPickups: number;
  oppTurns: number;
  verdict: KnockVerdict;
  note: string;
}

export interface GinReview {
  turns: TurnReview[];
  knock: KnockReview | null;
}

const dwPts = (h: Card[]): number => deadwood(h).reduce((a, c) => a + cardPoints(c), 0);

function bestDiscard(hand8: Card[]): { card: Card; dw: number } {
  let card = hand8[0];
  let dw = Infinity;
  for (const c of hand8) {
    const after = dwPts(hand8.filter((x) => cardId(x) !== cardId(c)));
    if (after < dw || (after === dw && cardPoints(c) > cardPoints(card))) {
      dw = after;
      card = c;
    }
  }
  return { card, dw };
}

const gradeOf = (loss: number): Grade =>
  loss <= 0 ? "best" : loss <= 2 ? "good" : loss <= 5 ? "inaccuracy" : "mistake";

/** Rough estimate of the opponent's deadwood from observable play. A fresh 7-card
 *  hand carries ~22 deadwood; every turn they draw/discard trims it a little, and
 *  every card they take off the pile (a made/extended meld) trims it a lot. */
export function estimateOppDeadwood(oppPickups: number, oppTurns: number): number {
  const est = 22 - oppTurns * 1.3 - oppPickups * 5;
  return Math.max(2, Math.round(est));
}

export function reviewGinHand(obs: GinObs): GinReview {
  const { myTurns, oppPickups, oppTurns } = obs;
  const turns: TurnReview[] = myTurns.map((t, i) => {
    const best = bestDiscard(t.hand8);
    const after = dwPts(t.hand8.filter((x) => cardId(x) !== cardId(t.discarded)));
    const loss = after - best.dw;
    const grade = gradeOf(loss);
    const note =
      loss <= 0
        ? "best discard"
        : `throwing ${cardLabel(t.discarded)} leaves ${loss} more deadwood than ${cardLabel(best.card)}`;
    return { n: i + 1, discarded: t.discarded, best: best.card, deadwoodAfter: after, bestDeadwood: best.dw, grade, note };
  });

  let knock: KnockReview | null = null;
  const last = turns[turns.length - 1];
  if (last && last.deadwoodAfter <= KNOCK_MAX) {
    const myDw = last.deadwoodAfter;
    const gin = myDw === 0;
    const estOpp = estimateOppDeadwood(oppPickups, oppTurns);
    const margin = estOpp - myDw;
    const verdict: KnockVerdict = gin ? "gin" : margin >= 10 ? "strong" : margin >= 3 ? "fair" : "risky";
    const evidence = `opponent took ${oppPickups} card${oppPickups === 1 ? "" : "s"} off the pile over ${oppTurns} turns → ~${estOpp} deadwood est.`;
    const note =
      verdict === "gin"
        ? "Gin — maximum value, no risk."
        : verdict === "strong"
          ? `Strong knock. ${evidence} A clear lead${myDw <= 3 && oppTurns <= 6 ? " — with that margin you could even have pushed for gin (+25)." : "."}`
          : verdict === "fair"
            ? `Fair knock. ${evidence}`
            : `Risky knock. ${evidence} That's close to your ${myDw} — an undercut was on the table; holding for a lower hand or gin was safer.`;
    knock = { deadwood: myDw, gin, estOpp, oppPickups, oppTurns, verdict, note };
  }

  return { turns, knock };
}
