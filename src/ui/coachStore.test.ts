import { describe, it, expect } from "vitest";
import { type GameReviewResult } from "../engine/review";
import { emptyStats, tallyGame, rankedLeaks } from "./coachStore";

function review(notesPerTurn: string[][]): GameReviewResult {
  return {
    summary: [],
    turns: notesPerTurn.map((tags, i) => ({
      turn: i + 1,
      deadwoodPts: 0,
      opponents: [],
      draws: [],
      notes: tags.map((tag) => ({ level: "warn" as const, tag: tag as never, text: tag })),
    })),
  };
}

describe("coach tally", () => {
  it("counts each leak once per turn and tracks games/turns/wins", () => {
    let s = emptyStats();
    // Turn 1: high deadwood + missed sapaw. Turn 2: high deadwood (dup tag ignored within turn).
    s = tallyGame(s, review([["high-deadwood", "missed-sapaw"], ["high-deadwood", "high-deadwood"]]), true);
    expect(s.games).toBe(1);
    expect(s.turns).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.tags["high-deadwood"]).toBe(2); // once per turn, both turns
    expect(s.tags["missed-sapaw"]).toBe(1);
  });

  it("ignores 'clean' turns and ranks leaks by frequency", () => {
    let s = emptyStats();
    s = tallyGame(s, review([["clean"], ["missed-sapaw"], ["missed-sapaw"], ["dead-draw"]]), false);
    const ranked = rankedLeaks(s);
    expect(ranked[0].tag).toBe("missed-sapaw");
    expect(ranked[0].count).toBe(2);
    expect(ranked.find((l) => l.tag === "dead-draw")?.count).toBe(1);
    expect(ranked.some((l) => (l.tag as string) === "clean")).toBe(false);
  });

  it("accumulates across games", () => {
    let s = emptyStats();
    s = tallyGame(s, review([["high-deadwood"]]), true);
    s = tallyGame(s, review([["high-deadwood"]]), false);
    expect(s.games).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.tags["high-deadwood"]).toBe(2);
  });
});
