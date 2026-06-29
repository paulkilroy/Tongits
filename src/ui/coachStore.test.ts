import { describe, it, expect } from "vitest";
import { type TurnGrade } from "../engine/analysis";
import { emptyStats, tallyGame, accuracy, avgGap } from "./coachStore";

const tg = (grade: TurnGrade["grade"], your: number, best: number): TurnGrade => ({
  turn: 1,
  grade,
  yourPct: your,
  bestPct: best,
  reason: "",
  yourDiscard: null,
  bestDiscard: null,
  discards: [],
  moreDiscards: 0,
  bestLine: null,
});

describe("coach (grade) tally", () => {
  it("counts grades, sums the win% given up, and derives accuracy + avg gap", () => {
    let s = emptyStats();
    s = tallyGame(s, [tg("best", 70, 70), tg("good", 65, 68), tg("mistake", 40, 60)]);
    expect(s.games).toBe(1);
    expect(s.turns).toBe(3);
    expect(s.grades.best).toBe(1);
    expect(s.grades.good).toBe(1);
    expect(s.grades.mistake).toBe(1);
    expect(s.gapSum).toBe(23); // 0 + 3 + 20
    expect(accuracy(s)).toBe(67); // 2 of 3 best/good
    expect(avgGap(s)).toBe(7.7); // 23 / 3
  });

  it("accumulates across games", () => {
    let s = emptyStats();
    s = tallyGame(s, [tg("best", 70, 70)]);
    s = tallyGame(s, [tg("inaccuracy", 50, 58)]);
    expect(s.games).toBe(2);
    expect(s.turns).toBe(2);
    expect(s.grades.inaccuracy).toBe(1);
  });
});
