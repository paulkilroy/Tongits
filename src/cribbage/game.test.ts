import { describe, it, expect } from "vitest";
import {
  newRound,
  discardToCrib,
  playCard,
  go,
  nextShow,
  legalPlays,
  canPlay,
  pone,
  roundComplete,
  STANDARD_CRIB_RULES,
  type CribState,
} from "./game";

function deal(seed = 1): CribState {
  return newRound(STANDARD_CRIB_RULES, seed, ["You", "Bot"], [false, true], 0);
}

/** Discard the last two cards of each hand into the crib. */
function bothDiscard(s: CribState): CribState {
  for (let p = 0; p < 2; p++) {
    const h = s.players[p].hand;
    s = discardToCrib(s, p, [h[4], h[5]]);
  }
  return s;
}

/** Auto-play the pegging phase: lay the first legal card, else go. */
function autoPlay(s: CribState): CribState {
  let guard = 0;
  while (s.phase === "play" && guard++ < 100) {
    const legal = legalPlays(s, s.current);
    s = legal.length ? playCard(s, legal[0]) : go(s);
  }
  return s;
}

describe("cribbage game flow", () => {
  it("deals 6 to each and keeps 40 in the deck", () => {
    const s = deal();
    expect(s.players[0].hand).toHaveLength(6);
    expect(s.players[1].hand).toHaveLength(6);
    expect(s.deck).toHaveLength(40);
    expect(s.phase).toBe("discard");
  });

  it("moves to the play after both discard, cutting a starter and leading with pone", () => {
    const s = bothDiscard(deal());
    expect(s.crib).toHaveLength(4);
    expect(s.players[0].hand).toHaveLength(4);
    expect(s.starter).not.toBeNull();
    expect(s.phase).toBe("play");
    expect(s.current).toBe(pone(s));
  });

  it("must-play: go is rejected while you still have a legal card", () => {
    const s = bothDiscard(deal());
    expect(canPlay(s, s.current)).toBe(true);
    expect(go(s)).toBe(s); // unchanged — illegal to go
  });

  it("plays a whole round out to a fully-counted show", () => {
    let s = autoPlay(bothDiscard(deal()));
    // Pegging done → show, everyone's four cards were laid.
    expect(["show", "gameOver"]).toContain(s.phase);
    if (s.phase === "gameOver") return;
    expect(s.players[0].played).toHaveLength(4);
    expect(s.players[1].played).toHaveLength(4);

    s = nextShow(s); // pone hand
    s = nextShow(s); // dealer hand
    s = nextShow(s); // crib
    expect(roundComplete(s) || s.phase === "gameOver").toBe(true);
    expect(s.players[0].score).toBeGreaterThanOrEqual(0);
    expect(s.players[1].score).toBeGreaterThanOrEqual(0);
  });

  it("awards his heels when the starter is a Jack", () => {
    // Search seeds for one whose cut card (deck[12]) is a Jack, then check +2.
    for (let seed = 1; seed < 200; seed++) {
      const s0 = newRound(STANDARD_CRIB_RULES, seed, ["You", "Bot"], [false, true], 0);
      if (s0.deck[0].rank !== "J") continue;
      const s = bothDiscard(s0);
      expect(s.players[s.dealer].score).toBe(2); // his heels
      return;
    }
    throw new Error("no Jack-cut seed found in range");
  });

  it("reaches a winner across many rounds without stalling", () => {
    let s = newRound(STANDARD_CRIB_RULES, 7, ["You", "Bot"], [true, true], 0);
    let dealer = 0;
    let guard = 0;
    const scores = () => s.players.map((p) => p.score);
    while (!s.result && guard++ < 200) {
      s = bothDiscard(s);
      s = autoPlay(s);
      while (s.phase === "show" && !roundComplete(s)) s = nextShow(s);
      if (s.result) break;
      dealer = (dealer + 1) % 2;
      s = newRound(STANDARD_CRIB_RULES, 7 + guard, ["You", "Bot"], [true, true], dealer, scores());
    }
    expect(s.result).not.toBeNull();
    expect(Math.max(...scores())).toBeGreaterThanOrEqual(121);
  });
});

/** Everyone lays away the last card(s) of their hand into the crib. */
function allDiscard(s: CribState): CribState {
  const need = s.players.length === 2 ? 2 : 1;
  for (let p = 0; p < s.players.length; p++) {
    const h = s.players[p].hand;
    s = discardToCrib(s, p, h.slice(h.length - need));
  }
  return s;
}

describe("three-hand cribbage", () => {
  const names3 = ["A", "B", "C"];
  const ai3 = [false, false, false];

  it("deals 5 to each of three players", () => {
    const s = newRound(STANDARD_CRIB_RULES, 3, names3, ai3, 0);
    expect(s.players).toHaveLength(3);
    s.players.forEach((p) => expect(p.hand).toHaveLength(5));
    expect(s.deck).toHaveLength(52 - 15);
  });

  it("each discards one; a deck card fills the 4-card crib; play leads left of dealer", () => {
    const s = allDiscard(newRound(STANDARD_CRIB_RULES, 3, names3, ai3, 0));
    expect(s.crib).toHaveLength(4); // 3 discards + 1 off the deck
    s.players.forEach((p) => expect(p.hand).toHaveLength(4));
    expect(s.starter).not.toBeNull();
    expect(s.phase).toBe("play");
    expect(s.current).toBe(1); // dealer 0 → eldest is seat 1
  });

  it("plays a full three-hand round to a counted show (order: eldest, next, dealer, crib)", () => {
    let s = allDiscard(newRound(STANDARD_CRIB_RULES, 9, names3, ai3, 0));
    let guard = 0;
    while (s.phase === "play" && guard++ < 200) {
      const legal = legalPlays(s, s.current);
      s = legal.length ? playCard(s, legal[0]) : go(s);
    }
    if (s.phase === "gameOver") return;
    expect(s.phase).toBe("show");
    s.players.forEach((p) => expect(p.played).toHaveLength(4));
    const reveals: number[] = [];
    while (s.phase === "show" && !roundComplete(s)) {
      s = nextShow(s);
      if (s.lastReveal) reveals.push(s.lastReveal.isCrib ? -1 : s.lastReveal.who);
    }
    // eldest(1) → seat 2 → dealer(0) → crib(-1)
    expect(reveals).toEqual([1, 2, 0, -1]);
  });

  it("reaches a winner in a three-hand match without stalling", () => {
    let s = newRound(STANDARD_CRIB_RULES, 11, names3, [true, true, true], 0);
    let dealer = 0;
    let guard = 0;
    const scores = () => s.players.map((p) => p.score);
    while (!s.result && guard++ < 400) {
      s = allDiscard(s);
      let g2 = 0;
      while (s.phase === "play" && g2++ < 200) {
        const legal = legalPlays(s, s.current);
        s = legal.length ? playCard(s, legal[0]) : go(s);
      }
      while (s.phase === "show" && !roundComplete(s)) s = nextShow(s);
      if (s.result) break;
      dealer = (dealer + 1) % 3;
      s = newRound(STANDARD_CRIB_RULES, 11 + guard, names3, [true, true, true], dealer, scores());
    }
    expect(s.result).not.toBeNull();
    expect(Math.max(...scores())).toBeGreaterThanOrEqual(121);
  });
});
