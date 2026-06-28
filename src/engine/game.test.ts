import { describe, it, expect } from "vitest";
import { card } from "./cards";
import { STANDARD_RULES } from "./rules";
import {
  newRound,
  draw,
  layMeld,
  sapaw,
  discard,
  callFight,
  canCallFight,
  canTakeDiscard,
  currentPlayer,
  type GameState,
} from "./game";

function twoPlayer(seed = 1): GameState {
  return newRound({ ...STANDARD_RULES, playerCount: 2 }, seed, ["You", "Bot"], [false, true]);
}

describe("dealing", () => {
  it("gives the dealer 13 and the opponent 12, rest to stock", () => {
    const s = twoPlayer();
    expect(s.players[0].hand).toHaveLength(13);
    expect(s.players[1].hand).toHaveLength(12);
    expect(s.stock).toHaveLength(52 - 25);
    expect(s.phase).toBe("action"); // dealer acts first, no draw needed
  });

  it("supports three players (13/12/12)", () => {
    const s = newRound(
      { ...STANDARD_RULES, playerCount: 3 },
      5,
      ["You", "B1", "B2"],
      [false, true, true],
    );
    expect(s.players.map((p) => p.hand.length)).toEqual([13, 12, 12]);
    expect(s.stock).toHaveLength(52 - 37);
  });
});

describe("turn flow", () => {
  it("a non-dealer must draw before acting", () => {
    let s = twoPlayer();
    // dealer discards to pass the turn
    s = discard(s, currentPlayer(s).hand[0]);
    expect(s.current).toBe(1);
    expect(s.phase).toBe("draw");
    const handBefore = currentPlayer(s).hand.length;
    s = draw(s, "stock");
    expect(s.phase).toBe("action");
    expect(currentPlayer(s).hand.length).toBe(handBefore + 1);
  });

  it("ignores actions out of phase", () => {
    let s = twoPlayer();
    s = discard(s, currentPlayer(s).hand[0]); // now player 1, draw phase
    const blocked = discard(s, currentPlayer(s).hand[0]); // can't discard before drawing
    expect(blocked).toBe(s);
  });
});

describe("melding and winning", () => {
  it("lays a valid meld and removes the cards from hand", () => {
    // Construct a controlled state by hand-editing (engine reducers are pure).
    let s = twoPlayer();
    s.players[0].hand = [
      card("7", "clubs"),
      card("7", "hearts"),
      card("7", "spades"),
      card("2", "diamonds"),
    ];
    s = layMeld(s, [card("7", "clubs"), card("7", "hearts"), card("7", "spades")]);
    expect(s.players[0].melds).toHaveLength(1);
    expect(s.players[0].hand).toHaveLength(1);
  });

  it("rejects an invalid meld", () => {
    let s = twoPlayer();
    s.players[0].hand = [card("7", "clubs"), card("8", "hearts"), card("9", "spades")];
    const blocked = layMeld(s, s.players[0].hand);
    expect(blocked).toBe(s);
  });

  it("wins by Tongits when the last card is discarded", () => {
    let s = twoPlayer();
    s.players[0].hand = [card("7", "clubs"), card("7", "hearts"), card("7", "spades"), card("2", "diamonds")];
    s = layMeld(s, [card("7", "clubs"), card("7", "hearts"), card("7", "spades")]);
    s = discard(s, card("2", "diamonds"));
    expect(s.result?.reason).toBe("tongits");
    expect(s.result?.winner).toBe(0);
  });
});

