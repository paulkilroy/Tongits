// The multiplayer Tongits money model (Paul's table). A carrying POT that builds
// via antes and is scooped when the "heater" (last winner) wins twice in a row.
// This module is PURE and fully unit-tested — no wallet or network here — so the
// rules are verified before any balance changes. See memory: tongits-betting.

export const ANTE = 20; // into the pot at a new game / after a scoop
export const RE_ANTE = 10; // into the pot after every other hand
export const WIN_PAY = 10; // each loser → winner, on a normal (non-Laban) hand
export const FOLD_PAY = 10; // fold → the Laban caller
export const FIGHT_PAY = 20; // fight, pairwise vs the caller

export interface BetState {
  pot: number;
  heater: number | null; // seat of the last hand's winner
  heaterStreak: number; // consecutive wins by the heater
}

export type LabanResponse = "caller" | "fold" | "fight";

export interface HandOutcome {
  playerCount: number;
  /** The hand winner (heater candidate). For a Laban hand this is the lowest of
   *  the caller + fighters (folders are out; caller loses ties). */
  winner: number;
  /** Present when the hand ended via Laban, for the pairwise fold/fight payments. */
  laban?: {
    caller: number;
    responses: LabanResponse[]; // per seat
    handPoints: number[]; // unmatched points per seat, for the pairwise compare
  };
}

export const freshBet = (): BetState => ({ pot: 0, heater: null, heaterStreak: 0 });

/** Open a new match: everyone antes ₱20, seeding the pot. */
export function openMatch(playerCount: number): { deltas: number[]; bet: BetState } {
  return {
    deltas: new Array(playerCount).fill(-ANTE),
    bet: { pot: playerCount * ANTE, heater: null, heaterStreak: 0 },
  };
}

/** Which seat wins a Laban hand (heater): lowest unmatched among the caller and
 *  the fighters; folders are out; the caller loses ties (needed strictly lower). */
export function labanWinner(caller: number, responses: LabanResponse[], handPoints: number[]): number {
  const contenders = responses
    .map((r, i) => (i === caller || r === "fight" ? i : -1))
    .filter((i) => i >= 0);
  const min = Math.min(...contenders.map((i) => handPoints[i]));
  const lowest = contenders.filter((i) => handPoints[i] === min);
  if (lowest.length === 1) return lowest[0];
  const notCaller = lowest.filter((i) => i !== caller); // caller loses ties
  return (notCaller.length ? notCaller : lowest)[0];
}

/**
 * Settle a finished hand: apply the side payments, update the heater/pot, scoop
 * the pot on a back-to-back win, and re-ante for the next hand. Returns each
 * seat's wallet delta and the new bet state.
 */
export function settleHand(bet: BetState, o: HandOutcome): { deltas: number[]; bet: BetState; potScooped: boolean } {
  const N = o.playerCount;
  const deltas = new Array(N).fill(0);
  const pay = (from: number, to: number, amt: number) => {
    deltas[from] -= amt;
    deltas[to] += amt;
  };

  // 1. Side payments for this hand.
  if (o.laban) {
    const { caller, responses, handPoints } = o.laban;
    for (let i = 0; i < N; i++) {
      if (i === caller) continue;
      if (responses[i] === "fold") pay(i, caller, FOLD_PAY);
      else if (responses[i] === "fight") {
        // pairwise: strictly-lower unmatched wins ₱20; a tie goes to the fighter
        if (handPoints[caller] < handPoints[i]) pay(i, caller, FIGHT_PAY);
        else pay(caller, i, FIGHT_PAY);
      }
    }
  } else if (o.winner >= 0) {
    for (let i = 0; i < N; i++) if (i !== o.winner) pay(i, o.winner, WIN_PAY);
  }

  // 2. Heater + pot scoop.
  let { pot, heater, heaterStreak: streak } = bet;
  let potScooped = false;
  if (o.winner >= 0) {
    if (heater === o.winner) streak += 1;
    else {
      heater = o.winner;
      streak = 1;
    }
    if (streak >= 2) {
      deltas[o.winner] += pot; // scoop the whole pot
      potScooped = true;
      pot = 0;
      streak = 1; // reset the streak after a scoop
    }
  }

  // 3. Re-ante for the next hand (fresh ₱20 right after a scoop, else ₱10).
  const anteEach = potScooped ? ANTE : RE_ANTE;
  for (let i = 0; i < N; i++) {
    deltas[i] -= anteEach;
    pot += anteEach;
  }

  return { deltas, bet: { pot, heater, heaterStreak: streak }, potScooped };
}
