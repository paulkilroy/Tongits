import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CribbageMenu } from "./CribbageMenu";
import { CribbageGame } from "./CribbageGame";
import { CribReview } from "./CribReview";
import { CribGameReview } from "./CribGameReview";
import { reviewHand } from "./review";
import { newRound, discardToCrib, playCard, go, nextShow, legalPlays, roundComplete, STANDARD_CRIB_RULES, type CribState } from "./game";

function playHand(seed: number): CribState {
  let s = newRound(STANDARD_CRIB_RULES, seed, ["You", "Bot"], [true, true], 0);
  for (let p = 0; p < 2; p++) { const h = s.players[p].hand; s = discardToCrib(s, p, [h[4], h[5]]); }
  let g = 0;
  while (s.phase === "play" && g++ < 100) { const legal = legalPlays(s, s.current); s = legal.length ? playCard(s, legal[0]) : go(s); }
  while (s.phase === "show" && !roundComplete(s)) s = nextShow(s);
  return s;
}

describe("cribbage UI smoke", () => {
  it("renders the cribbage menu", () => {
    const html = renderToString(createElement(CribbageMenu, { onLocal: () => {}, onHost: () => {}, onJoin: () => {}, onExit: () => {}, busy: false, error: null }));
    expect(html).toContain("Play vs AI");
  });
  it("renders the local board", () => {
    expect(renderToString(createElement(CribbageGame, { onExit: () => {} }))).toContain("crib");
  });
  it("renders the hand review", () => {
    const review = reviewHand(playHand(11), 0, 40)!;
    const html = renderToString(createElement(CribReview, { review, me: 0, oppName: "Bot", onClose: () => {} }));
    expect(html).toContain("Hand review");
    expect(html).toContain("Pegging");
  });
  it("renders the game review stepper", () => {
    const hands = [playHand(11), playHand(23)];
    const html = renderToString(createElement(CribGameReview, { hands, me: 0, oppName: "Bot", onClose: () => {} }));
    expect(html).toContain("Game review");
    expect(html).toContain("cr-gr-nav");
  });
});
