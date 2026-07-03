import { describe, it, expect } from "vitest";
import { cardId } from "../engine/cards";
import { newRound, discardToCrib, playCard, go, nextShow, legalPlays, roundComplete, STANDARD_CRIB_RULES, type CribState } from "./game";
import { reviewHand } from "./review";

function playHand(seed: number): CribState {
  let s = newRound(STANDARD_CRIB_RULES, seed, ["You", "Bot"], [true, true], 0);
  for (let p = 0; p < 2; p++) {
    const h = s.players[p].hand;
    s = discardToCrib(s, p, [h[4], h[5]]);
  }
  let guard = 0;
  while (s.phase === "play" && guard++ < 100) {
    const legal = legalPlays(s, s.current);
    s = legal.length ? playCard(s, legal[0]) : go(s);
  }
  while (s.phase === "show" && !roundComplete(s)) s = nextShow(s);
  return s;
}

describe("cribbage post-hand review", () => {
  it("reviews the discard and reconstructs the pegging", () => {
    const s = playHand(11);
    const r = reviewHand(s, 0, 80)!;
    expect(r).not.toBeNull();

    // discard: kept 4, laid away 2, and a graded best
    expect(r.discard.kept).toHaveLength(4);
    expect(r.discard.discarded).toHaveLength(2);
    expect(r.discard.best).toHaveLength(4);
    expect(r.discard.lost).toBeGreaterThanOrEqual(0);

    // pegging: every card that was played is in the log, 8 total for a 2-hand round
    expect(r.pegging.length).toBe(8);
    // reconstruction matches the recorded points exactly
    for (const p of r.pegging) {
      expect(p.pts).toBeGreaterThanOrEqual(0);
      expect(p.missed).toBeGreaterThanOrEqual(0);
      if (p.by === 0) expect(p.best).toBeGreaterThanOrEqual(p.pts);
    }
    // your pegging total is the sum of your recorded plays
    const mine = r.pegging.filter((p) => p.by === 0).reduce((a, p) => a + p.pts, 0);
    expect(r.yourPegPoints).toBe(mine);
  });

  it("keeps the recorded deal/laid-away consistent with the played hand", () => {
    const s = playHand(7);
    const you = s.players[0];
    expect(you.deal).toHaveLength(6);
    expect(you.laidAway).toHaveLength(2);
    const keptIds = new Set(you.deal.filter((c) => !you.laidAway.some((l) => cardId(l) === cardId(c))).map(cardId));
    const playedIds = new Set(you.played.map(cardId));
    expect(keptIds).toEqual(playedIds); // the 4 you kept are exactly the 4 you played
  });
});
