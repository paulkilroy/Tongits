import { describe, it, expect } from "vitest";
import { card, cardPoints, rankOrder, compareCards, cardLabel } from "./cards";

describe("card scoring", () => {
  it("face cards are worth ten", () => {
    expect(cardPoints(card("K", "spades"))).toBe(10);
    expect(cardPoints(card("Q", "hearts"))).toBe(10);
    expect(cardPoints(card("J", "clubs"))).toBe(10);
  });

  it("ace is worth one and pips are face value", () => {
    expect(cardPoints(card("A", "spades"))).toBe(1);
    expect(cardPoints(card("7", "diamonds"))).toBe(7);
  });
});

describe("card ordering", () => {
  it("rankOrder is ace-low through king", () => {
    expect(rankOrder("A")).toBe(1);
    expect(rankOrder("10")).toBe(10);
    expect(rankOrder("K")).toBe(13);
  });

  it("compareCards groups by suit then rank", () => {
    const hand = [card("K", "clubs"), card("A", "spades"), card("2", "clubs")];
    const sorted = hand.slice().sort(compareCards).map(cardLabel);
    expect(sorted).toEqual(["2♣", "K♣", "A♠"]);
  });
});
