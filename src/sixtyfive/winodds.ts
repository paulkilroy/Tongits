import { type RCard, buildShoe, deckCount, rlabel } from "./rules";
import { type SFState, draw, discard, payMe, canPayMe } from "./game";
import { takeAITurn } from "./ai";
import { type CardGame, type Option, evaluate } from "../game/cardGame";

// 65 as a CardGame<SFState>. Multi-deck shoe, concealed hands, lowest deadwood wins
// the hand. `determinize` re-deals the opponents from the unseen shoe; `reward` is
// "did this seat end with the lowest hand". Same spine as Tongits and Gin.

function shuffle(cards: RCard[], rng: () => number): RCard[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sixtyfiveGame: CardGame<SFState> = {
  determinize(state, seat, rng) {
    const s = structuredClone(state);
    for (const p of s.players) p.isAI = true;
    const N = s.players.length;
    const seen = new Set<string>([...state.players[seat].hand, ...state.discard].map((c) => c.id));
    const pool = shuffle(
      buildShoe(deckCount(N), 1).filter((c) => !seen.has(c.id)), // full shoe minus what this seat can see
      rng,
    );
    let i = 0;
    for (let p = 0; p < N; p++) {
      if (p === seat) continue;
      const count = s.players[p].hand.length;
      s.players[p].hand = pool.slice(i, i + count);
      i += count;
    }
    s.deck = pool.slice(i);
    return s;
  },
  step: (state, rng) => takeAITurn(state, rng),
  isTerminal: (state) => !!state.reveals || !!state.result,
  reward: (state, seat) => {
    if (!state.reveals) return 0;
    const min = Math.min(...state.reveals.map((r) => r.points));
    return state.reveals[seat].points === min ? 1 : 0; // lowest hand wins (ties share the credit)
  },
  options(state, seat) {
    if (state.current !== seat) return [];
    if (state.phase === "draw") {
      const opts: Option<SFState>[] = [{ id: "draw:deck", label: "Draw stock", end: draw(state, "deck") }];
      if (state.discard.length) opts.push({ id: "draw:discard", label: "Take discard", end: draw(state, "discard") });
      return opts;
    }
    if (state.phase === "discard") {
      return state.players[seat].hand.map((c) =>
        canPayMe(state, c.id)
          ? { id: `payme:${c.id}`, label: `Pay Me ${rlabel(c)}`, end: payMe(state, c.id) }
          : { id: `discard:${c.id}`, label: `Discard ${rlabel(c)}`, end: discard(state, c.id) },
      );
    }
    return [];
  },
};

/** Win % (lowest-hand) for `seat` from this position, 0-1, over `samples` playouts. */
export function estimateSixtyFiveWinOdds(state: SFState, seat: number, samples: number, rng: () => number): number {
  return evaluate(sixtyfiveGame, state, seat, samples, rng);
}
