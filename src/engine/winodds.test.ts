import { describe, it, expect } from "vitest";
import { STANDARD_RULES } from "./rules";
import { newRound } from "./game";
import { estimateWinOdds, winOddsSeries } from "./winodds";

describe("win odds (monte carlo)", () => {
  it("returns a probability in [0,1]", () => {
    const s = newRound({ ...STANDARD_RULES, playerCount: 2 }, 7, ["You", "Bot"], [false, true]);
    const p = estimateWinOdds(s, 0, 60);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it("a fresh heads-up deal is roughly competitive (not 0 or 100%)", () => {
    const s = newRound({ ...STANDARD_RULES, playerCount: 2 }, 3, ["You", "Bot"], [false, true]);
    const p = estimateWinOdds(s, 0, 120);
    expect(p).toBeGreaterThan(0.1);
    expect(p).toBeLessThan(0.9);
  });

  it("produces one win-% point per decision state", () => {
    const s = newRound({ ...STANDARD_RULES, playerCount: 2 }, 1, ["You", "Bot"], [false, true]);
    const series = winOddsSeries([s], 0, 20);
    expect(series).toHaveLength(1);
    expect(series[0].turn).toBe(1);
    expect(series[0].pct).toBeGreaterThanOrEqual(0);
    expect(series[0].pct).toBeLessThanOrEqual(100);
  });
});
