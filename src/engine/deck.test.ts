import { describe, it, expect } from "vitest";
import { freshDeck, shuffledDeck, makeRng, shuffle } from "./deck";
import { cardId } from "./cards";

describe("deck", () => {
  it("a fresh deck has 52 unique cards", () => {
    const deck = freshDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardId)).size).toBe(52);
  });

  it("a seeded shuffle is reproducible (needed for online sync)", () => {
    const a = shuffledDeck(42);
    const b = shuffledDeck(42);
    expect(a.map(cardId)).toEqual(b.map(cardId));
  });

  it("different seeds produce different orders", () => {
    const a = shuffledDeck(1);
    const b = shuffledDeck(2);
    expect(a.map(cardId)).not.toEqual(b.map(cardId));
  });

  it("shuffling preserves the exact card set", () => {
    const shuffled = shuffledDeck(99);
    expect(new Set(shuffled.map(cardId))).toEqual(new Set(freshDeck().map(cardId)));
  });

  it("shuffle is pure — it does not mutate its input", () => {
    const original = freshDeck();
    const snapshot = original.map(cardId);
    shuffle(original, makeRng(7));
    expect(original.map(cardId)).toEqual(snapshot);
  });
});
