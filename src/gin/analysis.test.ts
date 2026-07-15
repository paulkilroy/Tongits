import { describe, it, expect } from "vitest";
import { analyzeGinTurns } from "./analysis";
import { type GinObs } from "./review";
import { type Card } from "../engine/cards";

const c = (rank: string, suit: string): Card => ({ rank: rank as never, suit: suit as never });
const obs = (myTurns: GinObs["myTurns"], oppPickups = 0, oppTurns = 0): GinObs => ({
  myTurns,
  oppPickups,
  oppTurns,
  oppDiscards: [],
});

// Melds to 3 deadwood after throwing the K (run + set + lone 3); the 2 is the only
// other loose card, so the K is clearly the deadwood-minimising throw.
const hand8: Card[] = [
  c("4", "hearts"), c("5", "hearts"), c("6", "hearts"),
  c("7", "clubs"), c("7", "diamonds"), c("7", "spades"),
  c("3", "clubs"), c("K", "spades"),
];

describe("gin analysis → shared ReviewTurn", () => {
  it("ranks every discard by chance of success, best first", () => {
    const turns = analyzeGinTurns(obs([{ hand8, discarded: c("K", "spades"), drewDiscard: false }], 0, 2));
    expect(turns).toHaveLength(1);
    const t = turns[0];
    // One row per card in hand, sorted descending by pct.
    expect(t.discards).toHaveLength(8);
    for (let i = 1; i < t.discards.length; i++) {
      expect(t.discards[i - 1].pct).toBeGreaterThanOrEqual(t.discards[i].pct);
    }
    // Throwing the K keeps the most structure → it should be the top choice.
    expect(t.discards[0].card.label).toContain("K");
  });

  it("throwing the K is the best play (no correction)", () => {
    const t = analyzeGinTurns(obs([{ hand8, discarded: c("K", "spades"), drewDiscard: false }], 0, 2))[0];
    expect(t.grade).toBe("best");
    expect(t.reason).toBe("");
    expect(t.yourDiscard).toBe("K-spades");
  });

  it("throwing a melded 7 is a mistake and names the better card", () => {
    const t = analyzeGinTurns(obs([{ hand8, discarded: c("7", "spades"), drewDiscard: false }], 0, 2))[0];
    expect(t.yourPct).toBeLessThan(t.bestPct);
    expect(t.grade).not.toBe("best");
    expect(t.bestDiscard).toBe("K-spades");
    expect(t.reason).toMatch(/K/);
  });
});
