import { describe, it, expect } from "vitest";
import { card } from "./cards";
import { STANDARD_RULES } from "./rules";
import { newRound, type GameState } from "./game";
import { reviewRound } from "./review";

function turnState(hand: ReturnType<typeof card>[], discard: ReturnType<typeof card>[] = []): GameState {
  const s = newRound({ ...STANDARD_RULES, playerCount: 2 }, 1, ["You", "Bot"], [false, true]);
  s.players[0].hand = hand; // dealer starts in action phase as current=0
  s.discard = discard;
  return s;
}

describe("game review", () => {
  it("flags high loose deadwood", () => {
    const s = turnState([card("K", "spades"), card("Q", "diamonds"), card("3", "clubs"), card("4", "clubs")]);
    const r = reviewRound([s], 0);
    expect(r.turns).toHaveLength(1);
    expect(r.turns[0].notes.some((n) => /high deadwood/i.test(n.text))).toBe(true);
  });

  it("flags a dead draw and reports it in the summary", () => {
    const s = turnState(
      [card("5", "hearts"), card("6", "hearts"), card("2", "clubs")],
      [card("4", "hearts"), card("7", "hearts")],
    );
    const r = reviewRound([s], 0);
    expect(r.turns[0].notes.some((n) => /dead draw/i.test(n.text))).toBe(true);
    expect(r.summary.some((x) => /dead draw/i.test(x))).toBe(true);
  });

  it("flags a missed sapaw when a held card could lay onto a meld", () => {
    const s = turnState([card("2", "spades"), card("K", "hearts")]);
    s.players[1].melds = [
      { kind: "run", cards: [card("3", "spades"), card("4", "spades"), card("5", "spades")] },
    ];
    const r = reviewRound([s], 0);
    expect(r.turns[0].notes.some((n) => /missed sapaw/i.test(n.text))).toBe(true);
  });
});
