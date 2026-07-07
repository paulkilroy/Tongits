// The tunable house rules. This is the single source of truth the engine reads,
// and exactly what the in-app **House Rules** screen will edit — every field here
// is one row/toggle on that screen.

/** What happens when the stock (draw pile) runs out. */
export type StockExhaustionRule =
  | "lowestHandWins" // round ends, lowest hand-point total wins
  | "lastDrawerLoses"; // the player who drew the final card loses ("burned card")

export interface RuleSet {
  /** 2 or 3 seats. A missing 3rd seat can be an AI or a remote human. */
  playerCount: 2 | 3;

  /** Laban / Fight: a player may "call" for a showdown; others fight or fold,
   *  and the lowest hand wins the round. (Confirmed ON for Paul & Ella.) */
  enableLaban: boolean;

  /** Require at least one meld on the table before a player may call a fight. */
  mustHaveMeldToCall: boolean;

  /** Allow "sapaw" (laying off) onto *opponents'* melds, not just your own. */
  allowSapawOnOpponents: boolean;

  /** When your meld is sapawed you can't Laban: true = for the rest of the round,
   *  false = only your very next turn. */
  sapawLockAllRound: boolean;

  /** Going out by emptying your hand ("Tongits") is an instant win worth this bonus. */
  tongitsBonus: number;

  /** Whether opponents may contest an instant Tongits win. */
  challengeAfterTongits: boolean;

  /** What happens when the draw pile is exhausted. */
  stockExhaustion: StockExhaustionRule;

  /** Number of games (rounds) a player must win to take the match. We play to 5. */
  gamesToWin: number;

  /** Play-money stake per game (pesos). Online all-human games settle wallets by this. */
  stake: number;

  /** Include the two jokers as wildcards. Default off. */
  useJokers: boolean;
}

/** The defaults Paul & Ella start from; tune from the House Rules screen. */
export const STANDARD_RULES: RuleSet = {
  playerCount: 2,
  enableLaban: true,
  mustHaveMeldToCall: true,
  allowSapawOnOpponents: true,
  sapawLockAllRound: false, // Paul's table: sapaw blocks Laban only the next turn
  tongitsBonus: 0,
  challengeAfterTongits: false,
  stockExhaustion: "lowestHandWins",
  gamesToWin: 5,
  stake: 10,
  useJokers: false,
};
