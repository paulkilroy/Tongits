import { describe, it, expect } from "vitest";
import { newGame, draw, discard, nextRound, handAnalysis, canPayMe, type SFState } from "./game";
import { aiStep } from "./ai";

describe("65 match flow", () => {
  it("deals the first hand of 3 with 3s wild", () => {
    const s = newGame(["A", "B", "C"], [false, false, false]);
    expect(s.handSize).toBe(3);
    expect(s.wildRank).toBe("3");
    s.players.forEach((p) => expect(p.hand).toHaveLength(3));
    expect(s.discard).toHaveLength(1);
    expect(s.phase).toBe("draw");
  });

  it("draw then discard passes the turn", () => {
    let s = newGame(["A", "B"], [false, false]);
    const start = s.current;
    s = draw(s, "deck");
    expect(s.phase).toBe("discard");
    expect(s.players[start].hand).toHaveLength(4);
    s = discard(s, s.players[start].hand[0].id);
    expect(s.current).not.toBe(start);
    expect(s.players[start].hand).toHaveLength(3);
  });

  it("exposes a live hand analysis", () => {
    const s = newGame(["A", "B"], [false, false]);
    const a = handAnalysis(s, 0);
    expect(a.points).toBeGreaterThanOrEqual(0);
    expect(a.melds.flat().length + a.deadwood.length).toBeLessThanOrEqual(3 + a.melds.flat().filter((c) => c.rank === "JOKER").length);
  });

  it("no re-declaring Pay Me during the final lap (else the lap never ends)", () => {
    const s = newGame(["A", "B"], [false, false]);
    s.phase = "discard";
    s.paidBy = 1; // B already declared
    // Even with a going-out hand, the current player can't declare again.
    expect(canPayMe(s, s.players[s.current].hand[0].id)).toBe(false);
  });

  it("plays a full AI match to a winner across all 11 hands", () => {
    let s: SFState = newGame(["Bot A", "Bot B", "Bot C"], [true, true, true]);
    let guard = 0;
    const maxHand = { v: 3 };
    while (!s.result && guard++ < 20000) {
      if (s.phase === "roundEnd") {
        maxHand.v = Math.max(maxHand.v, s.handSize);
        s = nextRound(s);
        continue;
      }
      const next = aiStep(s);
      if (next === s) break;
      s = next;
    }
    expect(s.result).not.toBeNull();
    expect(maxHand.v).toBe(13); // progressed through the 13-card hand
    // lowest total wins
    const totals = s.players.map((p) => p.total);
    expect(totals[s.result!.winner]).toBe(Math.min(...totals));
  });
});
