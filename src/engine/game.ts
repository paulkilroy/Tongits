import { type Card, cardId, cardLabel, rankOrder } from "./cards";
import { shuffledDeck } from "./deck";
import { type Meld, classifyMeld, canLayOff, canLayOffMany } from "./melds";
import { handPoints } from "./scoring";
import { deadwood } from "./meldFinder";
import { type RuleSet } from "./rules";
import { labanWinner, type LabanResponse } from "./betting";

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
  avatar: string;
  isAI: boolean;
  hand: Card[];
  melds: Meld[];
  /** Set when someone (anyone, including this player) sapaws onto one of this
   *  player's melds. Burns their right to call Laban on their next turn (consumed
   *  when that turn begins) — used when the lock is "next turn only". */
  meldSapawed: boolean;
  /** Burned for the REST of the round (used when sapawLockAllRound). Cleared on a
   *  new deal. */
  burned: boolean;
}

export interface RoundResult {
  reason: RoundReason;
  winner: number; // index into players; -1 if a tie went unbroken
  handPoints: number[]; // each player's remaining hand points
  caller?: number; // who called the fight, for showdowns
  tupong?: boolean; // true if a showdown tie was broken in the caller's favour
  /** For a Laban hand: everyone's fold/fight, for the pairwise money settlement. */
  laban?: { caller: number; responses: LabanResponse[]; handPoints: number[] };
}

/** After someone calls Laban, each other player must fold or fight before it resolves. */
export interface PendingLaban {
  caller: number;
  responses: (LabanResponse | null)[]; // "caller" for the caller, null until a reply
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
  /** Set while a Laban call is awaiting fold/fight replies from the others. */
  pendingLaban: PendingLaban | null;
}

const clone = (s: GameState): GameState => structuredClone(s);

export const currentPlayer = (s: GameState): Player => s.players[s.current];
export const topDiscard = (s: GameState): Card | undefined => s.discard[s.discard.length - 1];

function note(s: GameState, msg: string): void {
  s.log = [...s.log, msg];
}

/** Deal a fresh round. The dealer gets 13 cards and acts first; in a match the
 *  dealer alternates between games. */
const DEFAULT_AVATARS = ["🐱", "🤖", "🦊"];

