// The one review model shared by every card game. A game's analysis engine (Tongits
// Monte-Carlo, Gin chance-of-success, …) produces `ReviewTurn[]`; `ReviewReplay`
// renders it. New games get the Tongits-quality review for free by emitting this shape.

export type Grade = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export const GRADE_LABEL: Record<Grade, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

// Grade by the win-% (equity) given up vs the best line. Forgiving at the low end
// (a couple points is simulation/estimate noise), harsher at the top.
export const gradeOf = (gap: number): Grade =>
  gap <= 2 ? "best" : gap <= 6 ? "good" : gap <= 9 ? "inaccuracy" : gap <= 12 ? "mistake" : "blunder";

export interface ReviewCard {
  label: string;
  suitClass: string;
}

/** One row of the "If you discard… · chance of success" table. */
export interface DiscardChoice {
  cardId: string;
  card: ReviewCard;
  /** Win / success % if you make this discard, best→worst. */
  pct: number;
  /** This line also lays/extends a meld before discarding. */
  laidMeld?: boolean;
  /** Short "why", e.g. "breaks 9♥10♥ run · dumps 9 pts". */
  note: string;
}

export interface ReviewHandCard {
  card: ReviewCard;
  /** Not part of any meld (rendered dimmer). */
  loose: boolean;
  /** "discarded" = the card you threw; "shoulda" = the card the best line threw. */
  mark: "discarded" | "shoulda" | "";
}

/** One of your turns, graded — everything `ReviewReplay` needs to draw a step. */
export interface ReviewTurn {
  turn: number;
  grade: Grade;
  /** Headline equity for your actual play, 0-100. */
  yourPct: number;
  /** Headline equity for the best line, 0-100 (≥ yourPct). */
  bestPct: number;
  /** One-line correction, "" when you played best/good. */
  reason: string;
  /** When a different meld/sapaw line wins: the concrete steps. Null otherwise. */
  bestLine: string[] | null;
  hand: ReviewHandCard[];
  discards: DiscardChoice[];
  /** Weaker discards omitted from the table. */
  moreDiscards: number;
  yourDiscard: string | null;
  bestDiscard: string | null;
  melds: ReviewCard[][];
}
