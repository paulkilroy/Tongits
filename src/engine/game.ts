import { type Card, cardId, cardLabel, rankOrder } from "./cards";
import { shuffledDeck } from "./deck";
import { type Meld, classifyMeld, canLayOff, layOff } from "./melds";
import { handPoints } from "./scoring";
import { deadwood } from "./meldFinder";
import { type RuleSet } from "./rules";

// At a showdown you're judged only on your UNMATCHED cards — cards that don't
// form a meld. Melds you hold in hand ("secret" melds) don't count against you.
const scoreHand = (hand: readonly Card[]): number => handPoints(deadwood(hand));

// The turn state machine for one round of Tongits.
//
// A turn goes: DRAW (stock or discard) → ACTION (lay melds, sapaw, then either
// discard to end your turn, or call a fight). A round ends three ways:
//   - tongits:    you empty your hand → instant win
//   - showdown:   someone calls a fight (laban) → lowest hand points wins
//   - stockEmpty: the draw pile runs out → resolved per the house rule

export type Phase = "draw" | "action";
export type RoundReason = "tongits" | "showdown" | "stockEmpty";

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  hand: Card[];
  melds: Meld[];
  /** Set when someone (anyone, including this player) sapaws onto one of this
   *  player's melds. It "burns" their right to call Laban on their next turn,
   *  and is consumed when that turn begins. */
  meldSapawed: boolean;
}

export interface RoundResult {
  reason: RoundReason;
  winner: number; // index into players; -1 if a tie went unbroken
  handPoints: number[]; // each player's remaining hand points
  caller?: number; // who called the fight, for showdowns
}

export interface GameState {
  players: Player[];
  stock: Card[];
  discard: Card[];
  current: number;
  /** Who dealt this round (gets 13, acts first). Alternates between games. */
  dealer: number;
  phase: Phase;
  rules: RuleSet;
  log: string[];
  result: RoundResult | null;
  /** True when the current player may not call Laban this turn (their meld was
   *  sapawed). Computed at the start of each turn from the player's flag. */
  labanBlocked: boolean;
  /** The card the current player just drew — for highlighting it in the hand. */
  lastDrawn: Card | null;
  /** A card taken from the discard pile that MUST be played (melded/sapawed)
   *  before the player can discard. Null once it's been played. */
  mustPlay: Card | null;
}

const clone = (s: GameState): GameState => structuredClone(s);

export const currentPlayer = (s: GameState): Player => s.players[s.current];
export const topDiscard = (s: GameState): Card | undefined => s.discard[s.discard.length - 1];

function note(s: GameState, msg: string): void {
  s.log = [...s.log, msg];
}

/** Deal a fresh round. The dealer gets 13 cards and acts first; in a match the
 *  dealer alternates between games. */
export function newRound(
  rules: RuleSet,
  seed: number,
  names: string[],
  ai: boolean[],
  dealer = 0,
): GameState {
  const deck = shuffledDeck(seed);
  const players: Player[] = names.map((name, i) => ({
    id: `p${i}`,
    name,
    isAI: ai[i] ?? false,
    hand: [],
    melds: [],
    meldSapawed: false,
  }));

  // The dealer gets 13, everyone else 12.
  let d = 0;
  for (let i = 0; i < players.length; i++) {
    const count = i === dealer ? 13 : 12;
    players[i].hand = deck.slice(d, d + count);
    d += count;
  }
  const stock = deck.slice(d);

  const state: GameState = {
    players,
    stock,
    discard: [],
    current: dealer,
    dealer,
    phase: "action", // dealer already holds the extra card, so they act first
    rules,
    log: [`${players[dealer].name} deals. ${players[dealer].name}'s turn.`],
    result: null,
    labanBlocked: false,
    lastDrawn: null,
    mustPlay: null,
  };
  return state;
}

function remove(hand: Card[], card: Card): boolean {
  const i = hand.findIndex((c) => cardId(c) === cardId(card));
  if (i < 0) return false;
  hand.splice(i, 1);
  return true;
}

