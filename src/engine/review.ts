import { type Card, cardLabel, cardPoints, cardId } from "./cards";
import { type GameState } from "./game";
import { canLayOff } from "./melds";
import { deadwood } from "./meldFinder";
import { handPoints } from "./scoring";
import { handDraws, isDeadDraw, conflictingCards, type DrawOdds } from "./odds";

// Turns a recorded round (a list of per-ply game states) into a per-turn review
// for one seat: the odds of each draw they held, plus rule-based lessons drawn
// from Tongits strategy (dead draws, competing draws, high deadwood, missed sapaw).

export interface TurnReview {
  turn: number;
  deadwoodPts: number;
  draws: DrawOdds[];
  notes: { level: "warn" | "tip"; text: string }[];
}

export interface GameReviewResult {
  turns: TurnReview[];
  summary: string[];
}

const pct = (p: number) => Math.round(p * 100);
const labels = (cs: Card[]) => cs.map(cardLabel).join(" ");

/** Can this seat lay `card` off onto any meld on the table right now? */
function sapawAvailable(state: GameState, seat: number, card: Card): boolean {
  return state.players.some(
    (p, pi) =>
      (pi === seat || state.rules.allowSapawOnOpponents) && p.melds.some((m) => canLayOff(m, card)),
  );
}

export function reviewRound(history: readonly GameState[], seat: number): GameReviewResult {
  // Segment the ply list into turns; keep each turn's first action state (the
  // decision point, right after drawing) and its last state (end of the turn).
  const segments: { first?: GameState; last?: GameState }[] = [];
  let prevCurrent = -1;
  for (const s of history) {
    if (s.current !== prevCurrent) {
      segments.push({});
      prevCurrent = s.current;
    }
    if (s.current === seat) {
      const seg = segments[segments.length - 1];
      if (s.phase === "action" && !seg.first) seg.first = s;
      seg.last = s;
    }
  }

  const turns: TurnReview[] = [];
  let deadTurns = 0;
  let missedSapawTurns = 0;
  let n = 0;

  for (const seg of segments) {
    if (!seg.first) continue;
    n++;
    const s = seg.first;
    const draws = handDraws(s, seat);
    const dead = draws.filter(isDeadDraw);
    const conflicts = conflictingCards(draws);
    const hand = s.players[seat].hand;
    const dw = deadwood(hand);

    // High-value loose cards not contributing to any live draw.
    const liveDrawCards = new Set(
      draws.filter((d) => d.outsLive > 0).flatMap((d) => d.held.map(cardId)),
    );
    const highLoose = dw.filter((c) => cardPoints(c) >= 10 && !liveDrawCards.has(cardId(c)));

    // Missed sapaw: deadwood at the END of the turn that could have laid off.
    const endHand = (seg.last ?? s).players[seat].hand;
    const missed = deadwood(endHand).filter((c) => sapawAvailable(seg.last ?? s, seat, c));

    const notes: TurnReview["notes"] = [];
    if (dead.length) {
      deadTurns++;
      notes.push({
        level: "warn",
        text: `Dead draw — ${dead.map((d) => labels(d.held)).join(", ")} has no outs left. Let it go.`,
      });
    }
    for (const d of draws) {
      if (d.outsLive > 0 && d.probability < 0.15) {
        notes.push({
          level: "warn",
          text: `Long shot: ${labels(d.held)} is ${d.kind === "run-gutshot" ? "an inside" : d.kind === "run-open" ? "an outside" : "a set"} draw with ${d.outsLive} live out${d.outsLive === 1 ? "" : "s"} (~${pct(d.probability)}%).`,
        });
      }
    }
    if (conflicts.size) {
      notes.push({
        level: "tip",
        text: `Competing draws share ${[...conflicts].map((id) => cardLabel(hand.find((c) => cardId(c) === id)!)).join(", ")} — they can't both pay off; commit to the better one.`,
      });
    }
    if (highLoose.length) {
      notes.push({
        level: "warn",
        text: `High deadwood: ${labels(highLoose)} (${highLoose.reduce((a, c) => a + cardPoints(c), 0)} pts) sitting loose — discard high cards early.`,
      });
    }
    if (missed.length) {
      missedSapawTurns++;
      notes.push({
        level: "warn",
        text: `Missed sapaw — ${labels(missed)} could lay onto a meld to dump deadwood.`,
      });
    }
    if (!notes.length) notes.push({ level: "tip", text: "Clean turn — no obvious leaks." });

    turns.push({ turn: n, deadwoodPts: handPoints(dw), draws, notes });
  }

  const summary: string[] = [];
  if (deadTurns) summary.push(`Held a dead draw on ${deadTurns} turn${deadTurns === 1 ? "" : "s"}.`);
  if (missedSapawTurns)
    summary.push(`Missed a sapaw on ${missedSapawTurns} turn${missedSapawTurns === 1 ? "" : "s"}.`);
  if (!summary.length) summary.push("Solid round — no big leaks spotted.");

  return { turns, summary };
}
