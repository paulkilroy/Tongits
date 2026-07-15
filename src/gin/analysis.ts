import { type Card, type Suit, cardId, cardLabel, cardPoints, SUIT_CLASS, RANKS, rankOrder } from "../engine/cards";
import { bestMelds, deadwood } from "../engine/meldFinder";
import { KNOCK_MAX } from "./game";
import { estimateOppDeadwood, type GinObs, type KnockReview } from "./review";
import { type ReviewTurn, GRADE_LABEL } from "../ui/reviewModel";
import { analyzeRummyTurns, type RummyRules } from "../engine/reviewEngine";

// Gin's analysis is now just a rules object handed to the shared analyzer. It says
// how a Gin card is worth/displayed, how a hand melds, and — the Gin-specific part —
// how good a resulting hand is ("score"): its deadwood and flexibility to improve
// against an ESTIMATE of the opponent's hand, read off their observable play. The
// harness does the enumerate-rank-grade. (Swapping `score` for a Monte-Carlo playout
// — gin/winodds — is a one-function change once it runs off the main thread.)

const dwCards = (h: Card[]): Card[] => deadwood(h);
const dwPts = (h: Card[]): number => dwCards(h).reduce((a, c) => a + cardPoints(c), 0);
const rc = (c: Card) => ({ label: cardLabel(c), suitClass: SUIT_CLASS[c.suit] });

/** Cards that would improve a 7-card hand toward a meld — a rough flexibility count.
 *  Pairs want the matching ranks; near-runs want the extending/filling cards. */
function improvementOuts(hand7: Card[]): number {
  const loose = dwCards(hand7);
  const held = new Set(hand7.map(cardId));
  const outs = new Set<string>();

  // Pairs → set: the two other suits of that rank complete it.
  const byRank = new Map<string, Card[]>();
  for (const c of loose) (byRank.get(c.rank) ?? byRank.set(c.rank, []).get(c.rank)!).push(c);
  for (const [, cs] of byRank) {
    if (cs.length >= 2) {
      for (const s of ["clubs", "diamonds", "hearts", "spades"] as Suit[]) {
        const id = `${cs[0].rank}-${s}`;
        if (!held.has(id)) outs.add(id);
      }
    }
  }

  // Near-runs within a suit: adjacent pair extends both ends; a one-gap fills the middle.
  const bySuit = new Map<Suit, number[]>();
  for (const c of loose) (bySuit.get(c.suit) ?? bySuit.set(c.suit, []).get(c.suit)!).push(rankOrder(c.rank));
  for (const [suit, ords] of bySuit) {
    const u = [...new Set(ords)].sort((a, b) => a - b);
    for (let k = 0; k < u.length - 1; k++) {
      const gap = u[k + 1] - u[k];
      if (gap === 1) {
        for (const o of [u[k] - 1, u[k + 1] + 1]) {
          if (o >= 1 && o <= 13) outs.add(`${RANKS[o - 1]}-${suit}`);
        }
      } else if (gap === 2) {
        outs.add(`${RANKS[u[k]]}-${suit}`); // the middle rank (ord u[k]+1 → index u[k])
      }
    }
  }
  return Math.min(8, outs.size);
}

/** Chance this hand goes on to win the deal, 0-1, vs an estimate of the opponent. */
function successChance(deadwoodPts: number, outs: number, oppEst: number): number {
  const adv = oppEst - deadwoodPts;
  let p = 1 / (1 + Math.exp(-adv / 7));
  p += Math.min(0.08, outs * 0.012); // room to still improve
  if (deadwoodPts === 0) p = Math.max(p, 0.9); // gin is on the table
  else if (deadwoodPts <= KNOCK_MAX) p += 0.03; // can knock right now
  return Math.max(0.03, Math.min(0.97, p));
}

function discardNote(c: Card, hand8: Card[]): string {
  const pts = cardPoints(c);
  const tail = `dumps ${pts} pt${pts === 1 ? "" : "s"}`;
  const melded = new Set(bestMelds(hand8).flatMap((m) => m.cards.map(cardId)));
  if (melded.has(cardId(c))) return `breaks a meld · ${tail}`;
  // Does it pair or neighbour another loose card (a draw you'd break)?
  const loose = dwCards(hand8);
  const breaksDraw = loose.some(
    (o) =>
      cardId(o) !== cardId(c) &&
      (o.rank === c.rank || (o.suit === c.suit && Math.abs(rankOrder(o.rank) - rankOrder(c.rank)) <= 2)),
  );
  return `${breaksDraw ? "breaks a draw" : "loose"} · ${tail}`;
}

const SUIT_ORDER = ["clubs", "diamonds", "hearts", "spades"];

export function analyzeGinTurns(obs: GinObs): ReviewTurn[] {
  const total = obs.myTurns.length;
  const rules: RummyRules<Card> = {
    id: cardId,
    view: rc,
    meldedIds: (hand) => new Set(bestMelds(hand).flatMap((m) => m.cards.map(cardId))),
    melds: (hand) => bestMelds(hand).map((m) => [...m.cards]),
    sort: (hand) =>
      [...hand].sort(
        (a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || rankOrder(a.rank) - rankOrder(b.rank),
      ),
    note: (c, hand) => discardNote(c, hand),
    score: (handAfter, i) => {
      // Opponent estimate as of this turn: their pickups/turns scale up as the hand runs.
      const frac = total > 1 ? (i + 1) / total : 1;
      const oppEst = estimateOppDeadwood(Math.round(obs.oppPickups * frac), Math.round(obs.oppTurns * frac));
      return successChance(dwPts(handAfter), improvementOuts(handAfter), oppEst);
    },
  };
  return analyzeRummyTurns(
    obs.myTurns.map((t) => ({ hand: t.hand8, discarded: t.discarded })),
    rules,
  );
}

/** A plain-text version of the Gin hand review, for the Copy button. */
export function ginReviewToText(turns: ReviewTurn[], knock: KnockReview | null): string {
  const out: string[] = ["Gin — Hand review", ""];
  out.push("Chance of success: " + turns.map((t) => `T${t.turn} ${t.yourPct}%`).join("  "), "");
  for (const t of turns) {
    out.push(`Turn ${t.turn} — ${GRADE_LABEL[t.grade]} · ${t.yourPct}% (best ${t.bestPct}%)`);
    if (t.reason) out.push(`  → ${t.reason}`);
    out.push("  if you discard:");
    for (const d of t.discards)
      out.push(`    ${d.card.label} ${d.pct}%${d.cardId === t.yourDiscard ? " (you)" : ""}${d.note ? ` — ${d.note}` : ""}`);
  }
  if (knock) {
    const verdict =
      knock.verdict === "gin" ? "Gin" : knock.verdict === "strong" ? "Strong knock" : knock.verdict === "fair" ? "Fair knock" : "Risky knock";
    out.push("", `Knock: ${verdict} — ${knock.note}`);
  }
  return out.join("\n");
}