/** Draw a card from the stock or take the top of the discard pile.
 *  Taking the discard is only legal if it can be played this turn, and the
 *  taken card is then flagged as `mustPlay` until it's melded or sapawed. */
export function draw(state: GameState, source: "stock" | "discard"): GameState {
  if (state.result || state.phase !== "draw") return state;

  if (source === "discard") {
    if (!canTakeDiscard(state)) return state; // can't take what you can't play
    const s = clone(state);
    const p = currentPlayer(s);
    const card = s.discard.pop()!;
    p.hand.push(card);
    s.mustPlay = card;
    s.lastDrawn = card;
    s.phase = "action";
    note(s, `${p.name} takes ${cardLabel(card)} from the pile — must play it.`);
    return s;
  }

  const s = clone(state);
  const p = currentPlayer(s);
  const card = s.stock.pop();
  if (!card) {
    // Stock exhausted: resolve per house rule.
    return endByStockEmpty(s);
  }
  p.hand.push(card);
  s.lastDrawn = card;
  s.mustPlay = null;
  s.phase = "action";
  note(s, `${p.name} draws from the stock.`);
  return s;
}

/** Lay down a new meld from cards currently in the player's hand. */
export function layMeld(state: GameState, cards: Card[]): GameState {
  if (state.result || state.phase !== "action") return state;
  const meld = classifyMeld(cards);
  if (!meld) return state;
  const s = clone(state);
  const p = currentPlayer(s);
  for (const c of cards) {
    if (!remove(p.hand, c)) return state; // card wasn't in hand — reject whole action
  }
  p.melds.push(meld);
  if (s.mustPlay && cards.some((c) => cardId(c) === cardId(s.mustPlay!))) s.mustPlay = null;
  note(s, `${p.name} melds ${meld.cards.map(cardLabel).join(" ")}.`);
  return checkEmptyHand(s, p);
}

/** Sapaw: lay one card off onto an existing meld (own, or an opponent's if allowed). */
export function sapaw(
  state: GameState,
  targetPlayer: number,
  meldIndex: number,
  card: Card,
): GameState {
  if (state.result || state.phase !== "action") return state;
  if (targetPlayer !== state.current && !state.rules.allowSapawOnOpponents) return state;
  const target = state.players[targetPlayer]?.melds[meldIndex];
  if (!target || !canLayOff(target, card)) return state;

  const s = clone(state);
  const p = currentPlayer(s);
  if (!remove(p.hand, card)) return state;
  const grown = layOff(s.players[targetPlayer].melds[meldIndex], card)!;
  s.players[targetPlayer].melds[meldIndex] = grown;
  s.players[targetPlayer].meldSapawed = true; // burns their Laban next turn
  if (s.mustPlay && cardId(card) === cardId(s.mustPlay)) s.mustPlay = null;
  note(s, `${p.name} sapaws ${cardLabel(card)} onto ${s.players[targetPlayer].name}'s meld.`);
  return checkEmptyHand(s, p);
}

/** Discard a card to end the turn (or win by Tongits if it empties the hand). */
export function discard(state: GameState, card: Card): GameState {
  if (state.result || state.phase !== "action") return state;
  if (state.mustPlay) return state; // must play the taken card before discarding
  const s = clone(state);
  const p = currentPlayer(s);
  if (!remove(p.hand, card)) return state;
  s.discard.push(card);
  note(s, `${p.name} discards ${cardLabel(card)}.`);

  if (p.hand.length === 0) {
    return finish(s, "tongits", s.current);
  }
  advance(s);
  return s;
}

/** Laban (call a fight): only at the START of your turn, before drawing.
 *  Everyone compares hands; the lowest points wins the round. */
export function callFight(state: GameState): GameState {
  if (!canCallFight(state)) return state;
  const s = clone(state);
  note(s, `${currentPlayer(s).name} calls Laban!`);
  return finish(s, "showdown", s.current, s.current);
}

