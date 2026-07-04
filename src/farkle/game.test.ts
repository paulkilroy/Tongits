import { describe, it, expect } from "vitest";
import { makeRng } from "../engine/deck";
import { CLASSIC, ZILCH } from "./rules";
import { bestKeep } from "./scoring";
import { newGame, roll, setAside, bank, canBank, nextTurn, takePiggyback, type FarkleState } from "./game";

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
    } else if (s.phase === "farkle") {
      s = nextTurn(s);
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
        expect(test.phase).toBe("farkle"); // dice held on the reveal
        expect(test.current).toBe(0); // not passed yet
        const after = nextTurn(test);
        expect(after.current).toBe(1); // resolved → next player
        return;
      }
    }
    throw new Error("no farkle roll found");
  });

  it("leaves a piggyback offer after a Farkle-ruleset bank (not in Zilch)", () => {
    // Bank a turn with dice left over: the next player gets an offer to take it.
    const base: FarkleState = { ...newGame(CLASSIC, ["A", "B"], [false, false]), phase: "roll", turnScore: 600, diceLeft: 3 };
    const after = bank(base);
    expect(after.current).toBe(1); // passed to B
    expect(after.piggyback).toEqual({ score: 600, dice: 3 });

    const z = bank({ ...newGame(ZILCH, ["A", "B"], [false, false]), phase: "roll", turnScore: 600, diceLeft: 3 });
    expect(z.piggyback).toBeNull(); // Zilch has no piggyback
  });

  it("takePiggyback inherits the offered score and rolls the leftover dice", () => {
    const offered: FarkleState = {
      ...newGame(CLASSIC, ["A", "B"], [false, false]),
      current: 1,
      phase: "roll",
      piggyback: { score: 600, dice: 3 },
      diceLeft: 6,
    };
    const took = takePiggyback(offered, makeRng(7));
    expect(took.piggyback).toBeNull(); // consumed
    // Started from 600 and rolled 3 dice → either picking (kept the score) or farkled (lost it).
    if (took.phase === "farkle") expect(took.turnScore).toBe(600);
    else expect(took.turnScore).toBeGreaterThanOrEqual(600);
  });

  it("a fresh roll declines the piggyback offer", () => {
    const offered: FarkleState = {
      ...newGame(CLASSIC, ["A", "B"], [false, false]),
      current: 1,
      phase: "roll",
      piggyback: { score: 600, dice: 3 },
    };
    expect(roll(offered, makeRng(1)).piggyback).toBeNull();
  });

  it("hitting the target opens a final round; everyone else gets one last turn", () => {
    // A banks to the target from seat 0 → last round, B still gets a turn.
    const near: FarkleState = {
      ...newGame(CLASSIC, ["A", "B"], [false, false]),
      phase: "roll",
      turnScore: 10000,
      diceLeft: 2,
    };
    near.players[0].onBoard = true;
    const after = bank(near);
    expect(after.lastRound).toBe(true);
    expect(after.finalTrigger).toBe(0);
    expect(after.result).toBeNull(); // not over yet — B plays
    expect(after.current).toBe(1);

    // B farkles away their last turn → game ends, A (the only scorer) wins.
    const bTurn = { ...after, phase: "farkle" as const };
    const done = nextTurn(bTurn);
    expect(done.result).not.toBeNull();
    expect(done.result?.winner).toBe(0);
    expect(done.phase).toBe("gameOver");
  });

  it("in the final round the highest total wins, even if it's not the trigger", () => {
    const near: FarkleState = {
      ...newGame(CLASSIC, ["A", "B"], [false, false]),
      phase: "roll",
      turnScore: 10000,
      diceLeft: 2,
    };
    near.players[0].onBoard = true;
    near.players[1].onBoard = true;
    near.players[1].score = 9800;
    const after = bank(near); // A at 10000, last round, B to play
    // B banks 500 → 10300, beating A's 10000.
    const bWins = bank({ ...after, phase: "roll", turnScore: 500 });
    expect(bWins.result?.winner).toBe(1);
  });
});
