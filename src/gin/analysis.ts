import { type Card, type Suit, cardId, cardLabel, cardPoints, SUIT_CLASS, RANKS, rankOrder } from "../engine/cards";
import { bestMelds, deadwood } from "../engine/meldFinder";
import { KNOCK_MAX } from "./game";
import { estimateOppDeadwood, type GinObs, type KnockReview } from "./review";
import { type ReviewTurn, type DiscardChoice, type ReviewHandCard, gradeOf, GRADE_LABEL } from "../ui/reviewModel";

// Gin's analysis engine, emitting the shared `ReviewTurn[]` so the review renders
// identically to Tongits. Where Tongits runs a Monte-Carlo playout, Gin scores each
// possible discard by a "chance of success": how the resulting hand (its deadwood and
// its flexibility to improve) stacks up against an ESTIMATE of the opponent's hand,
// read off their observable play. Same review UI, Gin-specific probability logic.

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

export function analyzeGinTurns(obs: GinObs): ReviewTurn[] {
  const T = obs.myTurns.length;
  return obs.myTurns.map((t, idx) => {
    const hand8 = t.hand8;
    // Opponent estimate as of THIS turn: pickups/turns scale up as the hand runs.
    const frac = T > 1 ? (idx + 1) / T : 1;
    const oppEst = estimateOppDeadwood(Math.round(obs.oppPickups * frac), Math.round(obs.oppTurns * frac));

    // Score every possible discard.
    const scored = hand8.map((c) => {
      const hand7 = hand8.filter((x) => cardId(x) !== cardId(c));
      const dw = dwPts(hand7);
      const outs = improvementOuts(hand7);
      const pct = Math.round(successChance(dw, outs, oppEst) * 100);
      return { c, pct, note: discardNote(c, hand8) };
    });
    // One row per distinct card, best→worst.
    const rows = [...scored].sort((a, b) => b.pct - a.pct);
    const discards: DiscardChoice[] = rows.map((s) => ({
      cardId: cardId(s.c),
      card: rc(s.c),
      pct: s.pct,
      note: s.note,
    }));

    const yourId = cardId(t.discarded);
    const yourPct = scored.find((s) => cardId(s.c) === yourId)?.pct ?? 0;
    const best = rows[0];
    const bestPct = Math.max(best.pct, yourPct);
    const grade = gradeOf(bestPct - yourPct);
    const corrected = grade !== "best" && grade !== "good";
    const bestDiffers = corrected && cardId(best.c) !== yourId;
    const reason = bestDiffers ? `Discard ${cardLabel(best.c)} instead of ${cardLabel(t.discarded)}.` : "";

    // Hand shown = your 8 cards before the discard, melded vs loose, marked.
    const melded = new Set(bestMelds(hand8).flatMap((m) => m.cards.map(cardId)));
    const sorted = [...hand8].sort(
      (a, b) =>
        ["clubs", "diamonds", "hearts", "spades"].indexOf(a.suit) -
          ["clubs", "diamonds", "hearts", "spades"].indexOf(b.suit) || rankOrder(a.rank) - rankOrder(b.rank),
    );
    const hand: ReviewHandCard[] = sorted.map((c) => ({
      card: rc(c),
      loose: !melded.has(cardId(c)),
      mark: cardId(c) === yourId ? "discarded" : bestDiffers && cardId(c) === cardId(best.c) ? "shoulda" : "",
    }));

    // Your melds = the melds left after your actual discard.
    const hand7 = hand8.filter((x) => cardId(x) !== yourId);
    const melds = bestMelds(hand7).map((m) => m.cards.map(rc));

    return {
      turn: idx + 1,
      grade,
      yourPct,
      bestPct,
      reason,
      bestLine: null,
      hand,
      discards,
      moreDiscards: 0,
      yourDiscard: yourId,
      bestDiscard: bestDiffers ? cardId(best.c) : null,
      melds,
    };
  });
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
