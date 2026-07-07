import { describe, it, expect } from "vitest";
import {
  openMatch,
  settleHand,
  labanWinner,
  freshBet,
  ANTE,
  RE_ANTE,
  type BetState,
  type HandOutcome,
} from "./betting";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("tongits betting — pot / heater / ante", () => {
  it("new match antes ₱20 each into the pot", () => {
    const { deltas, bet } = openMatch(3);
    expect(deltas).toEqual([-20, -20, -20]);
    expect(bet.pot).toBe(60);
    expect(sum(deltas) + bet.pot).toBe(0); // money is conserved
  });

  it("a normal win: losers pay ₱10, all re-ante ₱10, winner becomes heater", () => {
    const bet: BetState = { pot: 60, heater: null, heaterStreak: 0 };
    const { deltas, bet: next, potScooped } = settleHand(bet, { playerCount: 3, winner: 0 });
    // seat 0: +10 +10 from losers − 10 re-ante = +10
    expect(deltas[0]).toBe(0 + 20 - 10);
    expect(deltas[1]).toBe(-10 - 10);
    expect(deltas[2]).toBe(-10 - 10);
    expect(potScooped).toBe(false);
    expect(next.heater).toBe(0);
    expect(next.heaterStreak).toBe(1);
    expect(next.pot).toBe(60 + 30); // three ₱10 re-antes
    expect(sum(deltas) + (next.pot - bet.pot)).toBe(0); // conserved
  });

  it("heater winning twice in a row scoops the pot, then a fresh ₱20 ante", () => {
    let bet: BetState = { pot: 90, heater: 0, heaterStreak: 1 };
    const { deltas, bet: next, potScooped } = settleHand(bet, { playerCount: 3, winner: 0 });
    expect(potScooped).toBe(true);
    // seat 0: +20 (losers) + 90 (pot) − 20 (fresh ante) = +90
    expect(deltas[0]).toBe(20 + 90 - ANTE);
    expect(deltas[1]).toBe(-10 - ANTE);
    expect(next.pot).toBe(3 * ANTE); // reseeded
    expect(next.heaterStreak).toBe(1);
    expect(sum(deltas) + (next.pot - bet.pot)).toBe(0);
  });

  it("a different winner resets the heater streak", () => {
    const bet: BetState = { pot: 100, heater: 0, heaterStreak: 1 };
    const { bet: next, potScooped } = settleHand(bet, { playerCount: 3, winner: 2 });
    expect(potScooped).toBe(false);
    expect(next.heater).toBe(2);
    expect(next.heaterStreak).toBe(1);
  });

  it("every hand conserves money across wallets + pot", () => {
    let bet = openMatch(3).bet;
    const winners = [0, 1, 1, 2, 2, 0, 0, 0];
    for (const w of winners) {
      const before = bet.pot;
      const { deltas, bet: next } = settleHand(bet, { playerCount: 3, winner: w });
      expect(sum(deltas) + (next.pot - before)).toBe(0);
      bet = next;
    }
  });
});

describe("tongits betting — Laban fight/fold", () => {
  const bet: BetState = { pot: 60, heater: null, heaterStreak: 0 };

  it("fold pays the caller ₱10; a fight the caller wins takes ₱20", () => {
    // seat 0 calls; seat 1 folds; seat 2 fights and loses (caller lower).
    const o: HandOutcome = {
      playerCount: 3,
      winner: 0,
      laban: { caller: 0, responses: ["caller", "fold", "fight"], handPoints: [3, 20, 9] },
    };
    const { deltas } = settleHand(bet, o);
    // caller: +10 (fold) +20 (fight) − 10 re-ante = +20 ; seat1: −10 −10 ; seat2: −20 −10
    expect(deltas[0]).toBe(10 + 20 - RE_ANTE);
    expect(deltas[1]).toBe(-10 - RE_ANTE);
    expect(deltas[2]).toBe(-20 - RE_ANTE);
  });

  it("a fighter who beats the caller wins ₱20 and the hand", () => {
    const responses = ["caller", "fight", "fold"] as const;
    const handPoints = [12, 4, 15];
    const winner = labanWinner(0, [...responses], handPoints);
    expect(winner).toBe(1); // fighter 1 is lowest
    const { deltas, bet: next } = settleHand(bet, {
      playerCount: 3,
      winner,
      laban: { caller: 0, responses: [...responses], handPoints },
    });
    // seat2 folded → pays caller 10; seat1 beat caller → caller pays seat1 20
    expect(deltas[0]).toBe(10 - 20 - RE_ANTE); // +10 fold, −20 fight, −10 ante
    expect(deltas[1]).toBe(20 - RE_ANTE);
    expect(deltas[2]).toBe(-10 - RE_ANTE);
    expect(next.heater).toBe(1);
  });

  it("labanWinner: caller loses ties among fighters", () => {
    // caller (0) ties the fighter (2) at 5; caller loses the tie.
    expect(labanWinner(0, ["caller", "fold", "fight"], [5, 30, 5])).toBe(2);
    // caller alone (everyone folded) wins.
    expect(labanWinner(0, ["caller", "fold", "fold"], [9, 1, 1])).toBe(0);
  });
});
