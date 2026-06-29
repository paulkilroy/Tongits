import { describe, it, expect } from "vitest";
import { card } from "./cards";
import { handPoints } from "./scoring";
import { bestMelds, deadwood } from "./meldFinder";

describe("optimal meld finder", () => {
  it("melds everything but the 3♠ (the bug: greedy stranded the 8-9-10 run)", () => {
    const hand = [
      card("Q", "clubs"), card("Q", "diamonds"), card("Q", "hearts"), card("Q", "spades"),
      card("J", "clubs"), card("J", "diamonds"), card("J", "hearts"), card("J", "spades"),
      card("8", "clubs"), card("9", "clubs"), card("10", "clubs"),
      card("3", "spades"),
    ];
    const dw = deadwood(hand);
    expect(dw.map((c) => c.rank + c.suit)).toEqual(["3spades"]);
    expect(handPoints(dw)).toBe(3); // not 30
  });

  it("frees a card from a 4-set to complete a run when that scores better", () => {
    // J♣ is needed by the 8-9-10-J run; the other three J's still form a set.
    const hand = [
      card("J", "clubs"), card("J", "diamonds"), card("J", "hearts"), card("J", "spades"),
      card("8", "clubs"), card("9", "clubs"), card("10", "clubs"),
    ];
    expect(deadwood(hand)).toHaveLength(0); // all 7 cards meld
    expect(bestMelds(hand).length).toBe(2);
  });

  it("leaves genuine deadwood untouched", () => {
    const hand = [card("7", "clubs"), card("7", "hearts"), card("7", "spades"), card("K", "diamonds")];
    expect(deadwood(hand).map((c) => c.rank)).toEqual(["K"]);
  });
});
