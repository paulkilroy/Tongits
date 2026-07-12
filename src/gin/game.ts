import { type Card, cardId, cardPoints, rankOrder } from "../engine/cards";
import { shuffledDeck } from "../engine/deck";
import { bestMelds, deadwood } from "../engine/meldFinder";

// Seven-card Gin Rummy (2 players). Deal 7 each; draw (stock or discard) then
// discard; knock when your deadwood is ≤ 5 (or 0 for gin). The opponent lays off
// onto the knocker's melds (unless it's gin). Knocker scores the deadwood
// difference; gin = +25; an undercut = the defender scores the difference + 25.
// First to 100 wins. Reuses the shared optimal meld-finder (ace low, sets/runs 3+).

export const KNOCK_MAX = 5;
export const GIN_BONUS = 25;
export const UNDERCUT_BONUS = 25;
export const TARGET = 100;
export const HAND = 7;

export type GinPhase = "draw" | "discard" | "roundEnd" | "gameOver";

export interface GinPlayer {
  name: string;
  isAI: boolean;
  hand: Card[];
  score: number;
}

export interface RoundResult {
  knocker: number;
  gin: boolean;
  undercut: boolean;
  scorer: number;
  points: number;
  knockerMelds: Card[][]; // knocker's melds, with the defender's lay-offs appended
  knockerDeadwood: Card[];
  defenderMelds: Card[][];
  defenderDeadwood: Card[]; // what's left after laying off onto the knocker
}

export interface GinState {
  players: GinPlayer[];
  dealer: number;
  deck: Card[];
  discard: Card[];
  current: number;
  phase: GinPhase;
  drewFrom: "deck" | "discard" | null;
  drawnId: string | null; // the card just drawn (highlighted until you discard)
  round: RoundResult | null;
  result: { winner: number } | null;
  log: string[];
  seedCtr: number;
  handNo: number; // increments each deal — lets the UI scope its per-hand review
}

const clone = (s: GinState): GinState => structuredClone(s);
const note = (s: GinState, m: string): void => {
  s.log = [...s.log, m];
};

const meldCards = (hand: Card[]): Card[][] => bestMelds(hand).map((m) => [...m.cards]);
export const deadwoodPts = (hand: Card[]): number => deadwood(hand).reduce((a, c) => a + cardPoints(c), 0);

function deal(s: GinState): void {
  const shoe = shuffledDeck((s.seedCtr = (s.seedCtr + 0x9e3779b1) | 0));
  const p0 = (s.dealer + 1) % 2; // non-dealer dealt first
  let k = 0;
  s.players.forEach((p) => (p.hand = []));
  for (let i = 0; i < HAND * 2; i++) s.players[(p0 + i) % 2].hand.push(shoe[k++]);
  s.discard = [shoe[k++]];
  s.deck = shoe.slice(k);
  s.current = p0;
  s.phase = "draw";
  s.drewFrom = null;
  s.drawnId = null;
  s.round = null;
  s.handNo = (s.handNo ?? 0) + 1;
  note(s, `${s.players[s.dealer].name} deals. ${s.players[p0].name} to draw.`);
}

export function newGame(names: string[], ai: boolean[]): GinState {
  const s: GinState = {
    players: names.map((name, i) => ({ name, isAI: ai[i] ?? false, hand: [], score: 0 })),
    dealer: 0,
    deck: [],
    discard: [],
    current: 0,
    phase: "draw",
    drewFrom: null,
    drawnId: null,
    round: null,
    result: null,
    log: [],
    seedCtr: Math.floor(Math.random() * 2 ** 31), // random so every game deals differently
    handNo: 0,
  };
  deal(s);
  return s;
}

export function draw(state: GinState, source: "deck" | "discard"): GinState {
  if (state.phase !== "draw") return state;
  const s = clone(state);
  const p = s.players[s.current];
  let drawn;
  if (source === "discard") {
    if (!s.discard.length) return state;
    drawn = s.discard.pop()!;
    s.drewFrom = "discard";
  } else {
    if (s.deck.length <= 2) {
      // Stock exhausted → the hand is a wash; redeal with the same dealer.
      note(s, "Stock ran out — no score. Redeal.");
      deal(s);
      return s;
    }
    drawn = s.deck.shift()!;
    s.drewFrom = "deck";
  }
  p.hand.push(drawn);
  s.drawnId = cardId(drawn);
  s.phase = "discard";
  return s;
}

