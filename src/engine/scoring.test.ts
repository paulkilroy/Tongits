import { describe, it, expect } from "vitest";
import { card } from "./cards";
import { handPoints, isEmptyHand } from "./scoring";

describe("hand scoring", () => {
  it("an empty hand scores zero and counts as gone out", () => {
    expect(handPoints([])).toBe(0);
    expect(isEmptyHand([])).toBe(true);
  });

  it("sums card values with face cards at ten and ace at one", () => {
    // K(10) + 5 + A(1) = 16
    const hand = [card("K", "spades"), card("5", "hearts"), card("A", "clubs")];
    expect(handPoints(hand)).toBe(16);
  });

  it("a non-empty hand is not gone out", () => {
    expect(isEmptyHand([card("2", "clubs")])).toBe(false);
  });
});
