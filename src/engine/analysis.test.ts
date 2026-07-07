import { describe, it, expect } from "vitest";
import { STANDARD_RULES } from "./rules";
import { newRound, type GameState } from "./game";
import { takeAITurn } from "./ai";
import { analyzeTurns, type Grade } from "./analysis";

function playAndRecord(seed: number): GameState[] {
  let s = newRound({ ...STANDARD_RULES, playerCount: 2 }, seed, ["You", "Bot"], [true, true]);
  const history = [s];
  let guard = 0;
  while (!s.result && guard++ < 400) {
    const next = takeAITurn(s);
    if (next === s) break;
    s = next;
    history.push(s);
  }
  return history;
}

const GRADES: Grade[] = ["best", "good", "inaccuracy", "mistake"];

describe("play analysis", () => {
  it("grades each of your turns with a valid, ranked result", () => {
    const history = playAndRecord(11);
    const grades = analyzeTurns(history, 0, 16);
    expect(grades.length).toBeGreaterThan(0);
    for (const g of grades) {
      expect(GRADES).toContain(g.grade);
      expect(g.yourPct).toBeGreaterThanOrEqual(0);
      expect(g.yourPct).toBeLessThanOrEqual(100);
      // the best line is never worse than what you played (within MC noise)
      expect(g.bestPct).toBeGreaterThanOrEqual(g.yourPct - 15);
      // Corrected turns (inaccuracy/mistake) explain themselves; "good" is a
      // within-noise near-tie and intentionally carries no correction.
      if (g.grade === "inaccuracy" || g.grade === "mistake") expect(g.reason.length).toBeGreaterThan(0);
    }
  });

  it("reports progress from 0 to 1", () => {
    const history = playAndRecord(4);
    let last = 0;
    analyzeTurns(history, 0, 8, (f) => {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      last = f;
    });
    expect(last).toBeGreaterThan(0);
  });
});
