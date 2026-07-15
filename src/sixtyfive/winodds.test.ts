import { describe, it, expect } from "vitest";
import { makeRng } from "../engine/deck";
import { newGame, type SFState } from "./game";
import { estimateSixtyFiveWinOdds } from "./winodds";

const base = newGame(["You", "Bot"], [false, true]);

// Seat 0 to draw, holding `hand` (the opponent + deck are re-dealt by the playout).
function pos(hand: SFState["players"][number]["hand"]): SFState {
  const s = structuredClone(base);
  s.players[0].hand = hand;
  s.current = 0;
  s.phase = "draw";
  s.reveals = null;
  s.result = null;
  return s;
}

const r = (id: string, rank: string, suit: string) => ({ id, rank: rank as never, suit: suit as never });
// Made 3-card run → 0 deadwood, ready to go out. (Hand of 3, 3s are wild.)
const melded = [r("0-4hearts", "4", "hearts"), r("0-5hearts", "5", "hearts"), r("0-6hearts", "6", "hearts")];
// Three unconnected high cards.
const junk = [r("0-Kspades", "K", "spades"), r("0-Qhearts", "Q", "hearts"), r("0-Adiamonds", "A", "diamonds")];

describe("65 monte-carlo win odds", () => {
  it("returns a probability in [0,1]", () => {
    const p = estimateSixtyFiveWinOdds(pos(junk), 0, 40, makeRng(1));
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it("a made hand wins more often than three loose high cards", () => {
    const good = estimateSixtyFiveWinOdds(pos(melded), 0, 120, makeRng(5));
    const bad = estimateSixtyFiveWinOdds(pos(junk), 0, 120, makeRng(5));
    expect(good).toBeGreaterThan(bad);
  });
});
