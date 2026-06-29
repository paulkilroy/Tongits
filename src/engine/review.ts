import { type Card, cardLabel, cardPoints, cardId } from "./cards";
import { type GameState } from "./game";
import { canLayOff } from "./melds";
import { deadwood } from "./meldFinder";
import { handPoints } from "./scoring";
import { handDraws, isDeadDraw, conflictingCards, type DrawOdds } from "./odds";

// Turns a recorded round (a list of per-ply game states) into a per-turn review
// for one seat: the odds of each draw they held, plus rule-based lessons drawn
// from Tongits strategy (dead draws, competing draws, high deadwood, missed sapaw).

export type NoteTag =
  | "dead-draw"
  | "long-shot"
  | "competing"
  | "high-deadwood"
  | "missed-sapaw"
  | "clean";

export interface TurnReview {
  turn: number;
  deadwoodPts: number;
  /** What you could see of each opponent at this point — explains win-% swings. */
  opponents: { name: string; cards: number; melds: number }[];
  draws: DrawOdds[];
  notes: { level: "warn" | "tip"; tag: NoteTag; text: string }[];
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

export interface TurnSegment {
  first: GameState; // decision point — first action state of the turn (after drawing)
  last: GameState; // last state still on your turn (before you discard)
  after: GameState; // first state once your turn ends — what you KEEP (post-discard)
}

/** Split a recorded round into the seat's turns. `first` is the decision point
 *  (after drawing, before discarding); `after` is what you carry forward once the
 *  turn ends (so the card you just drew + discarded isn't counted as "held"). */
export function roundSegments(history: readonly GameState[], seat: number): TurnSegment[] {
  const out: TurnSegment[] = [];
  let i = 0;
  while (i < history.length) {
    while (i < history.length && history[i].current !== seat) i++;
    if (i >= history.length) break;
    let first: GameState | undefined;
    let last = history[i];
    while (i < history.length && history[i].current === seat) {
      const s = history[i];
      if (s.phase === "action" && !first) first = s;
      last = s;
      i++;
    }
    const after = i < history.length ? history[i] : last; // post-discard, or last if round ended
    if (first) out.push({ first, last, after });
  }
  return out;
}

export function reviewRound(history: readonly GameState[], seat: number): GameReviewResult {
  const segments = roundSegments(history, seat);
  const turns: TurnReview[] = [];
  let deadTurns = 0;
  let missedSapawTurns = 0;
  let n = 0;

  for (const seg of segments) {
    n++;
    const s = seg.first; // for opponent context + the turn number
    // Judge what you actually KEEP after discarding — not the card you just drew
    // and are about to throw away.
    const hand = seg.after.players[seat].hand;
    const draws = handDraws(seg.after, seat);
    const dead = draws.filter(isDeadDraw);
    const conflicts = conflictingCards(draws);
    const dw = deadwood(hand);

    // High-value loose cards not contributing to any live draw.
    const liveDrawCards = new Set(
      draws.filter((d) => d.outsLive > 0).flatMap((d) => d.held.map(cardId)),
    );
    const highLoose = dw.filter((c) => cardPoints(c) >= 10 && !liveDrawCards.has(cardId(c)));

    // Missed sapaw: a card you discarded (end-of-turn deadwood) that could have
    // laid onto a meld instead — so this one uses the pre-discard hand.
    const endHand = seg.last.players[seat].hand;
    const missed = deadwood(endHand).filter((c) => sapawAvailable(seg.last, seat, c));

    const notes: TurnReview["notes"] = [];
    if (dead.length) {
      deadTurns++;
      notes.push({
        level: "warn",
        tag: "dead-draw",
        text: `Dead draw — ${dead.map((d) => labels(d.held)).join(", ")} has no outs left. Let it go.`,
      });
    }
    for (const d of draws) {
      if (d.outsLive > 0 && d.probability < 0.15) {
        notes.push({
          level: "warn",
          tag: "long-shot",
          text: `Long shot: ${labels(d.held)} is ${d.kind === "run-gutshot" ? "an inside" : d.kind === "run-open" ? "an outside" : "a set"} draw with ${d.outsLive} live out${d.outsLive === 1 ? "" : "s"} (~${pct(d.probability)}%).`,
        });
      }
    }
    if (conflicts.size) {
      notes.push({
        level: "tip",
        tag: "competing",
        text: `Competing draws share ${[...conflicts].map((id) => cardLabel(hand.find((c) => cardId(c) === id)!)).join(", ")} — they can't both pay off; commit to the better one.`,
      });
    }
    if (highLoose.length) {
      notes.push({
        level: "warn",
        tag: "high-deadwood",
        text: `High deadwood: ${labels(highLoose)} (${highLoose.reduce((a, c) => a + cardPoints(c), 0)} pts) sitting loose — discard high cards early.`,
      });
    }
    if (missed.length) {
      missedSapawTurns++;
      notes.push({
        level: "warn",
        tag: "missed-sapaw",
        text: `Missed sapaw — ${labels(missed)} could lay onto a meld to dump deadwood.`,
      });
    }
    if (!notes.length) notes.push({ level: "tip", tag: "clean", text: "Clean turn — no obvious leaks." });

    const opponents = s.players
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i !== seat)
      .map(({ p }) => ({ name: p.name, cards: p.hand.length, melds: p.melds.length }));

    turns.push({ turn: n, deadwoodPts: handPoints(dw), opponents, draws, notes });
  }

  const summary: string[] = [];
  if (deadTurns) summary.push(`Held a dead draw on ${deadTurns} turn${deadTurns === 1 ? "" : "s"}.`);
  if (missedSapawTurns)
    summary.push(`Missed a sapaw on ${missedSapawTurns} turn${missedSapawTurns === 1 ? "" : "s"}.`);
  if (!summary.length) summary.push("Solid round — no big leaks spotted.");

  return { turns, summary };
}
