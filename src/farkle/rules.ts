// "Press Your Luck" — a press-your-luck dice game (Farkle / Zilch family). The
// scoring varies by house ruleset, so the engine reads a FarkleRules; two presets
// ship (classic Farkle and Zilch) and the player picks per game.

export interface FarkleRules {
  name: string;
  /** Points to win the game. */
  target: number;
  /** Points you must bank in a single turn before you're "on the board". 0 = none. */
  onBoardMin: number;
  /** 4/5/6-of-a-kind scoring: "double" the triple each time, or "flat" 1000/2000/3000. */
  nOfKind: "double" | "flat";
  /** 1–6 straight (all six dice). */
  straight: number;
  /** Three pairs (all six dice). */
  threePairs: number;
  /** Two triplets (all six dice); 0 = not a special combo. */
  twoTriplets: number;
  /** Penalty when you farkle N turns in a row (0 = no penalty). */
  farkleStreakPenalty: number;
  /** How many consecutive farkles trigger the penalty. */
  farkleStreakLen: number;
  /** Piggyback: after a bank, the next player may take the banked turn-score and
   *  roll the leftover dice instead of rolling a fresh six. */
  piggyback: boolean;
}

export const CLASSIC: FarkleRules = {
  name: "Farkle",
  target: 10000,
  onBoardMin: 500,
  nOfKind: "double",
  straight: 1500,
  threePairs: 1500,
  twoTriplets: 0,
  farkleStreakPenalty: 0,
  farkleStreakLen: 3,
  piggyback: true,
};

export const ZILCH: FarkleRules = {
  name: "Zilch",
  target: 10000,
  onBoardMin: 0,
  nOfKind: "flat",
  straight: 1500,
  threePairs: 1500,
  twoTriplets: 2500,
  farkleStreakPenalty: 500,
  farkleStreakLen: 3,
  piggyback: false,
};

export const RULESETS = { classic: CLASSIC, zilch: ZILCH } as const;
export type RulesetKey = keyof typeof RULESETS;
