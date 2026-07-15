import { type ReviewTurn, type DiscardChoice, type ReviewHandCard, type ReviewCard, gradeOf } from "../ui/reviewModel";

// The one hand-review analyzer, parameterised by a rules object. Every discard-based
// rummy game (Gin, 65, …) plugs in its own rules — how a card is worth/displayed,
// how a hand melds, and how good a resulting hand is ("score") — and gets the exact
// same graded, ranked, chance-of-success review. The card type `C` and every card
// operation live in the rules object, so 65's wilds / custom point values / multi-deck
// don't leak into the harness. (Tongits' richer meld-and-sapaw MC analyzer is the
// superset that will fold in behind the same shape.)

export interface RummyRules<C> {
  /** Stable identity of a card. */
  id: (c: C) => string;
  /** How the card renders (label + four-colour suit class). */
  view: (c: C) => ReviewCard;
  /** Ids of the cards that fall in a meld in this hand (the rest is deadwood). */
  meldedIds: (hand: C[]) => Set<string>;
  /** The meld groups of a hand, for the "your melds" display. */
  melds: (hand: C[]) => C[][];
  /** Display order for the pre-discard hand. */
  sort: (hand: C[]) => C[];
  /** Short "why" for throwing `discard` from `hand`. */
  note: (discard: C, hand: C[]) => string;
  /** Chance of success (0-1) of keeping `handAfter` after a discard, on turn `i` of `total`. */
  score: (handAfter: C[], i: number, total: number) => number;
}

export interface RummyTurn<C> {
  /** Your hand right after drawing, before the discard. */
  hand: C[];
  /** The card you actually threw. */
  discarded: C;
}

/** Grade each turn: enumerate every possible discard, score each, rank them, and
 *  mark your play against the best. Emits the shared ReviewTurn[] the modal renders. */
export function analyzeRummyTurns<C>(turns: RummyTurn<C>[], rules: RummyRules<C>): ReviewTurn[] {
  const total = turns.length;
  return turns.map((t, idx) => {
    const yourId = rules.id(t.discarded);

    const scored = t.hand.map((c) => {
      const after = t.hand.filter((x) => rules.id(x) !== rules.id(c));
      return { c, pct: Math.round(rules.score(after, idx, total) * 100), note: rules.note(c, t.hand) };
    });
    const rows = [...scored].sort((a, b) => b.pct - a.pct);
    const discards: DiscardChoice[] = rows.map((s) => ({
      cardId: rules.id(s.c),
      card: rules.view(s.c),
      pct: s.pct,
      note: s.note,
    }));

    const yourPct = scored.find((s) => rules.id(s.c) === yourId)?.pct ?? 0;
    const best = rows[0];
    const bestPct = Math.max(best.pct, yourPct);
    const grade = gradeOf(bestPct - yourPct);
    const corrected = grade !== "best" && grade !== "good";
    const bestDiffers = corrected && rules.id(best.c) !== yourId;
    const reason = bestDiffers
      ? `Discard ${rules.view(best.c).label} instead of ${rules.view(t.discarded).label}.`
      : "";

    const melded = rules.meldedIds(t.hand);
    const hand: ReviewHandCard[] = rules.sort(t.hand).map((c) => ({
      card: rules.view(c),
      loose: !melded.has(rules.id(c)),
      mark: rules.id(c) === yourId ? "discarded" : bestDiffers && rules.id(c) === rules.id(best.c) ? "shoulda" : "",
    }));

    const handAfter = t.hand.filter((x) => rules.id(x) !== yourId);
    const melds = rules.melds(handAfter).map((m) => m.map(rules.view));

    return {
      turn: idx + 1,
      grade,
      yourPct,
      bestPct,
      reason,
      bestLine: null,
      hand,
      discards,
      moreDiscards: 0,
      yourDiscard: yourId,
      bestDiscard: bestDiffers ? rules.id(best.c) : null,
      melds,
    };
  });
}
