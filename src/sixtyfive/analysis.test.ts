import { describe, it, expect } from "vitest";
import { analyzeSixtyFiveTurns, type SFObs } from "./analysis";
import { type RCard } from "./rules";

const c = (id: string, rank: string, suit: string | null): RCard => ({ id, rank: rank as never, suit: suit as never });

// Hand of 3 (3s wild). A made run + a loose King — throwing the King goes out at 0.
const hand: RCard[] = [
  c("0-4hearts", "4", "hearts"),
  c("0-5hearts", "5", "hearts"),
  c("0-6hearts", "6", "hearts"),
  c("0-Kspades", "K", "spades"),
];

const obs = (discarded: RCard): SFObs => ({ myTurns: [{ hand, discarded }], wildRank: "3" });

describe("65 hand review via the shared harness", () => {
  it("ranks every discard by chance of success, best first", () => {
    const t = analyzeSixtyFiveTurns(obs(c("0-Kspades", "K", "spades")))[0];
    expect(t.discards).toHaveLength(4);
    for (let i = 1; i < t.discards.length; i++) {
      expect(t.discards[i - 1].pct).toBeGreaterThanOrEqual(t.discards[i].pct);
    }
    expect(t.discards[0].card.label).toContain("K"); // throwing the King is the top choice
    expect(t.grade).toBe("best");
    expect(t.reason).toBe("");
  });

  it("throwing a melded card is a mistake and names the King", () => {
    const t = analyzeSixtyFiveTurns(obs(c("0-4hearts", "4", "hearts")))[0];
    expect(t.yourPct).toBeLessThan(t.bestPct);
    expect(t.grade).not.toBe("best");
    expect(t.bestDiscard).toBe("0-Kspades");
  });
});
