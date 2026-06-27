import { RANKS, SUITS, type Card, card } from "./cards";

// A deterministic, seedable RNG (mulberry32). Determinism matters here so that:
//   1. Tests can assert on an exact shuffle.
//   2. Online play can sync a game by sharing one seed instead of every card —
//      both devices shuffle identically.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh, ordered 52-card deck (no jokers). */
export function freshDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(card(rank, suit));
    }
  }
  return cards;
}

/** Fisher–Yates shuffle using a seeded RNG. Returns a new array (pure). */
export function shuffle(cards: readonly Card[], rng: () => number): Card[] {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A shuffled 52-card deck from a seed — the canonical starting stock. */
export function shuffledDeck(seed: number): Card[] {
  return shuffle(freshDeck(), makeRng(seed));
}
