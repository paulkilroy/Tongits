import { describe, it, expect } from "vitest";
import { card } from "./cards";
import { STANDARD_RULES } from "./rules";
import { newRound, type GameState } from "./game";
import { handDraws, isDeadDraw, conflictingCards } from "./odds";

function stateWithHand(hand: ReturnType<typeof card>[], discard: ReturnType<typeof card>[] = []): GameState {
  const s = newRound({ ...STANDARD_RULES, playerCount: 2 }, 1, ["You", "Bot"], [false, true]);
  s.players[0].hand = hand;
  s.discard = discard;
  return s;
}

describe("draw odds", () => {
  it("an outside (open) run draw has two outs", () => {
    const s = stateWithHand([card("5", "hearts"), card("6", "hearts"), card("K", "spades")]);
    const run = handDraws(s, 0).find((d) => d.kind === "run-open")!;
    expect(run.outsMax).toBe(2); // 4♥ and 7♥
    expect(run.outsLive).toBe(2);
    expect(run.probability).toBeGreaterThan(0);
  });

  it("an inside (gutshot) run draw has one out", () => {
    const s = stateWithHand([card("5", "hearts"), card("7", "hearts"), card("K", "spades")]);
    const run = handDraws(s, 0).find((d) => d.kind === "run-gutshot")!;
    expect(run.outsMax).toBe(1); // 6♥
    expect(run.outsLive).toBe(1);
  });

  it("a draw is dead when both outs are already visible", () => {
    const s = stateWithHand(
      [card("5", "hearts"), card("6", "hearts"), card("K", "spades")],
      [card("4", "hearts"), card("7", "hearts")], // both outs discarded
    );
    const run = handDraws(s, 0).find((d) => d.kind === "run-open")!;
    expect(run.outsLive).toBe(0);
    expect(isDeadDraw(run)).toBe(true);
    expect(run.probability).toBe(0);
  });

  it("ace-low edge: 2-3 draw counts the ace below and the 4 above", () => {
    const s = stateWithHand([card("2", "clubs"), card("3", "clubs"), card("K", "spades")]);
    const run = handDraws(s, 0).find((d) => d.kind === "run-open")!;
    expect(run.outsMax).toBe(2); // A♣ and 4♣
  });

  it("a Q-K draw only has the jack below (ace is low, no wrap)", () => {
    const s = stateWithHand([card("Q", "clubs"), card("K", "clubs"), card("2", "hearts")]);
    const run = handDraws(s, 0).find((d) => d.kind === "run-open")!;
    expect(run.outsMax).toBe(1); // J♣ only
  });

  it("a pair is a set draw with the other two suits as outs", () => {
    const s = stateWithHand([card("9", "clubs"), card("9", "hearts"), card("K", "spades")]);
    const set = handDraws(s, 0).find((d) => d.kind === "set")!;
    expect(set.outsMax).toBe(2); // 9♦, 9♠
  });

  it("flags a card serving two competing draws", () => {
    // 5♥ feeds both the 5♥-6♥ run and the 5♥-5♠ pair.
    const s = stateWithHand([card("5", "hearts"), card("6", "hearts"), card("5", "spades")]);
    const draws = handDraws(s, 0);
    expect(draws.some((d) => d.kind === "set")).toBe(true);
    expect(draws.some((d) => d.kind === "run-open")).toBe(true);
    expect(conflictingCards(draws).has("5-hearts")).toBe(true);
  });
});
