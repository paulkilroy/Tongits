import { describe, it, expect } from "vitest";
import { card } from "../engine/cards";
import { chooseDiscard, choosePlay, takeAITurn } from "./ai";
import {
  newRound,
  nextShow,
  roundComplete,
  STANDARD_CRIB_RULES,
  type CribState,
} from "./game";

describe("cribbage AI", () => {
  it("keeps a monster hand (four 5s) and lays away the junk", () => {
    const hand = [
      card("5", "clubs"),
      card("5", "diamonds"),
      card("5", "hearts"),
      card("5", "spades"),
      card("J", "clubs"),
      card("K", "diamonds"),
    ];
    for (const ownsCrib of [true, false]) {
      const discard = chooseDiscard(hand, ownsCrib);
      expect(discard).toHaveLength(2);
      expect(discard.every((c) => c.rank !== "5")).toBe(true); // never break the four 5s
    }
  });

  it("pegs the fifteen when it can", () => {
    const s = {
      total: 7,
      seq: [card("7", "clubs")],
      players: [{ hand: [card("8", "diamonds"), card("2", "hearts")] }, { hand: [] }],
    } as unknown as CribState;
    expect(choosePlay(s, 0)!.rank).toBe("8"); // 7 + 8 = 15
  });

  it("plays a full AI-vs-AI game to a 121 winner", () => {
    let s = newRound(STANDARD_CRIB_RULES, 3, ["A", "B"], [true, true], 0);
    let dealer = 0;
    let guard = 0;
    const scores = () => s.players.map((p) => p.score);
    while (!s.result && guard++ < 300) {
      // discards
      let g = 0;
      while (s.phase === "discard" && g++ < 4) s = takeAITurn(s);
      // pegging
      g = 0;
      while (s.phase === "play" && g++ < 100) s = takeAITurn(s);
      // show
      while (s.phase === "show" && !roundComplete(s)) s = nextShow(s);
      if (s.result) break;
      dealer = (dealer + 1) % 2;
      s = newRound(STANDARD_CRIB_RULES, 3 + guard, ["A", "B"], [true, true], dealer, scores());
    }
    expect(s.result).not.toBeNull();
    expect(Math.max(...scores())).toBeGreaterThanOrEqual(121);
  });
});
