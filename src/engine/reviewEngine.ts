import { type ReviewTurn, type DiscardChoice, type ReviewHandCard, type ReviewCard, gradeOf } from "../ui/reviewModel";
import { type CardGame, evaluate } from "../game/cardGame";
import { makeRng } from "./deck";

// The one hand-review analyzer, parameterised by a rules object. Every discard-based
// rummy game (Gin, 65, …) plugs in its own rules — how a card is worth/displayed,
// how a hand melds, and how good a resulting hand is ("score") — and gets the exact
// same graded, ranked, chance-of-success review. Two ways to score each discard:
//  - analyzeRummyTurns: the rules' heuristic `score` (instant, main thread).
//  - analyzeRummyMC: real Monte-Carlo over the CardGame<S> spine (exact, in a worker).
// Both produce the same ReviewTurn[] the modal renders.

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
  /** Heuristic chance of success (0-1) of keeping `handAfter`, on turn `i` of `total`. */
  score: (handAfter: C[], i: number, total: number) => number;
}

export interface RummyTurn<C> {
  /** Your hand right after drawing, before the discard. */
  hand: C[];
  /** The card you actually threw. */
  discarded: C;
}

interface Scored<C> {
  card: C;
  pct: number;
  note: string;
}

/** Assemble one graded ReviewTurn from a hand and a scored list of its discards. */
function assemble<C>(idx: number, hand: C[], discarded: C, scored: Scored<C>[], rules: RummyRules<C>): ReviewTurn {
  const yourId = rules.id(discarded);
  const rows = [...scored].sort((a, b) => b.pct - a.pct);
  const discards: DiscardChoice[] = rows.map((s) => ({
    cardId: rules.id(s.card),
    card: rules.view(s.card),
    pct: s.pct,
    note: s.note,
  }));

  const yourPct = scored.find((s) => rules.id(s.card) === yourId)?.pct ?? 0;
  const best = rows[0];
  const bestPct = Math.max(best.pct, yourPct);
  const grade = gradeOf(bestPct - yourPct);
  const corrected = grade !== "best" && grade !== "good";
  const bestDiffers = corrected && rules.id(best.card) !== yourId;
  const reason = bestDiffers ? `Discard ${rules.view(best.card).label} instead of ${rules.view(discarded).label}.` : "";

  const melded = rules.meldedIds(hand);
  const handView: ReviewHandCard[] = rules.sort(hand).map((c) => ({
    card: rules.view(c),
    loose: !melded.has(rules.id(c)),
    mark: rules.id(c) === yourId ? "discarded" : bestDiffers && rules.id(c) === rules.id(best.card) ? "shoulda" : "",
  }));

  const handAfter = hand.filter((x) => rules.id(x) !== yourId);
  const melds = rules.melds(handAfter).map((m) => m.map(rules.view));

  return {
    turn: idx + 1,
    grade,
    yourPct,
    bestPct,
    reason,
    bestLine: null,
    hand: handView,
    discards,
    moreDiscards: 0,
    yourDiscard: yourId,
    bestDiscard: bestDiffers ? rules.id(best.card) : null,
    melds,
  };
}

/** Heuristic review: score every discard with the rules' `score`. Fast, synchronous. */
export function analyzeRummyTurns<C>(turns: RummyTurn<C>[], rules: RummyRules<C>): ReviewTurn[] {
  const total = turns.length;
  return turns.map((t, idx) => {
    const scored = t.hand.map((c) => {
      const after = t.hand.filter((x) => rules.id(x) !== rules.id(c));
      return { card: c, pct: Math.round(rules.score(after, idx, total) * 100), note: rules.note(c, t.hand) };
    });
    return assemble(idx, t.hand, t.discarded, scored, rules);
  });
}

export interface MCTurn<S, C> {
  /** The decision-point state (your turn, after drawing). */
  state: S;
  seat: number;
  hand: C[];
  discarded: C;
}

/** Monte-Carlo review: score every discard by playing the position out with the
 *  CardGame spine. Exact but heavy — run in a worker. */
export function analyzeRummyMC<S, C>(
  game: CardGame<S>,
  turns: MCTurn<S, C>[],
  rules: RummyRules<C>,
  samples: number,
  onProgress?: (fraction: number) => void,
): ReviewTurn[] {
  const total = Math.max(1, turns.reduce((a, t) => a + t.hand.length, 0));
  let done = 0;
  return turns.map((t, idx) => {
    // Each end-of-turn option (a discard or a knock/pay-me), scored by playout; keep
    // the best result per discarded card.
    const byCard = new Map<string, Scored<C>>();
    for (const o of game.options?.(t.state, t.seat) ?? []) {
      const sep = o.id.indexOf(":");
      if (sep < 0 || o.id.startsWith("draw")) continue;
      const cid = o.id.slice(sep + 1);
      const card = t.hand.find((c) => rules.id(c) === cid);
      if (!card) continue;
      const seed = ((idx * 131 + byCard.size + 1) * 2654435761) >>> 0;
      const pct = Math.round(evaluate(game, o.end, t.seat, samples, makeRng(seed)) * 100);
      const prev = byCard.get(cid);
      if (!prev || pct > prev.pct) byCard.set(cid, { card, pct, note: rules.note(card, t.hand) });
      onProgress?.(Math.min(1, ++done / total));
    }
    return assemble(idx, t.hand, t.discarded, [...byCard.values()], rules);
  });
}
