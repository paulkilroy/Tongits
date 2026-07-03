import { type Card, cardId, cardPoints } from "../engine/cards";
import { scorePlay, scoreShow, type ShowScore } from "./scoring";
import { analyzeDiscard, gradeDiscard, type DiscardEval, type CribGrade } from "./coach";
import { type CribState } from "./game";

// Post-hand review for one seat: grade the DISCARD (your keep vs the best, by EV)
// and the PLAY (for each of your pegging cards, did you leave points on the table?).
// Reconstructs the pegging from the recorded play log — no live game needed.

export interface PegReviewPlay {
  by: number;
  card: Card;
  pts: number; // points this play actually scored
  best: number; // most you could have scored here (your plays only)
  missed: number; // best − pts (your plays only)
  total: number; // running total after the play
}

export interface HandReview {
  seat: number;
  ownsCrib: boolean;
  starter: Card;
  handScore: ShowScore;
  cribScore: ShowScore | null;
  discard: {
    kept: Card[];
    discarded: Card[];
    best: Card[]; // the best keep the engine found
    grade: CribGrade;
    lost: number; // EV given up vs the best keep
    top: DiscardEval[]; // ranked options for the table
  };
  pegging: PegReviewPlay[];
  yourPegPoints: number;
  yourMissed: number;
}

/** Build the review for `seat` once the hand is over (starter cut, cards played). */
export function reviewHand(state: CribState, seat: number, samples = 200): HandReview | null {
  const starter = state.starter;
  if (!starter) return null;
  const me = state.players[seat];
  const ownsCrib = state.dealer === seat;
  const kept = me.deal.filter((c) => !me.laidAway.some((l) => cardId(l) === cardId(c)));

  // Discard: rank every keep by EV, grade what you kept.
  const evs = analyzeDiscard(me.deal, ownsCrib, samples);
  const { grade, lost } = gradeDiscard(evs, kept);

  // Pegging: replay the log, evaluating your alternatives at each of your plays.
  const remaining = state.players.map((p) =>
    p.deal.filter((c) => !p.laidAway.some((l) => cardId(l) === cardId(c))),
  );
  let seq: Card[] = [];
  const pegging: PegReviewPlay[] = [];
  let yourPegPoints = 0;
  let yourMissed = 0;
  for (const e of state.playLog) {
    const v = cardPoints(e.card);
    const before = e.total - v; // running total before this play
    if (before === 0) seq = []; // first card of a fresh series
    let best = e.pts;
    let missed = 0;
    if (e.by === seat) {
      const legal = remaining[seat].filter((c) => before + cardPoints(c) <= 31);
      const actual = scorePlay([...seq, e.card], e.total);
      for (const c of legal) {
        const s = scorePlay([...seq, c], before + cardPoints(c));
        if (s > best) best = s;
      }
      missed = Math.max(0, best - actual);
      yourPegPoints += e.pts;
      yourMissed += missed;
    }
    seq.push(e.card);
    remaining[e.by] = remaining[e.by].filter((c) => cardId(c) !== cardId(e.card));
    pegging.push({ by: e.by, card: e.card, pts: e.pts, best, missed, total: e.total });
  }

  return {
    seat,
    ownsCrib,
    starter,
    handScore: scoreShow(me.played, starter, false),
    cribScore: ownsCrib ? scoreShow(state.crib, starter, true) : null,
    discard: { kept, discarded: me.laidAway, best: evs[0].keep, grade, lost, top: evs.slice(0, 5) },
    pegging,
    yourPegPoints,
    yourMissed,
  };
}
