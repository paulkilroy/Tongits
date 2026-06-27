import { describe, it, expect } from "vitest";
import { STANDARD_RULES } from "./rules";
import { newRound } from "./game";
import { takeAITurn } from "./ai";

// Integration guard: play complete all-AI games across many seeds and confirm
// every round reaches a valid result without stalling or looping forever.

function playOut(seed: number, players: 2 | 3) {
  const names = ["A", "B", "C"].slice(0, players);
  let s = newRound({ ...STANDARD_RULES, playerCount: players }, seed, names, names.map(() => true));
  let turns = 0;
  while (!s.result && turns < 1000) {
    const next = takeAITurn(s);
    expect(next).not.toBe(s); // must always make progress
    s = next;
    turns++;
  }
  return s;
}

describe("full-game simulation", () => {
  it("every 2-player game ends with a valid result", () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = playOut(seed, 2);
      expect(s.result).not.toBeNull();
      expect(["tongits", "showdown", "stockEmpty"]).toContain(s.result!.reason);
      // winner is a real player index or -1 (tie)
      expect(s.result!.winner).toBeGreaterThanOrEqual(-1);
      expect(s.result!.winner).toBeLessThan(2);
    }
  });

  it("every 3-player game ends with a valid result", () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = playOut(seed, 3);
      expect(s.result).not.toBeNull();
      expect(s.result!.winner).toBeLessThan(3);
    }
  });
});
