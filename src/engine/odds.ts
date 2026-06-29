import { type Card, type Suit, RANKS, SUITS, card, cardId, rankOrder } from "./cards";
import { type GameState } from "./game";
import { deadwood } from "./meldFinder";

// Equity engine: from one seat's point of view (what they can actually see — their
// own hand, every laid meld, and the discard pile), work out for each incomplete
// "draw" they're holding how many LIVE outs remain and the probability of completing
// it before the round ends. This is the poker-style math behind the analyzer:
// outside vs inside straights, dead draws (outs already gone), and competing draws.

export type DrawKind = "set" | "run-open" | "run-gutshot";

export interface DrawOdds {
  kind: DrawKind;
  /** The cards in hand forming this partial meld. */
  held: Card[];
  /** Cards that would complete it and are still unseen (live). */
  outs: Card[];
  /** Completing cards that are already seen (in a discard pile / meld) — why it's dying. */
  gone: Card[];
  /** Live out count (outs.length) and the max ignoring what's been seen. */
  outsLive: number;
  outsMax: number;
  /** Estimated chance to complete this draw during the rest of the round. */
  probability: number;
}

/** Card ids the seat can see: their hand, all laid melds, and the discard pile. */
function visibleIds(state: GameState, seat: number): Set<string> {
  const ids = new Set<string>();
  for (const c of state.discard) ids.add(cardId(c));
  for (const p of state.players) for (const m of p.melds) for (const c of m.cards) ids.add(cardId(c));
  for (const c of state.players[seat].hand) ids.add(cardId(c));
  return ids;
}

/** Unseen cards from the seat's perspective (opponents' hands + the stock). */
export function unseenCount(state: GameState, seat: number): number {
  return 52 - visibleIds(state, seat).size;
}

/** Roughly how many more cards this seat will draw from the stock this round. */
export function remainingDraws(state: GameState): number {
  return Math.max(1, Math.ceil(state.stock.length / state.players.length));
}

/** P(draw at least one of `live` outs within `draws` picks from `unseen` cards). */
export function completionProbability(live: number, unseen: number, draws: number): number {
  if (live <= 0 || unseen <= 0 || draws <= 0) return 0;
  let pMiss = 1;
  for (let i = 0; i < draws; i++) {
    const den = unseen - i;
    if (den <= 0) break;
    pMiss *= Math.max(0, den - live) / den; // each pick avoids every out
  }
  return Math.min(1, Math.max(0, 1 - pMiss));
}

const orderOf = (c: Card) => rankOrder(c.rank);
const cardAtOrder = (order: number, suit: Suit): Card => card(RANKS[order - 1], suit);

/** Every incomplete draw in the seat's deadwood, with live outs and odds. The
 *  same card can appear in multiple draws — that's a competing/conflicting draw. */
export function handDraws(state: GameState, seat: number): DrawOdds[] {
  const hand = state.players[seat].hand;
  const dw = deadwood(hand); // cards not already inside a best meld
  const vis = visibleIds(state, seat);
  const unseen = unseenCount(state, seat);
  const draws = remainingDraws(state);
  const out: DrawOdds[] = [];

  const make = (kind: DrawKind, held: Card[], candidates: Card[]) => {
    const outs = candidates.filter((c) => !vis.has(cardId(c)));
    const gone = candidates.filter((c) => vis.has(cardId(c)));
    out.push({
      kind,
      held,
      outs,
      gone,
      outsLive: outs.length,
      outsMax: candidates.length,
      probability: completionProbability(outs.length, unseen, draws),
    });
  };

  // Set draws: a pair of the same rank → the other two suits complete it.
  const byRank = new Map<string, Card[]>();
  for (const c of dw) (byRank.get(c.rank) ?? byRank.set(c.rank, []).get(c.rank)!).push(c);
  for (const [, cards] of byRank) {
    if (cards.length === 2) {
      const have = new Set(cards.map((c) => c.suit));
      const candidates = SUITS.filter((s) => !have.has(s)).map((s) => card(cards[0].rank, s));
      make("set", cards, candidates);
    }
  }

  // Run draws: two same-suit cards 1 apart (open) or 2 apart (gutshot).
  for (const suit of SUITS) {
    const cs = dw.filter((c) => c.suit === suit).sort((a, b) => orderOf(a) - orderOf(b));
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const lo = orderOf(cs[i]);
        const hi = orderOf(cs[j]);
        const gap = hi - lo;
        if (gap === 1) {
          const candidates: Card[] = [];
          if (lo - 1 >= 1) candidates.push(cardAtOrder(lo - 1, suit));
          if (hi + 1 <= 13) candidates.push(cardAtOrder(hi + 1, suit));
          make("run-open", [cs[i], cs[j]], candidates);
        } else if (gap === 2) {
          make("run-gutshot", [cs[i], cs[j]], [cardAtOrder(lo + 1, suit)]);
        }
      }
    }
  }

  return out;
}

/** A draw is dead when none of its outs remain live. */
export const isDeadDraw = (d: DrawOdds): boolean => d.outsLive === 0;

/** Cards shared by two draws that genuinely COMPETE — i.e. completing one would
 *  kill the other. Two draws that complete with the SAME out merge into one
 *  bigger meld (e.g. 10-Q and Q-K both want J → 10-J-Q-K), so they don't compete. */
export function conflictingCards(draws: DrawOdds[]): Set<string> {
  const conflict = new Set<string>();
  for (let i = 0; i < draws.length; i++) {
    for (let j = i + 1; j < draws.length; j++) {
      const a = draws[i];
      const b = draws[j];
      const shared = a.held.filter((c) => b.held.some((h) => cardId(h) === cardId(c)));
      if (shared.length === 0) continue;
      const aOuts = new Set(a.outs.map(cardId));
      if (b.outs.some((o) => aOuts.has(cardId(o)))) continue; // share an out → they merge, not compete
      for (const c of shared) conflict.add(cardId(c));
    }
  }
  return conflict;
}
