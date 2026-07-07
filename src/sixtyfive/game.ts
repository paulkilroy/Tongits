import { type Rank } from "../engine/cards";
import {
  type RCard,
  buildShoe,
  deckCount,
  wildRankFor,
  pointOf,
  FIRST_HAND,
  LAST_HAND,
} from "./rules";
import { analyze, layOffTarget, type Analysis } from "./meld";

// "65" match engine: progressive rummy over hands of 3…13 cards. Each hand: draw
// (from the discard or the stock) then discard; when your hand is all melds you
// declare "Pay Me!"; everyone else gets one last turn; then hands are revealed,
// leftover cards laid off onto anyone's melds, and the rest counted. Lowest total
// after the 13-card hand wins.

export type SFPhase = "draw" | "discard" | "roundEnd" | "gameOver";

export interface SFPlayer {
  name: string;
  isAI: boolean;
  hand: RCard[];
  total: number; // cumulative penalty across hands
}

export interface Reveal {
  melds: RCard[][];
  deadwood: RCard[];
  points: number;
}

export interface SFState {
  players: SFPlayer[];
  handSize: number;
  wildRank: Rank | null;
  dealer: number;
  deck: RCard[];
  discard: RCard[];
  current: number;
  phase: SFPhase;
  drewFrom: "deck" | "discard" | null; // this turn's draw source (null = not yet)
  drawnId: string | null; // the card just drawn (highlighted until you discard)
  paidBy: number | null;
  finalTurnsLeft: number;
  reveals: Reveal[] | null;
  result: { winner: number } | null;
  log: string[];
  seedCtr: number; // advanced each deal so rounds differ deterministically
  turns: number; // turns taken this hand (safety cap alongside stock depletion)
}

const clone = (s: SFState): SFState => structuredClone(s);
const note = (s: SFState, m: string): void => {
  s.log = [...s.log, m];
};

/** Current player's best partition — drives the on-screen analyzer + Pay Me. */
export const handAnalysis = (s: SFState, player: number): Analysis =>
  analyze(s.players[player].hand, s.wildRank);

function dealRound(s: SFState): void {
  const N = s.players.length;
  const shoe = buildShoe(deckCount(N), (s.seedCtr = (s.seedCtr + 0x9e3779b1) | 0));
  let k = 0;
  s.players.forEach((p) => (p.hand = []));
  for (let c = 0; c < s.handSize; c++) for (let p = 0; p < N; p++) s.players[(s.dealer + 1 + p) % N].hand.push(shoe[k++]);
  s.discard = [shoe[k++]];
  s.deck = shoe.slice(k);
  s.wildRank = wildRankFor(s.handSize);
  s.current = (s.dealer + 1) % N;
  s.phase = "draw";
  s.drewFrom = null;
  s.drawnId = null;
  s.paidBy = null;
  s.finalTurnsLeft = 0;
  s.reveals = null;
  s.turns = 0;
  note(s, `Hand of ${s.handSize} — ${wildLabel(s)} wild. ${s.players[s.current].name} to draw.`);
}

const wildLabel = (s: SFState): string => (s.wildRank ? `Joker + ${s.wildRank}s` : "Joker");

export function newGame(names: string[], ai: boolean[]): SFState {
  const s: SFState = {
    players: names.map((name, i) => ({ name, isAI: ai[i] ?? false, hand: [], total: 0 })),
    handSize: FIRST_HAND,
    wildRank: null,
    dealer: 0,
    deck: [],
    discard: [],
    current: 0,
    phase: "draw",
    drewFrom: null,
    drawnId: null,
    paidBy: null,
    finalTurnsLeft: 0,
    reveals: null,
    result: null,
    log: [],
    seedCtr: 1234567,
    turns: 0,
  };
  dealRound(s);
  return s;
}

/** Draw the top of the stock or the discard pile. */
export function draw(state: SFState, source: "deck" | "discard"): SFState {
  if (state.phase !== "draw") return state;
  const s = clone(state);
  const p = s.players[s.current];
  let drawn;
  if (source === "discard") {
    if (!s.discard.length) return state;
    drawn = s.discard.pop()!;
    s.drewFrom = "discard";
  } else {
    if (!s.deck.length) return state; // stock empty — the hand will end (see beginTurn)
    drawn = s.deck.shift()!;
    s.drewFrom = "deck";
  }
  p.hand.push(drawn);
  s.drawnId = drawn.id;
  s.phase = "discard";
  return s;
}

