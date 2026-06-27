import { describe, it, expect } from "vitest";
import { card } from "./cards";
import { STANDARD_RULES } from "./rules";
import {
  newRound,
  draw,
  layMeld,
  discard,
  callFight,
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
  it("the lower hand wins a called showdown", () => {
    let s = twoPlayer();
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

  it("cannot call without a meld when the rule requires one", () => {
    let s = twoPlayer();
    s.players[0].melds = [];
    const blocked = callFight(s);
    expect(blocked).toBe(s);
  });
});
