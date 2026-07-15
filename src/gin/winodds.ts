import { type Card, type Suit, cardId, card, SUITS, RANKS } from "../engine/cards";
import { makeRng } from "../engine/deck";
import { type GinState } from "./game";
import { takeAITurn } from "./ai";

// Monte-Carlo win odds for Gin — the same kind of engine Tongits uses (playout the
// position many times, count wins), so the two games' analyzers can be graded the
// same way. Gin hides the opponent's hand, so each playout re-deals it at random
// from the cards this seat can't see, then plays both sides out with the built-in
// bot policy and reads off who won the hand.

function fullDeck(): Card[] {
  return SUITS.flatMap((s: Suit) => RANKS.map((r) => card(r, s)));
}

/** Cards `seat` cannot see: everything minus its own hand and the visible discards. */
function unseen(state: GinState, seat: number): Card[] {
  const known = new Set<string>([...state.players[seat].hand, ...state.discard].map(cardId));
  return fullDeck().filter((c) => !known.has(cardId(c)));
}

function shuffle(cards: Card[], rng: () => number): Card[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface GinOutcome {
  /** Fractions of resolved playouts, summing to ~1. First three are wins. */
  youGin: number;
  youKnock: number;
  youUndercut: number; // opponent knocked, you defended lower and scored
  oppKnock: number; // opponent knocked/ginned and you lost
  youUndercutLoss: number; // you knocked and got undercut
  /** Overall win fraction (the three win buckets). */
  winPct: number;
  samples: number;
}

/** One playout: re-deal the opponent's hidden hand from the unseen pool, then let
 *  the bot policy drive both sides until the hand resolves. */
function playoutOnce(state: GinState, seat: number, rng: () => number): GinState {
  const s = structuredClone(state);
  for (const p of s.players) p.isAI = true; // both sides driven by the rollout policy
  const opp = (seat + 1) % s.players.length;
  const pool = shuffle(unseen(state, seat), rng);
  const need = state.players[opp].hand.length;
  s.players[opp].hand = pool.slice(0, need);
  s.deck = pool.slice(need);

  let g = s;
  for (let guard = 0; guard < 300 && !g.round && !g.result; guard++) g = takeAITurn(g, rng);
  return g;
}

/** Win % for `seat` from this position, 0-1, over `samples` playouts. */
export function estimateGinWinOdds(state: GinState, seat: number, samples: number, rng: () => number): number {
  let wins = 0;
  let resolved = 0;
  for (let i = 0; i < samples; i++) {
    const g = playoutOnce(state, seat, rng);
    if (!g.round) continue;
    resolved++;
    if (g.round.scorer === seat) wins++;
  }
  return resolved ? wins / resolved : 0.5;
}

/** Full outcome breakdown for the deep-dive panel. */
export function ginAutopsy(state: GinState, seat: number, samples: number, seed: number): GinOutcome {
  const rng = makeRng(seed);
  const b = { youGin: 0, youKnock: 0, youUndercut: 0, oppKnock: 0, youUndercutLoss: 0 };
  let resolved = 0;
  for (let i = 0; i < samples; i++) {
    const g = playoutOnce(state, seat, rng);
    if (!g.round) continue;
    resolved++;
    const r = g.round;
    const won = r.scorer === seat;
    const youKnocked = r.knocker === seat;
    if (won && youKnocked && r.gin) b.youGin++;
    else if (won && youKnocked) b.youKnock++;
    else if (won) b.youUndercut++;
    else if (youKnocked) b.youUndercutLoss++;
    else b.oppKnock++;
  }
  const f = (n: number) => (resolved ? n / resolved : 0);
  return {
    youGin: f(b.youGin),
    youKnock: f(b.youKnock),
    youUndercut: f(b.youUndercut),
    oppKnock: f(b.oppKnock),
    youUndercutLoss: f(b.youUndercutLoss),
    winPct: f(b.youGin + b.youKnock + b.youUndercut),
    samples: resolved,
  };
}
