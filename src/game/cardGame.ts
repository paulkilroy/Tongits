// The spine every card game plugs into — extracted from Tongits' Monte-Carlo
// analyzer/AI and generalised so the SAME evaluator, AI, and (later) review harness
// work for rummy (Tongits/Gin/65) and trick games (Hearts/Spades) alike. A game only
// has to say how to: fill in hidden cards for a hypothetical playout, advance one ply
// with its own policy, tell when a deal is over, score it, and list a seat's options.
//
// Rummy vs trick differ entirely in their MOVES, but both reduce to this handful of
// operations, which is all the generic evaluator/AI need.

export interface Option<S> {
  /** Stable id for this option (e.g. a card id, or "draw:deck"). */
  id: string;
  /** Human label for the review/AI trace, e.g. "Discard K♣" or "Play Q♠". */
  label: string;
  /** The resulting state once this option is taken. */
  end: S;
}

export interface CardGame<S> {
  /** Re-deal everything `seat` can't see, so a playout starts from a plausible world
   *  (Gin's hidden hand, a trick game's other hands). Also mark all seats bot-driven. */
  determinize(state: S, seat: number, rng: () => number): S;
  /** Advance one ply from here using the game's own policy (whoever is to move). */
  step(state: S, rng: () => number): S;
  /** Is this deal finished? */
  isTerminal(state: S): boolean;
  /** Reward for `seat` in a finished deal — 1/0 for win/loss, or a point score. */
  reward(state: S, seat: number): number;
  /** The moves `seat` can make at the current decision point (for the AI + analyzer). */
  options(state: S, seat: number): Option<S>[];
}

/** Monte-Carlo value of a position for `seat`: play it out `samples` times from
 *  re-dealt worlds and average the reward. This is the one evaluator every game shares. */
export function evaluate<S>(game: CardGame<S>, state: S, seat: number, samples: number, rng: () => number): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < samples; i++) {
    let s = game.determinize(state, seat, rng);
    for (let guard = 0; guard < 400 && !game.isTerminal(s); guard++) s = game.step(s, rng);
    if (game.isTerminal(s)) {
      sum += game.reward(s, seat);
      n++;
    }
  }
  return n ? sum / n : 0.5;
}

export interface AIConfig {
  /** Playouts per option. Higher = stronger + slower. */
  samples: number;
}

/** The one config-driven AI: evaluate every legal option by Monte-Carlo and take the
 *  best. Works for any CardGame — a Tongits discard/meld line or a Hearts card play. */
export function chooseByMC<S>(
  game: CardGame<S>,
  state: S,
  seat: number,
  cfg: AIConfig,
  rng: () => number,
): Option<S> | null {
  const opts = game.options(state, seat);
  if (opts.length === 0) return null;
  let best = opts[0];
  let bestVal = -Infinity;
  for (const o of opts) {
    const v = evaluate(game, o.end, seat, cfg.samples, rng);
    if (v > bestVal) {
      bestVal = v;
      best = o;
    }
  }
  return best;
}
