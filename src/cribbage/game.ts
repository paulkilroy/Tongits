import { type Card, cardPoints, cardLabel } from "../engine/cards";
import { shuffledDeck } from "../engine/deck";
import { scorePlay, scoreShow, type ShowScore } from "./scoring";

// Cribbage for 2 or 3 players. A round runs: deal (6 each for 2p, 5 each for 3p)
// → each lays cards into the dealer's crib (2 each for 2p; 1 each + 1 off the
// deck for 3p, so the crib is always 4) → cut a starter → THE PLAY (pegging to
// 31, repeatedly, around the table) → THE SHOW (each hand in turn starting left
// of the dealer, dealer last, then the crib). First to `target` (121) wins.

export type CribPhase = "discard" | "play" | "show" | "gameOver";

export interface CribPlayer {
  name: string;
  isAI: boolean;
  hand: Card[]; // 5–6 after deal, 4 after discarding
  played: Card[]; // laid during the play (all 4 by the show)
  score: number;
  discarded: boolean; // has this player put their card(s) in the crib yet?
  deal: Card[]; // the cards originally dealt this hand (kept for the review)
  laidAway: Card[]; // what this player put in the crib (kept for the review)
}

/** One pegging play, recorded across the whole hand for the post-hand review. */
export interface PlayLogEntry {
  by: number;
  card: Card;
  pts: number; // pegging points this play scored
  total: number; // running total AFTER the play (first card of a series == its value)
}

export interface ShowReveal {
  who: number;
  isCrib: boolean;
  hand: Card[];
  score: ShowScore;
}

export interface CribRules {
  target: number; // 121
}

export interface CribState {
  players: CribPlayer[];
  dealer: number;
  phase: CribPhase;
  deck: Card[]; // undealt remainder; the next card becomes the starter at the cut
  starter: Card | null;
  crib: Card[];
  current: number; // whose turn during the play
  seq: Card[]; // cards in the current pegging series (since the last 31/reset)
  seqBy: number[]; // who laid each card in `seq` (parallel array)
  total: number; // running total of `seq`
  playLog: PlayLogEntry[]; // every card played this hand, for the review
  passCount: number; // consecutive "go"s in the current series
  lastPlayer: number | null; // who laid the last card (takes the go / last-card point)
  showStage: number; // 0..N-1 hands (left of dealer → dealer), N crib, N+1 done
  lastReveal: ShowReveal | null;
  log: string[];
  result: { winner: number } | null;
  rules: CribRules;
}

export const STANDARD_CRIB_RULES: CribRules = { target: 121 };

const clone = (s: CribState): CribState => structuredClone(s);

/** How many cards each player lays into the crib (2 for heads-up, 1 for 3-hand). */
export const discardCount = (players: number): number => (players === 2 ? 2 : 1);
/** Cards dealt to each player. */
const dealtEach = (players: number): number => (players === 2 ? 6 : 5);
/** The player to the dealer's left — leads the play and counts first. */
export const eldest = (s: CribState): number => (s.dealer + 1) % s.players.length;
/** Back-compat alias (heads-up "pone" = the player who leads/counts first). */
export const pone = eldest;
export const currentPlayer = (s: CribState): CribPlayer => s.players[s.current];

const allEmpty = (s: CribState): boolean => s.players.every((p) => p.hand.length === 0);
/** Next player after `from` (going left) who still holds cards; falls back to `from`. */
function nextWithCards(s: CribState, from: number): number {
  const N = s.players.length;
  for (let k = 1; k <= N; k++) {
    const i = (from + k) % N;
    if (s.players[i].hand.length > 0) return i;
  }
  return from;
}
/** Can anyone still on the table add a card without busting 31? */
const anyCanPlay = (s: CribState): boolean =>
  s.players.some((p) => p.hand.some((c) => s.total + cardPoints(c) <= 31));

function note(s: CribState, msg: string): void {
  s.log = [...s.log, msg];
}

/** Deal a fresh round. Dealer rotates; the player to the dealer's left is dealt first. */
export function newRound(
  rules: CribRules,
  seed: number,
  names: string[],
  ai: boolean[],
  dealer = 0,
  scores: number[] = [],
): CribState {
  const N = names.length;
  const deck = shuffledDeck(seed);
  const players: CribPlayer[] = names.map((name, i) => ({
    name,
    isAI: ai[i] ?? false,
    hand: [],
    played: [],
    score: scores[i] ?? 0,
    discarded: false,
    deal: [],
    laidAway: [],
  }));
  const p0 = (dealer + 1) % N; // eldest hand dealt first
  const each = dealtEach(N);
  for (let i = 0; i < each * N; i++) players[(p0 + i) % N].hand.push(deck[i]);
  players.forEach((p) => (p.deal = [...p.hand])); // remember the original deal
  return {
    players,
    dealer,
    phase: "discard",
    deck: deck.slice(each * N),
    starter: null,
    crib: [],
    current: p0,
    seq: [],
    seqBy: [],
    total: 0,
    playLog: [],
    passCount: 0,
    lastPlayer: null,
    showStage: 0,
    lastReveal: null,
    log: [`${players[dealer].name} deals.`],
    result: null,
    rules,
  };
}

/** Add `score` to a player and flag a win at the target. */
function addScore(s: CribState, player: number, pts: number, why: string): boolean {
  if (pts <= 0) return false;
  s.players[player].score += pts;
  note(s, `${s.players[player].name} +${pts} (${why}).`);
  if (s.players[player].score >= s.rules.target) {
    s.result = { winner: player };
    s.phase = "gameOver";
    note(s, `${s.players[player].name} wins!`);
    return true;
  }
  return false;
}

