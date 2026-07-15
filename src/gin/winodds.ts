import { type Card, type Suit, cardId, cardLabel, card, SUITS, RANKS } from "../engine/cards";
import { makeRng } from "../engine/deck";
import { type GinState, draw, discard, knock, canKnock } from "./game";
import { takeAITurn } from "./ai";
import { type CardGame, type Option, evaluate } from "../game/cardGame";

// Gin as a CardGame<GinState>: the generic Monte-Carlo evaluator/AI drive it, the
// same way they'll drive Tongits and the trick games. Gin hides the opponent's hand,
// so `determinize` re-deals it from the cards this seat can't see before each playout.

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

export const ginGame: CardGame<GinState> = {
  determinize(state, seat, rng) {
    const s = structuredClone(state);
    for (const p of s.players) p.isAI = true; // both sides driven by the rollout policy
    const opp = (seat + 1) % s.players.length;
    const pool = shuffle(unseen(state, seat), rng);
    const need = state.players[opp].hand.length;
    s.players[opp].hand = pool.slice(0, need);
    s.deck = pool.slice(need);
    return s;
  },
  step: (state, rng) => takeAITurn(state, rng),
  isTerminal: (state) => !!state.round || !!state.result,
  reward: (state, seat) => (state.round && state.round.scorer === seat ? 1 : 0),
  options(state, seat) {
    if (state.current !== seat) return [];
    const hand = state.players[seat].hand;
    if (state.phase === "draw") {
      const opts: Option<GinState>[] = [{ id: "draw:deck", label: "Draw stock", end: draw(state, "deck") }];
      if (state.discard.length) opts.push({ id: "draw:discard", label: "Take discard", end: draw(state, "discard") });
      return opts;
    }
    if (state.phase === "discard") {
      return hand.map((c) => {
        const id = cardId(c);
        return canKnock(state, id)
          ? { id: `knock:${id}`, label: `Knock ${cardLabel(c)}`, end: knock(state, id) }
          : { id: `discard:${id}`, label: `Discard ${cardLabel(c)}`, end: discard(state, id) };
      });
    }
    return [];
  },
};

/** Win % for `seat` from this position, 0-1, over `samples` playouts. */
export function estimateGinWinOdds(state: GinState, seat: number, samples: number, rng: () => number): number {
  return evaluate(ginGame, state, seat, samples, rng);
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

/** One playout to a finished deal, via the shared game ops. */
function playoutOnce(state: GinState, seat: number, rng: () => number): GinState {
  let s = ginGame.determinize(state, seat, rng);
  for (let guard = 0; guard < 400 && !ginGame.isTerminal(s); guard++) s = ginGame.step(s, rng);
  return s;
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
