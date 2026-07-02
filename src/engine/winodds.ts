import { type Card, type Rank, type Suit, card, cardId } from "./cards";
import { freshDeck, shuffle } from "./deck";
import { type GameState, discardFormsMeld } from "./game";
import { takeAITurn } from "./ai";
import { roundSegments } from "./review";

// Monte Carlo win-odds with light opponent modelling. At a decision point the
// seat knows only their own hand, the laid melds, and the discard pile. We deal
// the UNSEEN cards (opponents' hands + stock) many random ways, play each out
// with the AI policy, and measure how often `seat` wins.
//
// Opponent inference: a rational player wouldn't discard a card they could have
// melded, so we reject sampled opponent hands that would have made their MOST
// RECENT discard meldable — i.e. we use their discards to rule out hands, the way
// a human reads "they threw a 7, so they don't have the 7s/6-8 around it".

function visibleIds(state: GameState, seat: number): Set<string> {
  const ids = new Set<string>();
  for (const c of state.discard) ids.add(cardId(c));
  for (const p of state.players) for (const m of p.melds) for (const c of m.cards) ids.add(cardId(c));
  for (const c of state.players[seat].hand) ids.add(cardId(c));
  return ids;
}

function unseenCards(state: GameState, seat: number): Card[] {
  const seen = visibleIds(state, seat);
  return freshDeck().filter((c) => !seen.has(cardId(c)));
}

const SUIT_BY_SYMBOL: Record<string, Suit> = { "♣": "clubs", "♦": "diamonds", "♥": "hearts", "♠": "spades" };

function parseCard(label: string): Card | null {
  const m = label.match(/^(10|[2-9AJQK])([♣♦♥♠])$/);
  if (!m) return null;
  return card(m[1] as Rank, SUIT_BY_SYMBOL[m[2]]);
}

/** Each opponent's MOST RECENT discard, parsed from the log (or null). Their
 *  current hand shouldn't make that card meldable — they just chose to drop it. */
export function lastDiscards(state: GameState, seat: number): (Card | null)[] {
  return state.players.map((p, i) => {
    if (i === seat) return null;
    const prefix = `${p.name} discards `;
    let last: Card | null = null;
    for (const line of state.log) {
      if (line.startsWith(prefix)) last = parseCard(line.slice(prefix.length).replace(/\.$/, ""));
    }
    return last;
  });
}

const MAX_REDEALS = 12;

/** Deal the unseen cards one plausible way and play the round out with the AI;
 *  returns the FINAL state (with .result). Exposed so the deep-dive can inspect
 *  HOW each simulated round ended, not just whether `seat` won. */
export function playoutOnce(
  state: GameState,
  seat: number,
  lastDisc: (Card | null)[],
  rng: () => number,
): GameState {
  let s = structuredClone(state);
  for (let attempt = 0; attempt < MAX_REDEALS; attempt++) {
    s = structuredClone(state);
    const pool = shuffle(unseenCards(state, seat), rng);
    let i = 0;
    let consistent = true;
    for (let p = 0; p < s.players.length; p++) {
      if (p === seat) continue;
      const count = s.players[p].hand.length;
      const hand = pool.slice(i, i + count);
      i += count;
      s.players[p].hand = hand;
      const d = lastDisc[p];
      if (d && discardFormsMeld(d, hand)) consistent = false; // irrational — they'd have kept it
    }
    s.stock = pool.slice(i);
    if (consistent || attempt === MAX_REDEALS - 1) break; // accept consistent deal (or give up)
  }

  s.players.forEach((p) => (p.isAI = true));
  let guard = 0;
  while (!s.result && guard++ < 400) {
    const next = takeAITurn(s);
    if (next === s) break;
    s = next;
  }
  return s;
}

function rolloutOnce(
  state: GameState,
  seat: number,
  lastDisc: (Card | null)[],
  rng: () => number,
): boolean {
  return playoutOnce(state, seat, lastDisc, rng).result?.winner === seat;
}

export function estimateWinOdds(
  state: GameState,
  seat: number,
  samples: number,
  rng: () => number = Math.random,
): number {
  const lastDisc = lastDiscards(state, seat);
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    if (rolloutOnce(state, seat, lastDisc, rng)) wins++;
  }
  return wins / samples;
}

export interface WinPoint {
  turn: number;
  pct: number; // 0–100 win probability at the start of that turn
}

export function winOddsSeries(
  history: readonly GameState[],
  seat: number,
  samples: number,
  onProgress?: (fraction: number) => void,
): WinPoint[] {
  const states = roundSegments(history, seat).map((s) => s.first);
  const series: WinPoint[] = [];
  for (let i = 0; i < states.length; i++) {
    series.push({ turn: i + 1, pct: Math.round(estimateWinOdds(states[i], seat, samples) * 100) });
    onProgress?.((i + 1) / states.length);
  }
  return series;
}
