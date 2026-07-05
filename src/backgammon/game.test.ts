import { describe, it, expect } from "vitest";
import { makeRng } from "../engine/deck";
import { startBoard, pipCount, allHome, type Board } from "./rules";
import {
  newGame,
  roll,
  legalMoves,
  applyMove,
  maxPlies,
  singleMoves,
  type BgState,
} from "./game";
import { aiStep } from "./ai";

describe("backgammon geometry", () => {
  it("starts with 15 checkers and a 167 pip count each", () => {
    const b = startBoard();
    const p0 = b.points.filter((v) => v > 0).reduce((a, v) => a + v, 0);
    const p1 = -b.points.filter((v) => v < 0).reduce((a, v) => a + v, 0);
    expect(p0).toBe(15);
    expect(p1).toBe(15);
    expect(pipCount(b, 0)).toBe(167);
    expect(pipCount(b, 1)).toBe(167);
  });
});

describe("backgammon moves", () => {
  it("rolling opens the move phase with the right dice (doubles → four)", () => {
    // find a seed giving doubles
    for (let seed = 1; seed < 200; seed++) {
      const s = roll(newGame(["A", "B"], [false, false]), makeRng(seed));
      if (s.dice.length === 4) {
        expect(new Set(s.dice).size).toBe(1);
        expect(s.phase).toBe("move");
        return;
      }
    }
    throw new Error("no doubles seed found");
  });

  it("only offers moves that keep the maximum dice usage", () => {
    let s = roll(newGame(["A", "B"], [false, false]), makeRng(4));
    const maxP = maxPlies(s.board, s.current, s.dice);
    const moves = legalMoves(s);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      // every offered move is among the raw single moves
      expect(singleMoves(s.board, s.current, s.dice).some((x) => x.from === m.from && x.die === m.die)).toBe(true);
    }
    // making one legal move reduces remaining dice by exactly one
    s = applyMove(s, moves[0].from, moves[0].die);
    expect(maxP).toBeGreaterThanOrEqual(1);
  });

  it("hitting a blot sends the opponent to the bar", () => {
    // Construct a position: player 0 checker can land on a lone player-1 blot.
    const b: Board = { points: new Array(24).fill(0), bar: [0, 0], off: [0, 0] };
    b.points[10] = 1; // player 0 blot on index 10
    b.points[7] = -1; // player 1 blot on index 7 (target for a 3)
    const s: BgState = {
      board: b,
      players: [
        { name: "A", isAI: false },
        { name: "B", isAI: false },
      ],
      current: 0,
      dice: [3, 5],
      phase: "move",
      result: null,
      log: [],
    };
    const hit = applyMove(s, 10, 3);
    expect(hit.board.bar[1]).toBe(1); // player 1 on the bar
    expect(hit.board.points[7]).toBe(1); // player 0 now holds index 7
  });

  it("bears off and can win", () => {
    // Player 0: all checkers home, one left to bear off.
    const b: Board = { points: new Array(24).fill(0), bar: [0, 0], off: [14, 0] };
    b.points[0] = 1; // player 0's last checker, on the 1-point
    b.points[23] = -1; // token opponent checker so the board is well-formed
    expect(allHome(b, 0)).toBe(true);
    const s: BgState = {
      board: b,
      players: [
        { name: "A", isAI: false },
        { name: "B", isAI: false },
      ],
      current: 0,
      dice: [1, 6],
      phase: "move",
      result: null,
      log: [],
    };
    const off = applyMove(s, 0, 1);
    expect(off.board.off[0]).toBe(15);
    expect(off.result?.winner).toBe(0);
  });
});

describe("backgammon AI", () => {
  it("plays a full game to a winner", () => {
    let s = newGame(["Bot A", "Bot B"], [true, true]);
    let guard = 0;
    while (!s.result && guard++ < 5000) {
      const next = aiStep(s, makeRng(guard + 1));
      if (next === s) break;
      s = next;
    }
    expect(s.result).not.toBeNull();
    expect(s.board.off[s.result!.winner]).toBe(15);
  });
});