export function newRound(
  rules: RuleSet,
  seed: number,
  names: string[],
  ai: boolean[],
  dealer = 0,
  avatars: string[] = [],
): GameState {
  const deck = shuffledDeck(seed);
  const players: Player[] = names.map((name, i) => ({
    id: `p${i}`,
    name,
    avatar: avatars[i] ?? DEFAULT_AVATARS[i] ?? "🙂",
    isAI: ai[i] ?? false,
    hand: [],
    melds: [],
    meldSapawed: false,
    burned: false,
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
    pendingLaban: null,
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
export function sapaw(state: GameState, targetPlayer: number, meldIndex: number, card: Card): GameState {
  return sapawMany(state, targetPlayer, meldIndex, [card]);
}

/** Lay one or more cards off onto an existing meld at once (e.g. a 2 and 3 onto a
 *  4-5-6 run). All cards must extend the meld together. */
export function sapawMany(
  state: GameState,
  targetPlayer: number,
  meldIndex: number,
  cards: Card[],
): GameState {
  if (state.result || state.phase !== "action" || cards.length === 0) return state;
  if (targetPlayer !== state.current && !state.rules.allowSapawOnOpponents) return state;
  const target = state.players[targetPlayer]?.melds[meldIndex];
  if (!target || !canLayOffMany(target, cards)) return state;

  const s = clone(state);
  const p = currentPlayer(s);
  if (!cards.every((c) => p.hand.some((h) => cardId(h) === cardId(c)))) return state;
  for (const c of cards) remove(p.hand, c);
  s.players[targetPlayer].melds[meldIndex] = classifyMeld([
    ...s.players[targetPlayer].melds[meldIndex].cards,
    ...cards,
  ])!;
  s.players[targetPlayer].meldSapawed = true; // next-turn lock
  s.players[targetPlayer].burned = true; // rest-of-round lock
  if (s.mustPlay && cards.some((c) => cardId(c) === cardId(s.mustPlay!))) s.mustPlay = null;
  const owner = s.players[targetPlayer].name;
  const self = targetPlayer === s.current;
  note(
    s,
    `${p.name} sapaws ${cards.map(cardLabel).join(" ")} onto ${self ? "their own" : owner + "'s"} meld — ${self ? p.name : owner} can't Laban (burned).`,
  );
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

/** Laban (call a fight): only at the START of your turn, before drawing. Each other
 *  player must then fold or fight (see respondLaban) before the hand resolves. */
export function callFight(state: GameState): GameState {
  if (!canCallFight(state)) return state;
  const s = clone(state);
  const caller = s.current;
  // Heads-up (2 players): no fold/fight — a straight showdown, lowest wins (caller
  // loses ties). Fold/fight is a 3-player house rule.
  if (s.players.length === 2) {
    note(s, `${currentPlayer(s).name} calls Laban!`);
    return finish(s, "showdown", caller, caller);
  }
  note(s, `${currentPlayer(s).name} calls Laban! Fold or fight.`);
  s.pendingLaban = {
    caller,
    responses: s.players.map((_, i) => (i === caller ? "caller" : null)),
  };
  return s;
}

/** Seats still owing a fold/fight reply to the pending Laban. */
export function pendingResponders(state: GameState): number[] {
  const pl = state.pendingLaban;
  if (!pl) return [];
  return pl.responses.map((r, i) => (r === null ? i : -1)).filter((i) => i >= 0);
}

/** To FIGHT a Laban you must have a meld down (same as calling one), when the rule
 *  requires it. With no meld you can only fold. */
export function canFightLaban(state: GameState, player: number): boolean {
  return !state.rules.mustHaveMeldToCall || state.players[player].melds.length > 0;
}

/** A player answers a Laban call. When everyone has, the hand resolves (lowest of
 *  the caller + fighters wins; folders are out; the caller loses ties). */
export function respondLaban(state: GameState, player: number, response: "fold" | "fight"): GameState {
  const pl = state.pendingLaban;
  if (!pl || pl.responses[player] !== null) return state;
  if (response === "fight" && !canFightLaban(state, player)) return state; // no meld → can't fight
  const s = clone(state);
  s.pendingLaban!.responses[player] = response;
  note(s, `${s.players[player].name} ${response === "fold" ? "folds" : "fights"}.`);
  if (s.pendingLaban!.responses.every((r) => r !== null)) resolveLaban(s);
  return s;
}

function resolveLaban(s: GameState): void {
  const pl = s.pendingLaban!;
  const responses = pl.responses as LabanResponse[];
  const points = s.players.map((p) => scoreHand(p.hand));
  const winner = labanWinner(pl.caller, responses, points);
  const contenders = responses.map((r, i) => (i === pl.caller || r === "fight" ? i : -1)).filter((i) => i >= 0);
  const min = Math.min(...contenders.map((i) => points[i]));
  const tupong = contenders.filter((i) => points[i] === min).length > 1; // a tie was broken
  s.pendingLaban = null;
  s.result = {
    reason: "showdown",
    winner,
    handPoints: points,
    caller: pl.caller,
    tupong,
    laban: { caller: pl.caller, responses, handPoints: points },
  };
  note(s, `${s.players[winner].name} wins the Laban.`);
}

/** Whether the current player may call Laban right now (start of turn only). */
export function canCallFight(state: GameState): boolean {
  if (state.result || state.phase !== "draw" || !state.rules.enableLaban) return false;
  // Burned by a sapaw — either the whole round, or just this (next) turn.
  const blocked = state.rules.sapawLockAllRound
    ? currentPlayer(state).burned
    : state.labanBlocked;
  if (blocked) return false;
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
  return finish(s, "stockEmpty", -1); // finish recomputes the winner (with the tiebreak)
}

/** Lowest hand wins; a tie goes to the most recent player to have played — the
 *  closest predecessor of `current` in turn order (house rule for stock-out). */
function lowestHandRecent(points: number[], current: number, count: number): number {
  const min = Math.min(...points);
  const tied = points.map((p, i) => (p === min ? i : -1)).filter((i) => i >= 0);
  const recency = (i: number) => (current - 1 - i + count) % count; // 0 = played most recently
  return tied.reduce((best, i) => (recency(i) < recency(best) ? i : best), tied[0]);
}

/** Lowest hand wins. On a tie for lowest the CALLER LOSES — they needed strictly
 *  the lowest. Among the tied players the one nearest the caller in turn order
 *  wins (Tupong), with the caller excluded if they were part of the tie. */
function resolveShowdown(
  points: number[],
  caller: number,
  count: number,
): { winner: number; tupong: boolean } {
  const min = Math.min(...points);
  const tied = points.map((p, i) => (p === min ? i : -1)).filter((i) => i >= 0);
  if (tied.length === 1) return { winner: tied[0], tupong: false };
  const contenders = tied.filter((i) => i !== caller);
  const pool = contenders.length ? contenders : tied;
  pool.sort((a, b) => ((a - caller + count) % count) - ((b - caller + count) % count));
  return { winner: pool[0], tupong: true };
}

function finish(
  s: GameState,
  reason: RoundReason,
  winner: number,
  caller?: number,
): GameState {
  const points = s.players.map((p) => scoreHand(p.hand));
  let resolvedWinner = winner;
  let tupong = false;
  if (reason === "showdown") {
    const r = resolveShowdown(points, caller ?? s.current, s.players.length);
    resolvedWinner = r.winner;
    tupong = r.tupong;
  } else if (reason === "stockEmpty") {
    resolvedWinner = lowestHandRecent(points, s.current, s.players.length);
  }
  s.result = { reason, winner: resolvedWinner, handPoints: points, caller, tupong };
  const w = s.players[resolvedWinner];
  note(s, w ? `${w.name} wins the round (${reason}).` : `Round tied (${reason}).`);
  return s;
}
