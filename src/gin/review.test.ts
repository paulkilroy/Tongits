import { describe, it, expect } from "vitest";
import { reviewGinHand } from "./review";
import { type Card } from "../engine/cards";

const c = (rank: string, suit: string): Card => ({ rank: rank as never, suit: suit as never });

describe("gin post-hand review", () => {
  it("marks a deadwood-minimizing discard as best, and a wasteful one as a mistake", () => {
    // Hand: 4-5-6♥ run + 7-7-7 set + a lone 2♣ and K♠. Best throw is the K (10) —
    // leaves just the 2 (2 deadwood). Throwing the 2 leaves the K (10 deadwood).
    const hand8: Card[] = [
      c("4", "hearts"), c("5", "hearts"), c("6", "hearts"),
      c("7", "clubs"), c("7", "diamonds"), c("7", "spades"),
      c("2", "clubs"), c("K", "spades"),
    ];
    const good = reviewGinHand([{ hand8, discarded: c("K", "spades"), drewDiscard: false }]);
    expect(good.turns[0].grade).toBe("best");

    const bad = reviewGinHand([{ hand8, discarded: c("2", "clubs"), drewDiscard: false }]);
    expect(bad.turns[0].grade).toBe("mistake"); // 8 more deadwood than best
    expect(bad.turns[0].best).toEqual(c("K", "spades"));
  });

  it("flags the earliest turn a knock was available", () => {
    const knockable: Card[] = [
      c("4", "hearts"), c("5", "hearts"), c("6", "hearts"),
      c("7", "clubs"), c("7", "diamonds"), c("7", "spades"),
      c("3", "clubs"), c("K", "spades"), // best throw K → 3 deadwood ≤ 5 → knockable
    ];
    const notYet: Card[] = [
      c("2", "clubs"), c("5", "hearts"), c("9", "diamonds"),
      c("J", "spades"), c("4", "clubs"), c("7", "hearts"),
      c("10", "spades"), c("K", "hearts"), // high junk → not knockable
    ];
    const r = reviewGinHand([
      { hand8: notYet, discarded: c("K", "hearts"), drewDiscard: false },
      { hand8: knockable, discarded: c("K", "spades"), drewDiscard: false },
    ]);
    expect(r.couldKnockTurn).toBe(2);
    expect(r.knockedTurn).toBe(2);
  });
});
