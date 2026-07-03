import { describe, it, expect } from "vitest";
import { makeRng } from "../engine/deck";
import { CLASSIC } from "./rules";
import { rollStats, rollEV } from "./odds";
import { newGame } from "./game";
import { takeAITurn } from "./ai";

describe("farkle odds + AI", () => {
  it("computes farkle odds by exact enumeration", () => {
    // One die scores only on a 1 or 5 → 4 of 6 farkle.
    expect(rollStats(1, CLASSIC).pFarkle).toBeCloseTo(4 / 6, 6);
    expect(rollStats(1, CLASSIC).avgGain).toBeCloseTo(75, 6); // (100 + 50) / 2
    // More dice → far less likely to farkle.
    expect(rollStats(6, CLASSIC).pFarkle).toBeLessThan(0.05);
    expect(rollStats(2, CLASSIC).pFarkle).toBeGreaterThan(rollStats(3, CLASSIC).pFarkle);
  });

  it("banks a big pile on few dice, presses a small pile on many", () => {
    expect(rollEV(1200, 1, CLASSIC)).toBeLessThan(0); // huge risk, one die → bank
    expect(rollEV(100, 6, CLASSIC)).toBeGreaterThan(0); // safe, small pile → roll
  });

  it("plays a full AI-vs-AI game to a winner", () => {
    let s = newGame(CLASSIC, ["A", "B"], [true, true]);
    const rng = makeRng(7);
    let guard = 0;
    while (!s.result && guard++ < 5000) s = takeAITurn(s, rng);
    expect(s.result).not.toBeNull();
    expect(Math.max(...s.players.map((p) => p.score))).toBeGreaterThanOrEqual(CLASSIC.target);
  });
});
