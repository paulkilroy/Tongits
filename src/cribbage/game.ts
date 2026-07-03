import { type Card, cardPoints, cardLabel } from "../engine/cards";
import { shuffledDeck } from "../engine/deck";
import { scorePlay, scoreShow, type ShowScore } from "./scoring";

// Two-handed cribbage. A round runs: deal 6 → each discards 2 to the dealer's
// crib → cut a starter → THE PLAY (pegging to 31, repeatedly) → THE SHOW (pone
// counts first, then dealer, then the crib). First to `target` (121) wins.

export type CribPhase = "discard" | "play" | "show" | "gameOver";

export interface CribPlayer {
  name: string;
  isAI: boolean;
  hand: Card[]; // 6 after deal, 4 after discarding
  played: Card[]; // laid during the play (all 4 by the show)
  score: number;
  discarded: boolean; // has this player put 2 in the crib yet?
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
  deck: Card[]; // undealt remainder; deck[0] becomes the starter at the cut
  starter: Card | null;
  crib: Card[];
  current: number; // whose turn during the play
  seq: Card[]; // cards in the current pegging series (since the last 31/reset)
  total: number; // running total of `seq`
  passCount: number; // consecutive "go"s; two in a row ends the series
  lastPlayer: number | null; // who laid the last card (takes the go / last-card point)
  showStage: number; // 0 pone hand · 1 dealer hand · 2 crib · 3 done
  lastReveal: ShowReveal | null;
  log: string[];
  result: { winner: number } | null;
  rules: CribRules;
}

export const STANDARD_CRIB_RULES: CribRules = { target: 121 };

const clone = (s: CribState): CribState => structuredClone(s);
const other = (p: number): number => (p + 1) % 2;
export const pone = (s: CribState): number => other(s.dealer);
export const currentPlayer = (s: CribState): CribPlayer => s.players[s.current];

function note(s: CribState, msg: string): void {
  s.log = [...s.log, msg];
}

/** Deal a fresh round. Dealer alternates; pone (non-dealer) is dealt first. */
export function newRound(
  rules: CribRules,
  seed: number,
  names: string[],
  ai: boolean[],
  dealer = 0,
  scores: number[] = [0, 0],
): CribState {
  const deck = shuffledDeck(seed);
  const players: CribPlayer[] = names.map((name, i) => ({
    name,
    isAI: ai[i] ?? false,
    hand: [],
    played: [],
    score: scores[i] ?? 0,
    discarded: false,
  }));
  const p0 = other(dealer); // pone dealt first
  for (let i = 0; i < 12; i++) players[(p0 + i) % 2].hand.push(deck[i]);
  return {
    players,
    dealer,
    phase: "discard",
    deck: deck.slice(12),
    starter: null,
    crib: [],
    current: p0,
    seq: [],
    total: 0,
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

/** A player lays two cards into the dealer's crib. When both have, cut the starter. */
export function discardToCrib(state: CribState, player: number, cards: Card[]): CribState {
  if (state.phase !== "discard" || cards.length !== 2 || state.players[player].discarded) return state;
  const ids = new Set(cards.map((c) => `${c.rank}-${c.suit}`));
  const p = state.players[player];
  if (!p.hand.some((c) => ids.has(`${c.rank}-${c.suit}`))) return state;

  const s = clone(state);
  const me = s.players[player];
  me.hand = me.hand.filter((c) => !ids.has(`${c.rank}-${c.suit}`));
  me.discarded = true;
  s.crib.push(...cards);
  note(s, `${me.name} lays 2 in the crib.`);

  if (s.players.every((pl) => pl.discarded)) {
    // Cut the starter. A Jack turned is "his heels" — 2 for the dealer.
    const starter = s.deck[0];
    s.starter = starter;
    note(s, `Cut: ${cardLabel(starter)}.`);
    if (starter.rank === "J") addScore(s, s.dealer, 2, "his heels");
    s.phase = s.result ? "gameOver" : "play";
    s.current = pone(s);
  }
  return s;
}

/** Cards the player may legally lay right now (value keeps the total ≤ 31). */
export function legalPlays(state: CribState, player: number): Card[] {
  return state.players[player].hand.filter((c) => state.total + cardPoints(c) <= 31);
}

export const canPlay = (state: CribState, player: number): boolean => legalPlays(state, player).length > 0;

const bothEmpty = (s: CribState): boolean => s.players.every((p) => p.hand.length === 0);

function toShow(s: CribState): void {
  s.phase = "show";
  s.showStage = 0;
  s.seq = [];
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
  s.total += cardPoints(card);
  s.lastPlayer = P;
  s.passCount = 0;
  note(s, `${me.name} plays ${cardLabel(card)} (${s.total}).`);

  const pts = scorePlay(s.seq, s.total);
  if (pts && addScore(s, P, pts, "pegging")) return s;

  if (s.total === 31) {
    s.seq = [];
    s.total = 0;
    if (bothEmpty(s)) toShow(s);
    else s.current = other(P);
    return s;
  }
  if (bothEmpty(s)) {
    if (addScore(s, P, 1, "last card")) return s;
    toShow(s);
    return s;
  }
  s.current = other(P);
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
  if (s.passCount >= 2) {
    // Both stuck: last to lay a card takes 1 for the go, then the count resets.
    const last = s.lastPlayer ?? other(P);
    if (addScore(s, last, 1, "go")) return s;
    s.seq = [];
    s.total = 0;
    s.passCount = 0;
    if (bothEmpty(s)) toShow(s);
    else s.current = other(last);
    return s;
  }
  s.current = other(P);
  return s;
}

/** Count the next hand in the show (pone → dealer → crib), then start the next round. */
export function nextShow(state: CribState): CribState {
  if (state.phase !== "show" || !state.starter) return state;
  const s = clone(state);
  const starter = s.starter!;

  if (s.showStage === 0) {
    const who = pone(s);
    const hand = s.players[who].played;
    const sc = scoreShow(hand, starter, false);
    s.lastReveal = { who, isCrib: false, hand, score: sc };
    s.showStage = 1;
    if (addScore(s, who, sc.total, "hand")) return s;
    return s;
  }
  if (s.showStage === 1) {
    const who = s.dealer;
    const hand = s.players[who].played;
    const sc = scoreShow(hand, starter, false);
    s.lastReveal = { who, isCrib: false, hand, score: sc };
    s.showStage = 2;
    if (addScore(s, who, sc.total, "hand")) return s;
    return s;
  }
  if (s.showStage === 2) {
    const sc = scoreShow(s.crib, starter, true);
    s.lastReveal = { who: s.dealer, isCrib: true, hand: s.crib, score: sc };
    s.showStage = 3;
    if (addScore(s, s.dealer, sc.total, "crib")) return s;
    return s;
  }
  return s; // stage 3 — the caller starts a new round (dealer alternates)
}

/** True once the show is fully counted and the round can advance. */
export const roundComplete = (s: CribState): boolean => s.phase === "show" && s.showStage >= 3;
