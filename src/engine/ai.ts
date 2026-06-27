import { type Card, cardId, rankOrder, cardPoints } from "./cards";
import { canLayOff } from "./melds";
import { bestMelds, meldUsing, deadwood } from "./meldFinder";
import { handPoints } from "./scoring";
import {
  type GameState,
  currentPlayer,
  topDiscard,
  draw,
  layMeld,
  sapaw,
  discard,
  callFight,
  canCallFight,
  canTakeDiscard,
  discardFormsMeld,
} from "./game";

// A simple greedy AI. It draws, lays down every meld it can, sapaws its spare
// cards where legal, then either calls a low-hand fight or discards its least
// useful card. Good enough to be a real practice opponent; not a hard AI.

const CALL_THRESHOLD = 8; // call Laban when holding this few points or fewer

/** Pick the least useful card to throw away. */
function chooseDiscard(hand: readonly Card[]): Card {
  const isolated = (c: Card) =>
    !hand.some(
      (o) =>
        cardId(o) !== cardId(c) &&
        (o.rank === c.rank ||
          (o.suit === c.suit && Math.abs(rankOrder(o.rank) - rankOrder(c.rank)) <= 2)),
    );
  // Prefer an isolated card (not building toward a meld), then the most points.
  return [...hand].sort((a, b) => {
    const ai = isolated(a) ? 1 : 0;
    const bi = isolated(b) ? 1 : 0;
    if (ai !== bi) return bi - ai;
    return cardPoints(b) - cardPoints(a);
  })[0];
}

/** Apply every legal sapaw the AI can make, repeating until none remain. */
function sapawAll(state: GameState): GameState {
  let s = state;
  let madeMove = true;
  let guard = 0;
  while (madeMove && guard++ < 30) {
    madeMove = false;
    const hand = currentPlayer(s).hand;
    outer: for (const card of hand) {
      for (let pi = 0; pi < s.players.length; pi++) {
        if (pi !== s.current && !s.rules.allowSapawOnOpponents) continue;
        const melds = s.players[pi].melds;
        for (let mi = 0; mi < melds.length; mi++) {
          if (canLayOff(melds[mi], card)) {
            const next = sapaw(s, pi, mi, card);
            if (next !== s) {
              s = next;
              madeMove = true;
              break outer;
            }
          }
        }
      }
    }
    if (s.result) break;
  }
  return s;
}

/** Play one complete AI turn, returning the state after it ends (or wins). */
export function takeAITurn(state: GameState): GameState {
  if (state.result || !currentPlayer(state).isAI) return state;
  let s = state;

  if (s.phase === "draw") {
    // Laban happens at the START of the turn: few unmatched points + a meld
    // down → call it (only the deadwood counts at a showdown).
    if (canCallFight(s) && handPoints(deadwood(currentPlayer(s).hand)) <= CALL_THRESHOLD) {
      return callFight(s);
    }
    // Take the discard only if it makes a new meld (so we can play it this turn);
    // otherwise draw blind from the stock.
    const top = topDiscard(s);
    if (top && canTakeDiscard(s) && discardFormsMeld(top, currentPlayer(s).hand)) {
      s = draw(s, "discard");
    } else {
      s = draw(s, "stock");
    }
    if (s.result) return s; // stock ran out
  }

  // If we took the discard, play the meld that uses it FIRST — the greedy finder
  // below might otherwise break that meld and leave the taken card stuck.
  if (s.mustPlay) {
    const forced = meldUsing(currentPlayer(s).hand, s.mustPlay);
    if (forced) {
      const next = layMeld(s, [...forced.cards]);
      if (next !== s) s = next;
      if (s.result) return s;
    }
  }

  // Lay down every meld we can (this also plays a card taken from the discard).
  for (const meld of bestMelds(currentPlayer(s).hand)) {
    const next = layMeld(s, [...meld.cards]);
    if (next !== s) s = next;
    if (s.result) return s; // melded out — Tongits
  }

  s = sapawAll(s);
  if (s.result) return s;

  // Discard the least useful card — prefer deadwood so we never break a meld.
  const dw = deadwood(currentPlayer(s).hand);
  return discard(s, chooseDiscard(dw.length > 0 ? dw : currentPlayer(s).hand));
}
