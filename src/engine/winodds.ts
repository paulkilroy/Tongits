import { type Card, cardId } from "./cards";
import { freshDeck, shuffle } from "./deck";
import { type GameState } from "./game";
import { takeAITurn } from "./ai";
import { roundSegments } from "./review";

// Monte Carlo win-odds. At a decision point, the seat knows only their own hand,
// the laid melds, and the discard pile. We deal the UNSEEN cards (opponents'
// hands + stock) many random ways, play each out with the AI policy for every
// seat, and measure how often `seat` wins — an estimate of their win probability.

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

/** One sampled playout from `state`; returns true if `seat` wins the round. */
function rolloutOnce(state: GameState, seat: number, rng: () => number): boolean {
  let s = structuredClone(state);
  // Redistribute the unseen cards into opponents' hands (matching their counts)
  // and the stock, then let the AI play everyone out.
  const pool = shuffle(unseenCards(state, seat), rng);
  let i = 0;
  for (let p = 0; p < s.players.length; p++) {
    if (p === seat) continue;
    const count = s.players[p].hand.length;
    s.players[p].hand = pool.slice(i, i + count);
    i += count;
  }
  s.stock = pool.slice(i);
  s.players.forEach((p) => (p.isAI = true)); // drive every seat with the AI policy

  let guard = 0;
  while (!s.result && guard++ < 400) {
    const next = takeAITurn(s);
    if (next === s) break; // no progress (shouldn't happen) — bail
    s = next;
  }
  return s.result?.winner === seat;
}

/** Estimate P(seat wins) from a state over `samples` playouts. */
export function estimateWinOdds(state: GameState, seat: number, samples: number): number {
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    if (rolloutOnce(state, seat, Math.random)) wins++;
  }
  return wins / samples;
}

export interface WinPoint {
  turn: number;
  pct: number; // 0–100 win probability at the start of that turn
}

/** Win-% at each of the seat's decision points across the recorded round. */
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
