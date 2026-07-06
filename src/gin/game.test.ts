import { describe, it, expect } from "vitest";
import { newGame, draw, discard, canKnock, nextRound, deadwoodPts, HAND, TARGET, type GinState } from "./game";
import { aiStep } from "./ai";

describe("7-card gin", () => {
  it("deals 7 to each and flips an upcard", () => {
    const s = newGame(["A", "B"], [false, false]);
    s.players.forEach((p) => expect(p.hand).toHaveLength(HAND));
    expect(s.discard).toHaveLength(1);
    expect(s.phase).toBe("draw");
  });

  it("draw then discard passes the turn", () => {
    let s = newGame(["A", "B"], [false, false]);
    const start = s.current;
    s = draw(s, "deck");
    expect(s.players[start].hand).toHaveLength(HAND + 1);
    s = discard(s, cardIdOf(s, start, 0));
    expect(s.current).not.toBe(start);
    expect(s.players[start].hand).toHaveLength(HAND);
  });

  it("only allows a knock at deadwood ≤ 5", () => {
    const s = newGame(["A", "B"], [false, false]);
    // Force a near-gin hand for player 0 with an extra card to discard.
    s.phase = "discard";
    s.current = 0;
    s.players[0].hand = [
      c("4", "hearts"), c("5", "hearts"), c("6", "hearts"),
      c("9", "clubs"), c("9", "diamonds"), c("9", "spades"),
      c("2", "clubs"), // deadwood 2 → knockable after we keep it
      c("K", "spades"), // the card we'll discard (8 cards mid-turn)
    ];
    expect(canKnock(s, cardIdOf(s, 0, 7))).toBe(true); // discard K → deadwood = the 2 (2 pts)
    expect(deadwoodPts(s.players[0].hand.slice(0, 7))).toBe(2);
  });

  it("plays a full AI match to 100", () => {
    let s: GinState = newGame(["Bot A", "Bot B"], [true, true]);
    let guard = 0;
    while (!s.result && guard++ < 20000) {
      if (s.phase === "roundEnd") {
        s = nextRound(s);
        continue;
      }
      const next = aiStep(s);
      if (next === s) break;
      s = next;
    }
    expect(s.result).not.toBeNull();
    expect(Math.max(...s.players.map((p) => p.score))).toBeGreaterThanOrEqual(TARGET);
  });
});

function c(rank: string, suit: string): import("../engine/cards").Card {
  return { rank: rank as never, suit: suit as never };
}
function cardIdOf(s: GinState, player: number, i: number): string {
  const card = s.players[player].hand[i];
  return `${card.rank}-${card.suit}`;
}