/** Whether the current player may call Laban right now (start of turn only). */
export function canCallFight(state: GameState): boolean {
  if (state.result || state.phase !== "draw" || !state.rules.enableLaban) return false;
  if (state.labanBlocked) return false; // meld was sapawed — burned this turn
  const p = currentPlayer(state);
  if (state.rules.mustHaveMeldToCall && p.melds.length === 0) return false;
  return true;
}

/** Can the current player take the top discard? Only if they can play it this
 *  turn — either forming a new meld with hand cards, or sapawing it onto a meld. */
export function canTakeDiscard(state: GameState): boolean {
  if (state.result || state.phase !== "draw") return false;
  const top = topDiscard(state);
  if (!top) return false;
  if (discardFormsMeld(top, currentPlayer(state).hand)) return true;
  return state.players.some(
    (p, pi) =>
      (pi === state.current || state.rules.allowSapawOnOpponents) &&
      p.melds.some((m) => canLayOff(m, top)),
  );
}

/** Does the top discard combine with hand cards to make a brand-new meld? */
export function discardFormsMeld(top: Card, hand: readonly Card[]): boolean {
  // Set: two or more of the same rank already in hand.
  if (hand.filter((c) => c.rank === top.rank).length >= 2) return true;
  // Run: two same-suit neighbours that bracket or extend the discard.
  const t = rankOrder(top.rank);
  const present = new Set(hand.filter((c) => c.suit === top.suit).map((c) => rankOrder(c.rank)));
  const windows = [
    [t - 2, t - 1],
    [t - 1, t + 1],
    [t + 1, t + 2],
  ];
  return windows.some(([a, b]) => a >= 1 && b <= 13 && present.has(a) && present.has(b));
}

// --- internal helpers ---------------------------------------------------------

function advance(s: GameState): void {
  s.current = (s.current + 1) % s.players.length;
  s.phase = "draw";
  s.lastDrawn = null;
  s.mustPlay = null;
  // Consume any sapaw-lock: it applies to this one upcoming turn, then clears.
  s.labanBlocked = s.players[s.current].meldSapawed;
  s.players[s.current].meldSapawed = false;
  note(s, `${currentPlayer(s).name}'s turn.`);
}

/** If a meld/sapaw emptied the hand, that's a Tongits win without discarding. */
function checkEmptyHand(s: GameState, p: Player): GameState {
  if (p.hand.length === 0) {
    return finish(s, "tongits", s.current);
  }
  return s;
}

function endByStockEmpty(s: GameState): GameState {
  const points = s.players.map((p) => scoreHand(p.hand));
  if (s.rules.stockExhaustion === "lastDrawerLoses") {
    // The current player tried to draw and couldn't: they lose; best of the rest wins.
    const loser = s.current;
    let winner = -1;
    let best = Infinity;
    points.forEach((pt, i) => {
      if (i !== loser && pt < best) {
        best = pt;
        winner = i;
      }
    });
    note(s, `Stock is empty — ${s.players[loser].name} is burned.`);
    s.result = { reason: "stockEmpty", winner, handPoints: points };
    return s;
  }
  return finish(s, "stockEmpty", lowestHand(points));
}

function lowestHand(points: number[]): number {
  let winner = -1;
  let best = Infinity;
  let tie = false;
  points.forEach((pt, i) => {
    if (pt < best) {
      best = pt;
      winner = i;
      tie = false;
    } else if (pt === best) {
      tie = true;
    }
  });
  return tie ? -1 : winner;
}

function finish(
  s: GameState,
  reason: RoundReason,
  winner: number,
  caller?: number,
): GameState {
  const points = s.players.map((p) => scoreHand(p.hand));
  const resolvedWinner = reason === "showdown" || reason === "stockEmpty" ? lowestHand(points) : winner;
  s.result = { reason, winner: resolvedWinner, handPoints: points, caller };
  const w = s.players[resolvedWinner];
  note(s, w ? `${w.name} wins the round (${reason}).` : `Round tied (${reason}).`);
  return s;
}
