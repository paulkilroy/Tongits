import { type Card, cardId, cardLabel, cardPoints } from "../engine/cards";
import { freshDeck, makeRng, shuffle } from "../engine/deck";
import { scorePlay } from "./scoring";
import { type CribState } from "./game";

// Monte-Carlo pegging analysis. For each of YOUR plays we sample the opponent's
// unknown remaining hand, then solve the rest of the pegging exactly (minimax —
// both sides play optimally) to score each candidate card by expected NET pegging
// points (you − opponent). Hands are ≤4 cards, so the exact solve is tiny.

const val = cardPoints;
const rm = (hand: Card[], c: Card) => hand.filter((x) => cardId(x) !== cardId(c));

/** Optimal net pegging (hero − villain) from a position to the end of the play. */
function solve(h: Card[], v: Card[], seq: Card[], total: number, turn: number, passes: number, last: number): number {
  const hand = turn === 0 ? h : v;
  const legal = hand.filter((c) => total + val(c) <= 31);
  if (legal.length === 0) {
    if (passes + 1 >= 2) {
      // series ends: the last player to lay a card takes 1 (go).
      const pts = last < 0 ? 0 : last === 0 ? 1 : -1;
      if (h.length === 0 && v.length === 0) return pts;
      const leader = last < 0 ? turn : last === 0 ? 1 : 0;
      return pts + solve(h, v, [], 0, leader, 0, -1);
    }
    return solve(h, v, seq, total, turn === 0 ? 1 : 0, passes + 1, last);
  }
  const outcomes = legal.map((c) => afterPlay(h, v, seq, total, turn, c));
  return turn === 0 ? Math.max(...outcomes) : Math.min(...outcomes);
}

/** Net (hero − villain) from `turn` playing `c`, then optimal play to the end. */
function afterPlay(h: Card[], v: Card[], seq: Card[], total: number, turn: number, c: Card): number {
  const nseq = [...seq, c];
  const ntot = total + val(c);
  const signed = turn === 0 ? scorePlay(nseq, ntot) : -scorePlay(nseq, ntot);
  const nh = turn === 0 ? rm(h, c) : h;
  const nv = turn === 1 ? rm(v, c) : v;
  if (ntot === 31) {
    if (nh.length === 0 && nv.length === 0) return signed;
    return signed + solve(nh, nv, [], 0, turn === 0 ? 1 : 0, 0, -1);
  }
  if (nh.length === 0 && nv.length === 0) return signed + (turn === 0 ? 1 : -1); // last card
  return signed + solve(nh, nv, nseq, ntot, turn === 0 ? 1 : 0, 0, turn);
}

export interface PegOption {
  id: string;
  label: string;
  ev: number; // expected net pegging (you − opp) over the rest of the play
}

export interface PegDecision {
  yourEV: number;
  bestLabel: string;
  bestId: string;
  bestEV: number;
  evLost: number;
  options: PegOption[]; // every legal card, best net EV first
}

const kept = (s: CribState, seat: number): Card[] =>
  s.players[seat].deal.filter((c) => !s.players[seat].laidAway.some((l) => cardId(l) === cardId(c)));

/** Analyze each of `seat`'s pegging decisions; keyed by play-log index. */
export function analyzePegging(state: CribState, seat: number, samples = 60): Map<number, PegDecision> {
  const out = new Map<number, PegDecision>();
  const starter = state.starter;
  if (!starter) return out;
  const opp = (seat + 1) % 2;
  const deck = freshDeck();
  const seenBase = [...state.players[seat].deal.map(cardId), cardId(starter)]; // what YOU can see all hand
  const villPlayed = new Set<string>();

  const remaining: Record<number, Card[]> = { [seat]: kept(state, seat), [opp]: kept(state, opp) };
  let seq: Card[] = [];
  let idx = 0;
  for (const e of state.playLog) {
    const before = e.total - val(e.card);
    if (before === 0) seq = [];

    if (e.by === seat) {
      const heroHand = remaining[seat];
      const villCount = remaining[opp].length;
      const seen = new Set([...seenBase, ...villPlayed]);
      const pool = deck.filter((c) => !seen.has(cardId(c)));
      // Common random numbers: same sampled villain hands for every candidate.
      const rng = makeRng(0x9e3779b1 ^ (idx * 2654435761));
      const villHands: Card[][] = [];
      for (let s = 0; s < samples; s++) villHands.push(shuffle(pool, rng).slice(0, villCount));

      const legal = heroHand.filter((c) => before + val(c) <= 31);
      let yourEV = 0;
      const options: PegOption[] = [];
      for (const c of legal) {
        let sum = 0;
        for (const vh of villHands) sum += afterPlay(heroHand, vh, seq, before, 0, c);
        const ev = sum / villHands.length;
        if (cardId(c) === cardId(e.card)) yourEV = ev;
        options.push({ id: cardId(c), label: cardLabel(c), ev });
      }
      options.sort((a, b) => b.ev - a.ev);
      const best = options[0];
      out.set(idx, {
        yourEV,
        bestLabel: best.label,
        bestId: best.id,
        bestEV: best.ev,
        evLost: Math.max(0, best.ev - yourEV),
        options,
      });
    }

    seq.push(e.card);
    remaining[e.by] = remaining[e.by].filter((c) => cardId(c) !== cardId(e.card));
    if (e.by === opp) villPlayed.add(cardId(e.card));
    idx++;
  }
  return out;
}
