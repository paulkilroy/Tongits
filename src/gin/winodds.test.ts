import { describe, it, expect } from "vitest";
import { card } from "../engine/cards";
import { makeRng } from "../engine/deck";
import { newGame, type GinState } from "./game";
import { estimateGinWinOdds, ginGame } from "./winodds";
import { chooseByMC } from "../game/cardGame";

const base = newGame(["You", "Bot"], [false, true]);

// A position with seat 0 holding `hand`, the opponent about to draw (i.e. right
// after seat 0 discarded). The playout re-deals the opponent + deck itself.
function pos(hand: ReturnType<typeof card>[]): GinState {
  const s = structuredClone(base);
  s.players[0].hand = hand;
  // Only the opponent's hand *size* matters — the playout re-deals it from the
  // unseen pool. Keep the dealt 7-card hand so the count is right.
  s.players[1].hand = base.players[1].hand.slice(0, 7);
  s.current = 1;
  s.phase = "draw";
  s.discard = [card("Q", "clubs")];
  s.deck = [];
  s.round = null;
  s.result = null;
  return s;
}

// Gin-ready: 4-5-6-7 hearts run + 8s set = 0 deadwood, will knock/gin next turn.
const strong = [
  card("4", "hearts"), card("5", "hearts"), card("6", "hearts"), card("7", "hearts"),
  card("8", "clubs"), card("8", "diamonds"), card("8", "spades"),
];
// Scattered high cards, no melds.
const weak = [
  card("2", "clubs"), card("5", "diamonds"), card("9", "hearts"),
  card("J", "spades"), card("K", "clubs"), card("3", "spades"), card("7", "diamonds"),
];

describe("gin monte-carlo win odds", () => {
  it("returns a probability in [0,1]", () => {
    const p = estimateGinWinOdds(pos(strong), 0, 60, makeRng(1));
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it("a gin-ready hand wins far more often than a scattered one", () => {
    const good = estimateGinWinOdds(pos(strong), 0, 150, makeRng(7));
    const bad = estimateGinWinOdds(pos(weak), 0, 150, makeRng(7));
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeGreaterThan(0.6);
  });
});

describe("generic config-driven AI (chooseByMC) on Gin", () => {
  // Seat 0 at a discard decision, gin-ready after throwing the loose K.
  function discardPos(): GinState {
    const s = structuredClone(base);
    s.players[0].hand = [...strong, card("K", "spades")];
    s.players[1].hand = base.players[1].hand.slice(0, 7);
    s.current = 0;
    s.phase = "discard";
    s.discard = [card("Q", "clubs")];
    s.deck = [];
    s.round = null;
    s.result = null;
    return s;
  }

  it("picks the knock that wins the hand", () => {
    const move = chooseByMC(ginGame, discardPos(), 0, { samples: 40 }, makeRng(3));
    expect(move).not.toBeNull();
    expect(move!.id.startsWith("knock:")).toBe(true);
  });
});
