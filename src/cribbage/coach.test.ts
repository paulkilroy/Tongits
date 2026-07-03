import { describe, it, expect } from "vitest";
import { card } from "../engine/cards";
import { analyzeDiscard, gradeDiscard } from "./coach";

const C = card;

describe("cribbage discard coach", () => {
  it("ranks all 15 choices and keeps the obvious monster", () => {
    // 4-5-5-6 is a huge keep (double run + fifteens); J and K are junk.
    const hand = [C("4", "clubs"), C("5", "diamonds"), C("5", "hearts"), C("6", "spades"), C("J", "clubs"), C("K", "diamonds")];
    const evs = analyzeDiscard(hand, true, 120);
    expect(evs).toHaveLength(15);
    // best keep should be the 4-5-5-6 (discard J, K)
    const bestKeepRanks = evs[0].keep.map((c) => c.rank).sort();
    expect(bestKeepRanks).toEqual(["4", "5", "5", "6"]);
    // sorted descending by net
    for (let i = 1; i < evs.length; i++) expect(evs[i - 1].net).toBeGreaterThanOrEqual(evs[i].net);
  });

  it("owning the crib raises the value of a good lay-away vs giving it away", () => {
    const hand = [C("5", "clubs"), C("5", "diamonds"), C("6", "hearts"), C("7", "spades"), C("8", "clubs"), C("9", "diamonds")];
    const asDealer = analyzeDiscard(hand, true, 200);
    const asPone = analyzeDiscard(hand, false, 200);
    // With the same hand, the best net is at least as high when the crib is yours.
    expect(asDealer[0].net).toBeGreaterThan(asPone[0].net);
  });

  it("grades the chosen keep against the best", () => {
    const hand = [C("4", "clubs"), C("5", "diamonds"), C("5", "hearts"), C("6", "spades"), C("J", "clubs"), C("K", "diamonds")];
    const evs = analyzeDiscard(hand, true, 120);
    // keeping the best → "best"
    expect(gradeDiscard(evs, evs[0].keep).grade).toBe("best");
    // keeping the worst → gives up real EV
    const worst = evs[evs.length - 1];
    const g = gradeDiscard(evs, worst.keep);
    expect(g.lost).toBeGreaterThan(0);
  });
});