describe("fight / laban", () => {
  it("the lower hand wins a showdown called at the start of a turn", () => {
    let s = twoPlayer();
    s.phase = "draw"; // Laban is only legal before drawing
    s.players[0].hand = [card("A", "clubs"), card("2", "hearts")]; // 3 points
    s.players[0].melds = [
      { kind: "set", cards: [card("9", "clubs"), card("9", "hearts"), card("9", "spades")] },
    ];
    s.players[1].hand = [card("K", "clubs"), card("Q", "hearts")]; // 20 points
    s = callFight(s);
    expect(s.result?.reason).toBe("showdown");
    expect(s.result?.winner).toBe(0);
    expect(s.result?.handPoints).toEqual([3, 20]);
  });

  it("a showdown tie goes AGAINST the caller — they lose (Tupong)", () => {
    let s = twoPlayer();
    s.phase = "draw";
    s.players[0].melds = [
      { kind: "set", cards: [card("9", "clubs"), card("9", "hearts"), card("9", "spades")] },
    ];
    s.players[0].hand = [card("2", "clubs")]; // caller, 2 points
    s.players[1].hand = [card("2", "hearts")]; // also 2 — a tie
    s = callFight(s); // player 0 calls
    expect(s.result?.winner).toBe(1); // caller loses the tie
    expect(s.result?.tupong).toBe(true);
  });

  it("cannot call Laban after drawing (mid-turn)", () => {
    let s = twoPlayer();
    s.phase = "action"; // already drew
    s.players[0].melds = [
      { kind: "set", cards: [card("9", "clubs"), card("9", "hearts"), card("9", "spades")] },
    ];
    expect(callFight(s)).toBe(s);
  });

  it("cannot call without a meld when the rule requires one", () => {
    let s = twoPlayer();
    s.phase = "draw";
    s.players[0].melds = [];
    expect(callFight(s)).toBe(s);
  });

  it("scores only unmatched cards — a secret meld in hand does not count", () => {
    let s = twoPlayer();
    s.phase = "draw";
    s.players[0].melds = [
      { kind: "set", cards: [card("9", "clubs"), card("9", "hearts"), card("9", "spades")] },
    ];
    // Hand holds a secret set of 5s plus a lone 2 → only the 2 should count.
    s.players[0].hand = [card("5", "clubs"), card("5", "diamonds"), card("5", "hearts"), card("2", "spades")];
    s.players[1].hand = [card("K", "clubs"), card("Q", "hearts")]; // 20
    s = callFight(s);
    expect(s.result?.handPoints).toEqual([2, 20]);
    expect(s.result?.winner).toBe(0);
  });
});

describe("sapaw lock (burned Laban)", () => {
  it("opponent sapaw is logged and burns the owner's very next turn", () => {
    let s = twoPlayer();
    s.players[0].melds = [
      { kind: "set", cards: [card("9", "clubs"), card("9", "hearts"), card("9", "spades")] },
    ];
    s.current = 1;
    s.phase = "action";
    s.players[1].hand = [card("9", "diamonds"), card("2", "clubs"), card("K", "spades")];
    s = sapaw(s, 0, 0, card("9", "diamonds")); // Ella sapaws Paul's 9s → 4 of a kind
    s = discard(s, card("2", "clubs")); // Ella ends turn → Paul
    expect(s.current).toBe(0);
    expect(s.labanBlocked).toBe(true); // Paul is burned THIS (next) turn
    expect(canCallFight(s)).toBe(false);
  });

  it("burns you when you sapaw your OWN meld (anyone, including you)", () => {
    let s = twoPlayer();
    s.current = 0;
    s.phase = "action";
    s.players[0].melds = [
      { kind: "set", cards: [card("9", "clubs"), card("9", "hearts"), card("9", "spades")] },
    ];
    s.players[0].hand = [card("9", "diamonds"), card("2", "clubs"), card("K", "spades")];
    s = sapaw(s, 0, 0, card("9", "diamonds")); // Paul sapaws his own meld
    expect(s.players[0].meldSapawed).toBe(true);
    s = discard(s, card("2", "clubs")); // → Ella
    s = draw(s, "stock");
    s = discard(s, currentPlayer(s).hand[0]); // → Paul
    expect(s.current).toBe(0);
    expect(s.labanBlocked).toBe(true);
    expect(canCallFight(s)).toBe(false);
  });

  it("next-turn-only mode: blocks Laban the next turn, then clears a lap later", () => {
    let s = twoPlayer();
    s.rules = { ...s.rules, sapawLockAllRound: false };
    s.players[0].melds = [
      { kind: "set", cards: [card("9", "clubs"), card("9", "hearts"), card("9", "spades")] },
    ];
    // Player 1's turn: they sapaw a 9 onto player 0's set.
    s.current = 1;
    s.phase = "action";
    s.players[1].hand = [card("9", "diamonds"), card("2", "clubs"), card("K", "spades")];
    s = sapaw(s, 0, 0, card("9", "diamonds"));
    expect(s.players[0].meldSapawed).toBe(true);

    // Back to player 0 → they're burned and cannot call Laban.
    s = discard(s, card("2", "clubs"));
    expect(s.current).toBe(0);
    expect(s.labanBlocked).toBe(true);
    expect(canCallFight(s)).toBe(false);

    // Player 0 takes their turn; one full lap later the lock is gone.
    s = draw(s, "stock");
    s = discard(s, currentPlayer(s).hand[0]); // → player 1
    s = draw(s, "stock");
    s = discard(s, currentPlayer(s).hand[0]); // → player 0 again
    expect(s.labanBlocked).toBe(false);
    expect(canCallFight(s)).toBe(true);
  });

  it("rest-of-round mode (default): stays burned for the whole round", () => {
    let s = twoPlayer(); // STANDARD_RULES → sapawLockAllRound true
    s.players[0].melds = [
      { kind: "set", cards: [card("9", "clubs"), card("9", "hearts"), card("9", "spades")] },
    ];
    s.current = 1;
    s.phase = "action";
    s.players[1].hand = [card("9", "diamonds"), card("2", "clubs"), card("K", "spades")];
    s = sapaw(s, 0, 0, card("9", "diamonds"));
    s = discard(s, card("2", "clubs")); // → player 0, burned this round
    expect(canCallFight(s)).toBe(false);
    // A full lap later — still burned (rest of round).
    s = draw(s, "stock");
    s = discard(s, currentPlayer(s).hand[0]); // → player 1
    s = draw(s, "stock");
    s = discard(s, currentPlayer(s).hand[0]); // → player 0
    expect(s.players[0].burned).toBe(true);
    expect(canCallFight(s)).toBe(false);
  });
});

