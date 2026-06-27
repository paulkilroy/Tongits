import { type Card, cardId, rankOrder, cardPoints } from "./cards";
import { canLayOff } from "./melds";
import { bestMelds, deadwood } from "./meldFinder";
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
} from "./game";

// A simple greedy AI. It draws, lays down every meld it can, sapaws its spare
// cards where legal, then either calls a low-hand fight or discards its least
// useful card. Good enough to be a real practice opponent; not a hard AI.

const CALL_THRESHOLD = 8; // call a fight when holding this few points or fewer

/** Should the AI take the discard rather than draw blind from the stock? */
function wantsDiscard(state: GameState): boolean {
  const top = topDiscard(state);
  if (!top) return false;
  const hand = currentPlayer(state).hand;
  // Take it if it immediately melds more cards…
  const before = hand.length - deadwood(hand).length;
  const after = hand.concat(top);
  const afterMelded = after.length - deadwood(after).length;
  if (afterMelded > before + 1) return true; // +1 accounts for the card itself
  // …or if it can sapaw onto a meld already on the table.
  return state.players.some((p, pi) =>
    p.melds.some((m) => canLayOff(m, top) && (pi === state.current || state.rules.allowSapawOnOpponents)),
  );
}

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
    s = draw(s, wantsDiscard(s) ? "discard" : "stock");
    if (s.result) return s; // stock ran out
  }

  // Lay down every meld we can.
  for (const meld of bestMelds(currentPlayer(s).hand)) {
    const next = layMeld(s, [...meld.cards]);
    if (next !== s) s = next;
    if (s.result) return s; // melded out — Tongits
  }

  s = sapawAll(s);
  if (s.result) return s;

  // Low hand? Call a fight if the rules allow it.
  const canCall =
    s.rules.enableLaban && (!s.rules.mustHaveMeldToCall || currentPlayer(s).melds.length > 0);
  if (canCall && handPoints(currentPlayer(s).hand) <= CALL_THRESHOLD) {
    const next = callFight(s);
    if (next.result) return next;
  }

  // Otherwise discard the least useful card to end the turn.
  return discard(s, chooseDiscard(currentPlayer(s).hand));
}
