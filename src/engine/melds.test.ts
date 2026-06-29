import { describe, it, expect } from "vitest";
import { card, cardLabel, type Card } from "./cards";
import {
  isSet,
  isRun,
  isValidMeld,
  classifyMeld,
  canLayOff,
  canLayOffMany,
  layOff,
  type Meld,
} from "./melds";

const labels = (cards: readonly Card[]) => cards.map(cardLabel);

describe("sets", () => {
  it("accepts three of a kind in different suits", () => {
    expect(isSet([card("7", "clubs"), card("7", "hearts"), card("7", "spades")])).toBe(true);
  });

  it("accepts four of a kind", () => {
    expect(
      isSet([card("K", "clubs"), card("K", "diamonds"), card("K", "hearts"), card("K", "spades")]),
    ).toBe(true);
  });

  it("rejects fewer than three cards", () => {
    expect(isSet([card("7", "clubs"), card("7", "hearts")])).toBe(false);
  });

  it("rejects a duplicate suit (impossible from a single deck anyway)", () => {
    expect(isSet([card("7", "clubs"), card("7", "clubs"), card("7", "hearts")])).toBe(false);
  });

  it("rejects mixed ranks", () => {
    expect(isSet([card("7", "clubs"), card("8", "hearts"), card("7", "spades")])).toBe(false);
  });
});

describe("runs", () => {
  it("accepts three consecutive cards of one suit", () => {
    expect(isRun([card("4", "hearts"), card("5", "hearts"), card("6", "hearts")])).toBe(true);
  });

  it("accepts an ace-low run (A-2-3)", () => {
    expect(isRun([card("A", "spades"), card("2", "spades"), card("3", "spades")])).toBe(true);
  });

  it("rejects an ace-high run Q-K-A (ace is always low)", () => {
    expect(isRun([card("Q", "spades"), card("K", "spades"), card("A", "spades")])).toBe(false);
  });

  it("rejects mixed suits", () => {
    expect(isRun([card("4", "hearts"), card("5", "clubs"), card("6", "hearts")])).toBe(false);
  });

  it("rejects a gap", () => {
    expect(isRun([card("4", "hearts"), card("5", "hearts"), card("7", "hearts")])).toBe(false);
  });

  it("does not care about input order", () => {
    expect(isRun([card("6", "hearts"), card("4", "hearts"), card("5", "hearts")])).toBe(true);
  });
});

describe("classifyMeld", () => {
  it("labels and canonically orders a set", () => {
    const meld = classifyMeld([card("9", "spades"), card("9", "clubs"), card("9", "hearts")]);
    expect(meld?.kind).toBe("set");
    expect(labels(meld!.cards)).toEqual(["9♣", "9♥", "9♠"]);
  });

  it("labels and orders a run low-to-high regardless of input order", () => {
    const meld = classifyMeld([card("6", "diamonds"), card("4", "diamonds"), card("5", "diamonds")]);
    expect(meld?.kind).toBe("run");
    expect(labels(meld!.cards)).toEqual(["4♦", "5♦", "6♦"]);
  });

  it("returns null for an invalid group", () => {
    expect(classifyMeld([card("2", "clubs"), card("9", "hearts")])).toBeNull();
  });

  it("isValidMeld agrees with classifyMeld", () => {
    const good = [card("4", "hearts"), card("5", "hearts"), card("6", "hearts")];
    const bad = [card("4", "hearts"), card("9", "hearts"), card("2", "clubs")];
    expect(isValidMeld(good)).toBe(true);
    expect(isValidMeld(bad)).toBe(false);
  });
});

describe("sapaw / lay-off", () => {
  const set: Meld = classifyMeld([card("8", "clubs"), card("8", "hearts"), card("8", "spades")])!;
  const run: Meld = classifyMeld([card("4", "hearts"), card("5", "hearts"), card("6", "hearts")])!;

  it("lays off the matching rank onto a set", () => {
    expect(canLayOff(set, card("8", "diamonds"))).toBe(true);
    const grown = layOff(set, card("8", "diamonds"));
    expect(grown?.cards).toHaveLength(4);
  });

  it("rejects a wrong rank or a suit already present on a set", () => {
    expect(canLayOff(set, card("9", "diamonds"))).toBe(false);
    expect(canLayOff(set, card("8", "clubs"))).toBe(false);
  });

  it("extends a run at the low end and the high end", () => {
    expect(canLayOff(run, card("3", "hearts"))).toBe(true);
    expect(canLayOff(run, card("7", "hearts"))).toBe(true);
    const grown = layOff(run, card("7", "hearts"));
    expect(labels(grown!.cards)).toEqual(["4♥", "5♥", "6♥", "7♥"]);
  });

  it("rejects a non-adjacent card or the wrong suit on a run", () => {
    expect(canLayOff(run, card("8", "hearts"))).toBe(false); // gap (skips 7)
    expect(canLayOff(run, card("3", "clubs"))).toBe(false); // wrong suit
  });

  it("lays an ace onto the low end of a 2-3-4 run (ace low)", () => {
    const lowRun = classifyMeld([card("2", "diamonds"), card("3", "diamonds"), card("4", "diamonds")])!;
    expect(canLayOff(lowRun, card("A", "diamonds"))).toBe(true);
    const grown = layOff(lowRun, card("A", "diamonds"));
    expect(labels(grown!.cards)).toEqual(["A♦", "2♦", "3♦", "4♦"]);
  });

  it("lays MULTIPLE cards onto a run at once (2 and 3 onto 4-5-6)", () => {
    const run = classifyMeld([card("4", "spades"), card("5", "spades"), card("6", "spades")])!;
    // 2 alone can't (gap), but 2+3 together extend the run.
    expect(canLayOff(run, card("2", "spades"))).toBe(false);
    expect(canLayOffMany(run, [card("2", "spades"), card("3", "spades")])).toBe(true);
    // 3 and 7 extend both ends at once.
    expect(canLayOffMany(run, [card("3", "spades"), card("7", "spades")])).toBe(true);
    // a non-connecting card breaks it.
    expect(canLayOffMany(run, [card("3", "spades"), card("9", "spades")])).toBe(false);
  });

  it("does NOT lay an ace onto the high end of a king-run (ace is low)", () => {
    const kingRun = classifyMeld([card("J", "diamonds"), card("Q", "diamonds"), card("K", "diamonds")])!;
    expect(canLayOff(kingRun, card("A", "diamonds"))).toBe(false);
  });

  it("does not extend a run past the ace-low boundary", () => {
    const lowRun = classifyMeld([card("A", "spades"), card("2", "spades"), card("3", "spades")])!;
    expect(canLayOff(lowRun, card("4", "spades"))).toBe(true);
    // nothing below an ace exists, so layOff returns null for that side
    expect(layOff(lowRun, card("K", "spades"))).toBeNull();
  });

  it("layOff returns null for an illegal lay-off", () => {
    expect(layOff(set, card("9", "diamonds"))).toBeNull();
  });
});
