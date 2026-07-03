import { type Card, cardId, cardLabel } from "../engine/cards";
import { scoreShow, describeShow, type ShowScore } from "./scoring";
import { analyzeDiscard, gradeDiscard, type DiscardEval, type CribGrade } from "./coach";
import { analyzePegging, type PegOption } from "./pegAnalysis";
import { type CribState } from "./game";

// Post-hand review for one seat: grade the DISCARD (your keep vs the best, by EV)
// and the PLAY (for each of your pegging cards, did you leave points on the table?).
// Reconstructs the pegging from the recorded play log — no live game needed.

export interface PegReviewPlay {
  by: number;
  card: Card;
  pts: number; // points this play actually scored
  total: number; // running total after the play
  // MC pegging analysis (your plays only):
  yourEV?: number; // expected net pegging (you − opp) of the card you played
  bestLabel?: string; // the card the analysis would play
  bestEV?: number;
  evLost?: number; // bestEV − yourEV
  options?: PegOption[]; // every legal card ranked by net EV
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
  yourEvLost: number; // total expected net pegging given up across your plays
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

  // Pegging: Monte-Carlo net-EV analysis of each of your plays.
  const decisions = analyzePegging(state, seat);
  const pegging: PegReviewPlay[] = [];
  let yourPegPoints = 0;
  let yourEvLost = 0;
  state.playLog.forEach((e, i) => {
    const play: PegReviewPlay = { by: e.by, card: e.card, pts: e.pts, total: e.total };
    if (e.by === seat) {
      yourPegPoints += e.pts;
      const d = decisions.get(i);
      if (d) {
        play.yourEV = d.yourEV;
        play.bestLabel = d.bestLabel;
        play.bestEV = d.bestEV;
        play.evLost = d.evLost;
        play.options = d.options;
        yourEvLost += d.evLost;
      }
    }
    pegging.push(play);
  });

  return {
    seat,
    ownsCrib,
    starter,
    handScore: scoreShow(me.played, starter, false),
    cribScore: ownsCrib ? scoreShow(state.crib, starter, true) : null,
    discard: { kept, discarded: me.laidAway, best: evs[0].keep, grade, lost, top: evs.slice(0, 5) },
    pegging,
    yourPegPoints,
    yourEvLost,
  };
}

/** Plain-text export of a hand review (for the Copy button). */
export function reviewToText(r: HandReview, oppName: string): string {
  const labels = (cs: Card[]) => cs.map(cardLabel).join(" ");
  const out: string[] = ["Cribbage — Hand review", ""];
  out.push(`Cut: ${cardLabel(r.starter)}${r.ownsCrib ? " · your crib" : ""}`, "");

  out.push(`Discard — ${r.discard.grade}${r.discard.lost > 0.3 ? ` · gave up ${r.discard.lost.toFixed(1)} pts` : ""}`);
  out.push(`  kept ${labels(r.discard.kept)} → crib ${labels(r.discard.discarded)}`);
  for (const e of r.discard.top)
    out.push(
      `  ${labels(e.keep)}  net ${e.net.toFixed(1)} (hand ${e.handEV.toFixed(1)} · crib ${r.ownsCrib ? "+" : "−"}${e.cribEV.toFixed(1)})`,
    );
  out.push("");

  out.push(`Pegging — you scored ${r.yourPegPoints}${r.yourEvLost > 0.3 ? ` · gave up ${r.yourEvLost.toFixed(1)} net` : ""}`);
  for (const p of r.pegging) {
    const who = p.by === r.seat ? "you" : oppName;
    out.push(`  ${who}: ${cardLabel(p.card)} (${p.total})${p.pts ? ` +${p.pts}` : ""}`);
    if (p.by === r.seat && p.options && p.options.length > 1) {
      const sign = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
      out.push(
        "      play: " +
          p.options.map((o) => `${o.label} ${sign(o.ev)}${o.id === cardId(p.card) ? "(you)" : ""}`).join("  "),
      );
    }
  }
  out.push("");

  out.push(`Your hand: ${r.handScore.total} — ${describeShow(r.handScore)}`);
  if (r.cribScore) out.push(`Your crib: ${r.cribScore.total} — ${describeShow(r.cribScore)}`);
  return out.join("\n");
}
