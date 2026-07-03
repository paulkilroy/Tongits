import { describe, it, expect } from "vitest";
import { makeRng } from "../engine/deck";
import { CLASSIC, ZILCH } from "./rules";
import { bestKeep } from "./scoring";
import { newGame, roll, setAside, bank, canBank, type FarkleState } from "./game";

/** Greedy auto-player: keep the max scoring dice, bank at ≥ threshold else press. */
function autoTurn(s: FarkleState, rng: () => number, bankAt = 400): FarkleState {
  let guard = 0;
  const start = s.current;
  while (s.current === start && !s.result && guard++ < 40) {
    if (s.phase === "roll") {
      if (canBank(s) && s.turnScore >= bankAt) return bank(s);
      s = roll(s, rng);
    } else if (s.phase === "pick") {
      const { keep } = bestKeep(s.dice, s.rules);
      s = setAside(s, keep);
    } else break;
  }
  return s;
}

describe("farkle game flow", () => {
  it("deals a fresh game", () => {
    const s = newGame(CLASSIC, ["A", "B"], [true, true]);
    expect(s.players).toHaveLength(2);
    expect(s.diceLeft).toBe(6);
    expect(s.phase).toBe("roll");
  });

  it("rolls, sets aside a scoring die, and banks", () => {
    let s = newGame(CLASSIC, ["A", "B"], [false, false]);
    // Force a known non-farkle roll by rolling until one scores (seeded).
    const rng = makeRng(3);
    s = roll(s, rng);
    while (s.phase === "roll" && s.current === 0 && s.turnScore === 0) s = roll(s, rng); // skip farkle→next? guard
    if (s.phase === "pick") {
      const { keep, score } = bestKeep(s.dice, s.rules);
      s = setAside(s, keep);
      expect(s.turnScore).toBe(score);
      expect(s.phase).toBe("roll");
    }
    expect(s.diceLeft).toBeGreaterThanOrEqual(1);
  });

  it("enforces the on-the-board minimum (classic 500)", () => {
    // A player with a small turn total can't bank until they're on the board.
    let s = newGame(CLASSIC, ["A", "B"], [false, false]);
    s = { ...s, phase: "roll", turnScore: 150 };
    expect(canBank(s)).toBe(false); // 150 < 500 and not on board
    s = { ...s, turnScore: 550 };
    expect(canBank(s)).toBe(true);
  });

  it("zilch lets you bank anytime (no minimum)", () => {
    const s = { ...newGame(ZILCH, ["A", "B"], [false, false]), phase: "roll" as const, turnScore: 100 };
    expect(canBank(s)).toBe(true);
  });

  it("plays a whole game to a winner", () => {
    let s = newGame(CLASSIC, ["A", "B"], [true, true]);
    const rng = makeRng(42);
    let guard = 0;
    while (!s.result && guard++ < 4000) s = autoTurn(s, rng);
    expect(s.result).not.toBeNull();
    expect(Math.max(...s.players.map((p) => p.score))).toBeGreaterThanOrEqual(CLASSIC.target);
    expect(s.phase).toBe("gameOver");
  });

  it("farkles when a roll has no scoring dice", () => {
    // Build a state whose forced roll farkles by seeding until it does.
    let s = newGame(CLASSIC, ["A", "B"], [false, false]);
    for (let seed = 1; seed < 500; seed++) {
      const test = roll({ ...s, diceLeft: 3 }, makeRng(seed));
      if (test.lastFarkle) {
        expect(test.current).toBe(1); // turn passed on
        expect(test.turnScore).toBe(0);
        return;
      }
    }
    throw new Error("no farkle roll found");
  });
});
