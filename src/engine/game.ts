import { type Card, cardId, cardLabel } from "./cards";
import { shuffledDeck } from "./deck";
import { type Meld, classifyMeld, canLayOff, layOff } from "./melds";
import { handPoints } from "./scoring";
import { type RuleSet } from "./rules";

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
  phase: Phase;
  rules: RuleSet;
  log: string[];
  result: RoundResult | null;
}

const clone = (s: GameState): GameState => structuredClone(s);

export const currentPlayer = (s: GameState): Player => s.players[s.current];
export const topDiscard = (s: GameState): Card | undefined => s.discard[s.discard.length - 1];

function note(s: GameState, msg: string): void {
  s.log = [...s.log, msg];
}

/** Deal a fresh round. The dealer (player 0) gets 13 cards and acts first. */
export function newRound(
  rules: RuleSet,
  seed: number,
  names: string[],
  ai: boolean[],
): GameState {
  const deck = shuffledDeck(seed);
  const players: Player[] = names.map((name, i) => ({
    id: `p${i}`,
    name,
    isAI: ai[i] ?? false,
    hand: [],
    melds: [],
  }));

  // Dealer (player 0) gets 13, everyone else 12.
  let d = 0;
  for (let i = 0; i < players.length; i++) {
    const count = i === 0 ? 13 : 12;
    players[i].hand = deck.slice(d, d + count);
    d += count;
  }
  const stock = deck.slice(d);

  const state: GameState = {
    players,
    stock,
    discard: [],
    current: 0,
    phase: "action", // dealer already holds the extra card, so they act first
    rules,
    log: [`${players[0].name} deals. ${players[0].name}'s turn.`],
    result: null,
  };
  return state;
}

function remove(hand: Card[], card: Card): boolean {
  const i = hand.findIndex((c) => cardId(c) === cardId(card));
  if (i < 0) return false;
  hand.splice(i, 1);
  return true;
}

/** Draw a card from the stock or take the top of the discard pile. */
export function draw(state: GameState, source: "stock" | "discard"): GameState {
  if (state.result || state.phase !== "draw") return state;
  const s = clone(state);
  const p = currentPlayer(s);

  if (source === "discard") {
    const card = s.discard.pop();
    if (!card) return state;
    p.hand.push(card);
    note(s, `${p.name} takes ${cardLabel(card)} from the pile.`);
  } else {
    const card = s.stock.pop();
    if (!card) {
      // Stock exhausted: resolve per house rule.
      return endByStockEmpty(s);
    }
    p.hand.push(card);
    note(s, `${p.name} draws from the stock.`);
  }
  s.phase = "action";
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
  note(s, `${p.name} sapaws ${cardLabel(card)} onto ${s.players[targetPlayer].name}'s meld.`);
  return checkEmptyHand(s, p);
}

/** Discard a card to end the turn (or win by Tongits if it empties the hand). */
export function discard(state: GameState, card: Card): GameState {
  if (state.result || state.phase !== "action") return state;
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

/** Call a fight (laban): everyone compares hands, lowest points wins the round. */
export function callFight(state: GameState): GameState {
  if (state.result || state.phase !== "action" || !state.rules.enableLaban) return state;
  const p = currentPlayer(state);
  if (state.rules.mustHaveMeldToCall && p.melds.length === 0) return state;
  const s = clone(state);
  note(s, `${p.name} calls a fight!`);
  return finish(s, "showdown", s.current, s.current);
}

// --- internal helpers ---------------------------------------------------------

function advance(s: GameState): void {
  s.current = (s.current + 1) % s.players.length;
  s.phase = "draw";
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
  const points = s.players.map((p) => handPoints(p.hand));
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
  const points = s.players.map((p) => handPoints(p.hand));
  const resolvedWinner = reason === "showdown" || reason === "stockEmpty" ? lowestHand(points) : winner;
  s.result = { reason, winner: resolvedWinner, handPoints: points, caller };
  const w = s.players[resolvedWinner];
  note(s, w ? `${w.name} wins the round (${reason}).` : `Round tied (${reason}).`);
  return s;
}
