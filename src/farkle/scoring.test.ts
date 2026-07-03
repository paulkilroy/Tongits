import { describe, it, expect } from "vitest";
import { scoreDice, hasScore } from "./scoring";
import { CLASSIC, ZILCH } from "./rules";

describe("farkle scoring", () => {
  it("scores singles", () => {
    expect(scoreDice([1], CLASSIC)).toEqual({ score: 100, allScoring: true });
    expect(scoreDice([5], CLASSIC)).toEqual({ score: 50, allScoring: true });
    expect(scoreDice([1, 5], CLASSIC)).toEqual({ score: 150, allScoring: true });
  });

  it("marks non-scoring dice as leftover (not all-scoring)", () => {
    expect(scoreDice([2, 3, 4], CLASSIC)).toEqual({ score: 0, allScoring: false });
    expect(scoreDice([1, 2, 3], CLASSIC)).toEqual({ score: 100, allScoring: false }); // the 1 scores, 2/3 don't
  });

  it("scores three of a kind", () => {
    expect(scoreDice([1, 1, 1], CLASSIC).score).toBe(1000);
    expect(scoreDice([2, 2, 2], CLASSIC).score).toBe(200);
    expect(scoreDice([6, 6, 6], CLASSIC).score).toBe(600);
    expect(scoreDice([1, 1, 1, 5, 5], CLASSIC).score).toBe(1100); // trips + two 5s
  });

  it("scores 4/5/6-of-a-kind by ruleset", () => {
    // classic doubles the triple each extra die
    expect(scoreDice([1, 1, 1, 1], CLASSIC).score).toBe(2000);
    expect(scoreDice([2, 2, 2, 2, 2], CLASSIC).score).toBe(800); // 200 × 4
    expect(scoreDice([5, 5, 5, 5, 5, 5], CLASSIC).score).toBe(4000); // 500 × 8
    // zilch is flat
    expect(scoreDice([1, 1, 1, 1], ZILCH).score).toBe(1000);
    expect(scoreDice([2, 2, 2, 2, 2], ZILCH).score).toBe(2000);
    expect(scoreDice([6, 6, 6, 6, 6, 6], ZILCH).score).toBe(3000);
  });

  it("scores six-dice specials", () => {
    expect(scoreDice([1, 2, 3, 4, 5, 6], CLASSIC).score).toBe(1500); // straight
    expect(scoreDice([2, 2, 3, 3, 4, 4], CLASSIC).score).toBe(1500); // three pairs
    // two triplets: a Zilch combo (2500) but not classic (falls to 200+300=500)
    expect(scoreDice([2, 2, 2, 3, 3, 3], ZILCH).score).toBe(2500);
    expect(scoreDice([2, 2, 2, 3, 3, 3], CLASSIC).score).toBe(500);
  });

  it("detects farkles", () => {
    expect(hasScore([2, 3, 4, 6, 6, 2], CLASSIC)).toBe(false);
    expect(hasScore([2, 3, 4], CLASSIC)).toBe(false);
    expect(hasScore([2, 3, 5], CLASSIC)).toBe(true); // the 5 scores
    expect(hasScore([3, 3, 3], CLASSIC)).toBe(true); // trips
  });
});