/** Discard and pass the turn (no knock). */
export function discard(state: GinState, cardId_: string): GinState {
  if (state.phase !== "discard") return state;
  const s = clone(state);
  const p = s.players[s.current];
  const idx = p.hand.findIndex((c) => cardId(c) === cardId_);
  if (idx < 0) return state;
  s.discard.push(p.hand.splice(idx, 1)[0]);
  note(s, `${p.name} discards.`);
  s.current = (s.current + 1) % 2;
  s.phase = "draw";
  s.drewFrom = null;
  s.drawnId = null;
  return s;
}

/** Can the current player knock by discarding this card? (deadwood ≤ 5 after). */
export function canKnock(state: GinState, cardId_: string): boolean {
  if (state.phase !== "discard") return false;
  const hand = state.players[state.current].hand.filter((c) => cardId(c) !== cardId_);
  return hand.length === HAND && deadwoodPts(hand) <= KNOCK_MAX;
}

const isSet = (meld: Card[]): boolean => meld.every((c) => c.rank === meld[0].rank);
function canExtend(meld: Card[], c: Card): boolean {
  if (isSet(meld)) return meld.length < 4 && c.rank === meld[0].rank;
  if (c.suit !== meld[0].suit) return false;
  const ords = meld.map((m) => rankOrder(m.rank));
  const co = rankOrder(c.rank);
  return co === Math.min(...ords) - 1 || co === Math.max(...ords) + 1;
}

/** Knock (or go gin): discard `cardId_`, resolve lay-offs and scoring. */
export function knock(state: GinState, cardId_: string): GinState {
  if (!canKnock(state, cardId_)) return state;
  const s = clone(state);
  const K = s.current;
  const D = (K + 1) % 2;
  const p = s.players[K];
  s.discard.push(p.hand.splice(p.hand.findIndex((c) => cardId(c) === cardId_), 1)[0]);

  const kMelds = meldCards(p.hand);
  const kDead = deadwood(p.hand);
  const kDeadPts = kDead.reduce((a, c) => a + cardPoints(c), 0);
  const gin = kDeadPts === 0;

  // Defender melds; then (unless gin) lays off remaining deadwood onto the knocker's melds.
  const dMelds = meldCards(s.players[D].hand);
  let dDead = deadwood(s.players[D].hand);
  const layoffMelds = kMelds.map((m) => [...m]);
  if (!gin) {
    const remaining: Card[] = [];
    for (const c of dDead) {
      const t = layoffMelds.find((m) => canExtend(m, c));
      if (t) t.push(c);
      else remaining.push(c);
    }
    dDead = remaining;
  }
  const dDeadPts = dDead.reduce((a, c) => a + cardPoints(c), 0);

  let scorer: number, points: number, undercut = false;
  if (gin) {
    scorer = K;
    points = dDeadPts + GIN_BONUS;
  } else if (dDeadPts <= kDeadPts) {
    scorer = D; // undercut
    points = kDeadPts - dDeadPts + UNDERCUT_BONUS;
    undercut = true;
  } else {
    scorer = K;
    points = dDeadPts - kDeadPts;
  }
  s.players[scorer].score += points;
  s.round = {
    knocker: K,
    gin,
    undercut,
    scorer,
    points,
    knockerMelds: layoffMelds,
    knockerDeadwood: kDead,
    defenderMelds: dMelds,
    defenderDeadwood: dDead,
  };
  note(s, `${p.name} ${gin ? "goes GIN" : "knocks"}. ${s.players[scorer].name} +${points}.`);

  if (s.players[scorer].score >= TARGET) {
    s.result = { winner: scorer };
    s.phase = "gameOver";
    note(s, `${s.players[scorer].name} wins the game!`);
  } else {
    s.phase = "roundEnd";
  }
  return s;
}

export function nextRound(state: GinState): GinState {
  if (state.phase !== "roundEnd") return state;
  const s = clone(state);
  s.dealer = (s.dealer + 1) % 2;
  deal(s);
  return s;
}

export const currentPlayer = (s: GinState) => s.players[s.current];
