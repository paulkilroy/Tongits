import { type Card, type Rank, type Suit, cardId, rankOrder } from "./cards";
import { classifyMeld, type Meld } from "./melds";

// Finds melds inside a hand. Used by the AI to decide what to lay down, and by
// the UI to hint "you can meld these". Greedy and non-overlapping — good enough
// for play; not a guaranteed-optimal partition.

function candidateSets(hand: readonly Card[]): Meld[] {
  const byRank = new Map<Rank, Card[]>();
  for (const c of hand) {
    const list = byRank.get(c.rank) ?? [];
    list.push(c);
    byRank.set(c.rank, list);
  }
  const out: Meld[] = [];
  for (const cards of byRank.values()) {
    if (cards.length >= 3) {
      const meld = classifyMeld(cards);
      if (meld) out.push(meld);
    }
  }
  return out;
}

function candidateRuns(hand: readonly Card[]): Meld[] {
  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) {
    const list = bySuit.get(c.suit) ?? [];
    list.push(c);
    bySuit.set(c.suit, list);
  }
  const out: Meld[] = [];
  for (const cards of bySuit.values()) {
    const sorted = [...cards].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
    let run: Card[] = [];
    const flush = () => {
      if (run.length >= 3) out.push(classifyMeld(run)!);
    };
    for (const c of sorted) {
      if (run.length === 0 || rankOrder(c.rank) === rankOrder(run[run.length - 1].rank) + 1) {
        run.push(c);
      } else {
        flush();
        run = [c];
      }
    }
    flush();
  }
  return out;
}

/** A non-overlapping greedy selection of melds from a hand (largest first). */
export function bestMelds(hand: readonly Card[]): Meld[] {
  const candidates = [...candidateSets(hand), ...candidateRuns(hand)].sort(
    (a, b) => b.cards.length - a.cards.length,
  );
  const used = new Set<string>();
  const chosen: Meld[] = [];
  for (const meld of candidates) {
    if (meld.cards.some((c) => used.has(cardId(c)))) continue;
    meld.cards.forEach((c) => used.add(cardId(c)));
    chosen.push(meld);
  }
  return chosen;
}

/** Find a single meld in `hand` that includes `card` (set preferred, else run),
 *  or null if none exists. Used to play a card taken from the discard, which the
 *  rules require be melded the same turn. */
export function meldUsing(hand: readonly Card[], card: Card): Meld | null {
  const sameRank = hand.filter((c) => c.rank === card.rank);
  if (sameRank.length >= 3) return classifyMeld(sameRank);

  const suited = hand
    .filter((c) => c.suit === card.suit)
    .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
  let run: Card[] = [];
  const containsCard = (cards: Card[]) => cards.some((c) => cardId(c) === cardId(card));
  for (const c of suited) {
    if (run.length === 0 || rankOrder(c.rank) === rankOrder(run[run.length - 1].rank) + 1) {
      run.push(c);
    } else {
      if (run.length >= 3 && containsCard(run)) return classifyMeld(run);
      run = [c];
    }
  }
  if (run.length >= 3 && containsCard(run)) return classifyMeld(run);
  return null;
}

/** Cards left over after taking out the best melds — your "deadwood". */
export function deadwood(hand: readonly Card[]): Card[] {
  const melded = new Set<string>();
  for (const meld of bestMelds(hand)) {
    meld.cards.forEach((c) => melded.add(cardId(c)));
  }
  return hand.filter((c) => !melded.has(cardId(c)));
}
