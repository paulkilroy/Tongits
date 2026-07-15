import { type Suit, SUITS, SUIT_CLASS } from "../engine/cards";
import { type RCard, type Rank, isWild, isJoker, rlabel, ord, pointOf } from "./rules";
import { analyze } from "./meld";
import { type SFState } from "./game";
import { type ReviewTurn, GRADE_LABEL } from "../ui/reviewModel";
import { analyzeRummyTurns, analyzeRummyMC, type RummyRules } from "../engine/reviewEngine";
import { sixtyfiveGame } from "./winodds";

// 65's hand review = a rules object handed to the shared analyzer. The only
// 65-specific parts are its point values (2–8=5, 9–K=10, A=15, wilds=0) and its
// wild cards (joker + the rank matching the hand size), both already in rules.ts /
// meld.ts. "Lower deadwood is better", so chance-of-success falls as deadwood rises.

export interface SFTurn {
  hand: RCard[]; // your hand right after drawing, before the discard
  discarded: RCard;
  /** The full decision-point state, for the Monte-Carlo deep dive. */
  state?: SFState;
}
export interface SFObs {
  myTurns: SFTurn[];
  wildRank: Rank | null; // the wild rank for this hand (constant within a hand)
}

const rord = (c: RCard) => (c.rank === "JOKER" ? 0 : ord(c.rank as Rank));

function sortSF(hand: RCard[], wild: Rank | null): RCard[] {
  const si = (s: Suit | null) => (s ? SUITS.indexOf(s) : 99);
  const wo = (c: RCard) => (isWild(c, wild) ? 99 : 0); // wilds/jokers trail
  return [...hand].sort((a, b) => wo(a) - wo(b) || si(a.suit) - si(b.suit) || rord(b) - rord(a));
}

/** Lower deadwood → higher chance of being the low hand that wins. */
function successChance(deadwoodPts: number): number {
  if (deadwoodPts === 0) return 0.92; // ready to Pay Me
  return Math.max(0.05, Math.min(0.95, 1 / (1 + Math.exp((deadwoodPts - 10) / 7))));
}

function sixtyFiveRules(wild: Rank | null): RummyRules<RCard> {
  return {
    id: (c) => c.id,
    view: (c) => ({ label: rlabel(c), suitClass: isJoker(c) ? "" : SUIT_CLASS[c.suit as Suit] }),
    meldedIds: (hand) => new Set(analyze(hand, wild).melds.flat().map((c) => c.id)),
    melds: (hand) => analyze(hand, wild).melds,
    sort: (hand) => sortSF(hand, wild),
    note: (c, hand) => {
      const pts = pointOf(c, wild);
      const tail = `dumps ${pts} pt${pts === 1 ? "" : "s"}`;
      const melded = new Set(analyze(hand, wild).melds.flat().map((x) => x.id));
      return melded.has(c.id) ? `breaks a meld · ${tail}` : `loose · ${tail}`;
    },
    score: (handAfter) => successChance(analyze(handAfter, wild).points),
  };
}

/** Instant heuristic review (main thread). */
export function analyzeSixtyFiveTurns(obs: SFObs): ReviewTurn[] {
  return analyzeRummyTurns(
    obs.myTurns.map((t) => ({ hand: t.hand, discarded: t.discarded })),
    sixtyFiveRules(obs.wildRank),
  );
}

/** Exact Monte-Carlo review (run in a worker). */
export function analyzeSixtyFiveMC(obs: SFObs, samples: number, onProgress?: (f: number) => void): ReviewTurn[] {
  const turns = obs.myTurns
    .filter((t) => t.state)
    .map((t) => ({ state: t.state!, seat: t.state!.current, hand: t.hand, discarded: t.discarded }));
  return analyzeRummyMC(sixtyfiveGame, turns, sixtyFiveRules(obs.wildRank), samples, onProgress);
}

/** Plain-text review for the Copy button. */
export function sixtyFiveReviewToText(turns: ReviewTurn[]): string {
  const out: string[] = ["65 — Hand review", ""];
  out.push("Chance of success: " + turns.map((t) => `T${t.turn} ${t.yourPct}%`).join("  "), "");
  for (const t of turns) {
    out.push(`Turn ${t.turn} — ${GRADE_LABEL[t.grade]} · ${t.yourPct}% (best ${t.bestPct}%)`);
    if (t.reason) out.push(`  → ${t.reason}`);
    out.push("  if you discard:");
    for (const d of t.discards)
      out.push(`    ${d.card.label} ${d.pct}%${d.cardId === t.yourDiscard ? " (you)" : ""}${d.note ? ` — ${d.note}` : ""}`);
  }
  return out.join("\n");
}