describe("taking the discard (must be played)", () => {
  function atDrawWithDiscard(): GameState {
    let s = twoPlayer();
    s = discard(s, currentPlayer(s).hand[0]); // dealer discards → player 1 to draw
    return s; // player 1, phase "draw", one card on the discard pile
  }

  it("rejects taking the discard when it cannot be played", () => {
    let s = atDrawWithDiscard();
    // Give player 1 a hand with nothing matching the discard top.
    const top = s.discard[s.discard.length - 1];
    s.players[1].hand = s.players[1].hand.filter((c) => c.rank !== top.rank && c.suit !== top.suit);
    expect(draw(s, "discard")).toBe(s);
  });

  it("a non-dealer (player 1) can take a meldable discard on their turn", () => {
    let s = twoPlayer();
    s.current = 1;
    s.phase = "draw";
    s.discard = [card("5", "clubs")];
    s.players[1].hand = [card("5", "hearts"), card("5", "diamonds"), card("K", "spades")];
    expect(canTakeDiscard(s)).toBe(true);
    s = draw(s, "discard");
    expect(s.phase).toBe("action");
    expect(s.mustPlay).not.toBeNull();
    expect(s.players[1].hand.some((c) => c.rank === "5" && c.suit === "clubs")).toBe(true);
  });

  it("flags the taken card as mustPlay and blocks discarding until it is played", () => {
    let s = twoPlayer();
    s.current = 1;
    s.phase = "draw";
    s.discard = [card("7", "clubs")];
    s.players[1].hand = [
      card("7", "hearts"),
      card("7", "spades"),
      card("K", "spades"),
      card("2", "diamonds"),
    ];
    s = draw(s, "discard"); // takes 7♣ → mustPlay
    expect(s.mustPlay).not.toBeNull();
    // can't discard while the taken card is unplayed
    expect(discard(s, card("2", "diamonds"))).toBe(s);
    // play it as a set → mustPlay clears, discarding now works
    s = layMeld(s, [card("7", "clubs"), card("7", "hearts"), card("7", "spades")]);
    expect(s.mustPlay).toBeNull();
    s = discard(s, card("K", "spades"));
    expect(s.current).toBe(0);
  });
});
