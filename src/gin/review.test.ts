import { describe, it, expect } from "vitest";
import { reviewGinHand, estimateOppDeadwood, type GinObs } from "./review";
import { type Card } from "../engine/cards";

const c = (rank: string, suit: string): Card => ({ rank: rank as never, suit: suit as never });
const obs = (myTurns: GinObs["myTurns"], oppPickups = 0, oppTurns = 0): GinObs => ({
  myTurns,
  oppPickups,
  oppTurns,
  oppDiscards: [],
});

// A hand that melds to exactly 3 deadwood after throwing the K (run + set + lone 3).
const hand3: Card[] = [
  c("4", "hearts"), c("5", "hearts"), c("6", "hearts"),
  c("7", "clubs"), c("7", "diamonds"), c("7", "spades"),
  c("3", "clubs"), c("K", "spades"),
];

describe("gin discard grading", () => {
  it("best discard vs a wasteful one", () => {
    const hand8: Card[] = [
      c("4", "hearts"), c("5", "hearts"), c("6", "hearts"),
      c("7", "clubs"), c("7", "diamonds"), c("7", "spades"),
      c("2", "clubs"), c("K", "spades"),
    ];
    expect(reviewGinHand(obs([{ hand8, discarded: c("K", "spades"), drewDiscard: false }])).turns[0].grade).toBe("best");
    const bad = reviewGinHand(obs([{ hand8, discarded: c("2", "clubs"), drewDiscard: false }]));
    expect(bad.turns[0].grade).toBe("mistake");
    expect(bad.turns[0].best).toEqual(c("K", "spades"));
  });
});

describe("gin knock timing vs opponent estimate", () => {
  it("estimate drops with pickups and turns", () => {
    expect(estimateOppDeadwood(0, 0)).toBeGreaterThan(estimateOppDeadwood(3, 6));
    expect(estimateOppDeadwood(4, 10)).toBe(2); // clamps low
  });

  it("a knock vs a fresh-looking opponent reads as strong", () => {
    const r = reviewGinHand(obs([{ hand8: hand3, discarded: c("K", "spades"), drewDiscard: false }], 0, 2));
    expect(r.knock?.verdict).toBe("strong"); // est opp ~19 vs your 3
  });

  it("the same knock against an opponent who's been loading up reads as risky", () => {
    const r = reviewGinHand(obs([{ hand8: hand3, discarded: c("K", "spades"), drewDiscard: false }], 4, 8));
    expect(r.knock?.verdict).toBe("risky"); // est opp ~2, no lead → undercut danger
    expect(r.knock?.note).toMatch(/undercut/i);
  });

  it("going out with zero deadwood is gin", () => {
    const ginHand: Card[] = [
      c("4", "hearts"), c("5", "hearts"), c("6", "hearts"), c("7", "hearts"),
      c("8", "clubs"), c("8", "diamonds"), c("8", "spades"),
      c("K", "spades"),
    ];
    const r = reviewGinHand(obs([{ hand8: ginHand, discarded: c("K", "spades"), drewDiscard: false }], 3, 6));
    expect(r.knock?.gin).toBe(true);
    expect(r.knock?.verdict).toBe("gin");
  });
});