// A hand ends when the stock is exhausted or play drags on too long — not only on
// a "Pay Me". Otherwise a table where nobody can go out would never finish.
const TURN_CAP = (s: SFState) => s.players.length * 60;

function beginTurn(s: SFState): void {
  if (s.deck.length === 0 || s.turns > TURN_CAP(s)) {
    endRound(s);
    return;
  }
  s.phase = "draw";
  s.drewFrom = null;
  s.drawnId = null;
}

function advance(s: SFState): void {
  s.turns += 1;
  if (s.paidBy != null) {
    s.finalTurnsLeft -= 1;
    if (s.finalTurnsLeft <= 0) {
      endRound(s);
      return;
    }
  }
  s.current = (s.current + 1) % s.players.length;
  beginTurn(s);
}

/** Discard a card by id and pass the turn. */
export function discard(state: SFState, cardId: string): SFState {
  if (state.phase !== "discard") return state;
  const s = clone(state);
  const p = s.players[s.current];
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return state;
  s.discard.push(p.hand.splice(idx, 1)[0]);
  note(s, `${p.name} discards.`);
  advance(s);
  return s;
}

/** Whether the current player may declare Pay Me after discarding `cardId`. */
export function canPayMe(state: SFState, cardId: string): boolean {
  if (state.phase !== "discard") return false;
  const hand = state.players[state.current].hand.filter((c) => c.id !== cardId);
  return analyze(hand, state.wildRank).points === 0 && hand.length === state.handSize;
}

/** Declare "Pay Me!": discard the last card, go out clean, give everyone one final turn. */
export function payMe(state: SFState, cardId: string): SFState {
  if (!canPayMe(state, cardId)) return state;
  const s = clone(state);
  const p = s.players[s.current];
  const idx = p.hand.findIndex((c) => c.id === cardId);
  s.discard.push(p.hand.splice(idx, 1)[0]);
  s.paidBy = s.current;
  s.finalTurnsLeft = s.players.length - 1;
  note(s, `${p.name} says “Pay Me!” — everyone gets one last turn.`);
  if (s.finalTurnsLeft <= 0) endRound(s);
  else {
    s.current = (s.current + 1) % s.players.length;
    beginTurn(s);
  }
  return s;
}

function endRound(s: SFState): void {
  // Everyone melds their best; then lay off leftover cards onto ANY meld.
  const reveals: Reveal[] = s.players.map((p) => {
    const a = analyze(p.hand, s.wildRank);
    return { melds: a.melds.map((m) => [...m]), deadwood: [...a.deadwood], points: a.points };
  });
  const allMelds = reveals.flatMap((r) => r.melds);
  for (const r of reveals) {
    const kept: RCard[] = [];
    for (const c of r.deadwood) {
      const t = layOffTarget(c, allMelds, s.wildRank);
      if (t >= 0) allMelds[t].push(c);
      else kept.push(c);
    }
    r.deadwood = kept;
    r.points = kept.reduce((sum, c) => sum + pointOf(c, s.wildRank), 0);
  }
  reveals.forEach((r, i) => (s.players[i].total += r.points));
  s.reveals = reveals;
  s.phase = "roundEnd";
  note(s, `Hand over. ${reveals.map((r, i) => `${s.players[i].name} +${r.points}`).join(", ")}.`);
}

/** Advance to the next hand (or end the game after the 13-card hand). */
export function nextRound(state: SFState): SFState {
  if (state.phase !== "roundEnd") return state;
  const s = clone(state);
  if (s.handSize >= LAST_HAND) {
    let winner = 0;
    s.players.forEach((p, i) => {
      if (p.total < s.players[winner].total) winner = i;
    });
    s.result = { winner };
    s.phase = "gameOver";
    note(s, `Game over — ${s.players[winner].name} wins with ${s.players[winner].total}!`);
    return s;
  }
  s.handSize += 1;
  s.dealer = (s.dealer + 1) % s.players.length;
  dealRound(s);
  return s;
}

export const currentPlayer = (s: SFState) => s.players[s.current];