/** A player lays their card(s) into the dealer's crib. When all have, cut the starter. */
export function discardToCrib(state: CribState, player: number, cards: Card[]): CribState {
  const need = discardCount(state.players.length);
  if (state.phase !== "discard" || cards.length !== need || state.players[player].discarded) return state;
  const ids = new Set(cards.map((c) => `${c.rank}-${c.suit}`));
  const p = state.players[player];
  if (!cards.every((c) => p.hand.some((h) => h.rank === c.rank && h.suit === c.suit))) return state;

  const s = clone(state);
  const N = s.players.length;
  const me = s.players[player];
  me.hand = me.hand.filter((c) => !ids.has(`${c.rank}-${c.suit}`));
  me.discarded = true;
  me.laidAway = [...cards];
  s.crib.push(...cards);
  note(s, `${me.name} lays ${need} in the crib.`);

  if (s.players.every((pl) => pl.discarded)) {
    // 3-hand: one card off the deck completes the 4-card crib.
    if (N === 3) {
      s.crib.push(s.deck[0]);
      s.deck = s.deck.slice(1);
    }
    // Cut the starter. A Jack turned is "his heels" — 2 for the dealer.
    const starter = s.deck[0];
    s.starter = starter;
    note(s, `Cut: ${cardLabel(starter)}.`);
    if (starter.rank === "J") addScore(s, s.dealer, 2, "his heels");
    s.phase = s.result ? "gameOver" : "play";
    s.current = eldest(s);
  }
  return s;
}

/** Cards the player may legally lay right now (value keeps the total ≤ 31). */
export function legalPlays(state: CribState, player: number): Card[] {
  return state.players[player].hand.filter((c) => state.total + cardPoints(c) <= 31);
}

export const canPlay = (state: CribState, player: number): boolean => legalPlays(state, player).length > 0;

function toShow(s: CribState): void {
  s.phase = "show";
  s.showStage = 0;
  s.seq = [];
  s.seqBy = [];
  s.total = 0;
  note(s, "The show.");
}

/** Lay a card during the play. */
export function playCard(state: CribState, card: Card): CribState {
  if (state.phase !== "play") return state;
  const P = state.current;
  if (state.total + cardPoints(card) > 31) return state; // illegal
  if (!state.players[P].hand.some((c) => c.rank === card.rank && c.suit === card.suit)) return state;

  const s = clone(state);
  const me = s.players[P];
  me.hand = me.hand.filter((c) => !(c.rank === card.rank && c.suit === card.suit));
  me.played.push(card);
  s.seq.push(card);
  s.seqBy.push(P);
  s.total += cardPoints(card);
  s.lastPlayer = P;
  s.passCount = 0;
  note(s, `${me.name} plays ${cardLabel(card)} (${s.total}).`);

  const pts = scorePlay(s.seq, s.total);
  s.playLog.push({ by: P, card, pts, total: s.total });
  if (pts && addScore(s, P, pts, "pegging")) return s;

  if (s.total === 31) {
    s.seq = [];
    s.seqBy = [];
    s.total = 0;
    if (allEmpty(s)) toShow(s);
    else s.current = nextWithCards(s, P);
    return s;
  }
  if (allEmpty(s)) {
    if (addScore(s, P, 1, "last card")) return s;
    toShow(s);
    return s;
  }
  s.current = nextWithCards(s, P);
  return s;
}

/** Declare "go" — only legal when you have no playable card. */
export function go(state: CribState): CribState {
  if (state.phase !== "play") return state;
  const P = state.current;
  if (canPlay(state, P)) return state; // must play if able

  const s = clone(state);
  note(s, `${s.players[P].name} says go.`);
  s.passCount += 1;
  if (!anyCanPlay(s)) {
    // Nobody left can add a card: last to lay takes 1 for the go, then reset.
    const last = s.lastPlayer ?? P;
    if (addScore(s, last, 1, "go")) return s;
    s.seq = [];
    s.seqBy = [];
    s.total = 0;
    s.passCount = 0;
    if (allEmpty(s)) toShow(s);
    else s.current = nextWithCards(s, last);
    return s;
  }
  s.current = nextWithCards(s, P);
  return s;
}

/** Count the next hand in the show (left of dealer → dealer → crib), then the round advances. */
export function nextShow(state: CribState): CribState {
  if (state.phase !== "show" || !state.starter) return state;
  const s = clone(state);
  const starter = s.starter!;
  const N = s.players.length;

  if (s.showStage < N) {
    const who = (s.dealer + 1 + s.showStage) % N; // eldest first, dealer last
    const hand = s.players[who].played;
    const sc = scoreShow(hand, starter, false);
    s.lastReveal = { who, isCrib: false, hand, score: sc };
    s.showStage += 1;
    if (addScore(s, who, sc.total, "hand")) return s;
    return s;
  }
  if (s.showStage === N) {
    const sc = scoreShow(s.crib, starter, true);
    s.lastReveal = { who: s.dealer, isCrib: true, hand: s.crib, score: sc };
    s.showStage = N + 1;
    if (addScore(s, s.dealer, sc.total, "crib")) return s;
    return s;
  }
  return s; // done — the caller starts a new round (dealer rotates)
}

/** True once the show is fully counted and the round can advance. */
export const roundComplete = (s: CribState): boolean =>
  s.phase === "show" && s.showStage >= s.players.length + 1;

/** Whose turn it is to lay away (eldest-first), so online play can serialise discards. */
export function discardTurn(s: CribState): number | null {
  if (s.phase !== "discard") return null;
  const N = s.players.length;
  for (let k = 1; k <= N; k++) {
    const i = (s.dealer + k) % N;
    if (!s.players[i].discarded) return i;
  }
  return null;
}
