import { type FarkleRules } from "./rules";
import { scoreDice, hasScore, isLegalKeep } from "./scoring";

// Press Your Luck turn: roll the open dice → set aside at least one scoring die
// (banking those points) → then roll again (press your luck) or bank the turn.
// A roll with no scoring die is a FARKLE: you lose the turn's points. Setting
// aside all six dice is HOT DICE: roll all six again and keep going.

export type FarklePhase = "roll" | "pick" | "farkle" | "gameOver";

/** One set-aside within a turn (its points, and whether it triggered hot dice). */
export interface TurnChunk {
  gain: number;
  hot: boolean;
}

/** A finished turn's summary, shown on the scoreboard. */
export interface LastTurn {
  chunks: TurnChunk[];
  farkled: boolean;
  banked: number; // 0 if farkled
}

export interface FarklePlayer {
  name: string;
  isAI: boolean;
  score: number;
  onBoard: boolean;
  farkleStreak: number;
  last: LastTurn | null;
  hots: number; // cumulative hot-dice this game (good luck)
  farkles: number; // cumulative farkles this game (bad luck)
}

export interface FarkleState {
  players: FarklePlayer[];
  current: number;
  dice: number[]; // the dice just rolled, still on the table (choose from these)
  kept: number[]; // dice set aside so far this turn (display)
  turnScore: number;
  turnEvents: TurnChunk[]; // set-asides so far this turn
  diceLeft: number; // how many dice the next roll uses
  phase: FarklePhase;
  lastFarkle: boolean; // the previous roll farkled
  hotDice: boolean; // the last set-aside cleared all six
  rules: FarkleRules;
  result: { winner: number } | null;
  log: string[];
}

export const currentPlayer = (s: FarkleState): FarklePlayer => s.players[s.current];
const note = (s: FarkleState, m: string): void => {
  s.log = [...s.log, m];
};
const clone = (s: FarkleState): FarkleState => structuredClone(s);

export function newGame(rules: FarkleRules, names: string[], ai: boolean[]): FarkleState {
  return {
    players: names.map((name, i) => ({
      name,
      isAI: ai[i] ?? false,
      score: 0,
      onBoard: false,
      farkleStreak: 0,
      last: null,
      hots: 0,
      farkles: 0,
    })),
    current: 0,
    dice: [],
    kept: [],
    turnScore: 0,
    turnEvents: [],
    diceLeft: 6,
    phase: "roll",
    lastFarkle: false,
    hotDice: false,
    rules,
    result: null,
    log: [`${names[0]}'s turn.`],
  };
}

function startTurn(s: FarkleState): void {
  s.turnScore = 0;
  s.turnEvents = [];
  s.dice = [];
  s.kept = [];
  s.diceLeft = 6;
  s.hotDice = false;
  s.phase = "roll";
  note(s, `${currentPlayer(s).name}'s turn.`);
}

function advance(s: FarkleState): void {
  s.current = (s.current + 1) % s.players.length;
  startTurn(s);
}

/** Roll the open dice. Farkle ⇒ lose the turn; otherwise pick scoring dice. */
export function roll(state: FarkleState, rng: () => number = Math.random): FarkleState {
  if (state.phase !== "roll") return state;
  const s = clone(state);
  const dice = Array.from({ length: s.diceLeft }, () => 1 + Math.floor(rng() * 6));
  s.dice = dice;
  s.hotDice = false;
  note(s, `${currentPlayer(s).name} rolls ${dice.join(" ")}.`);

  if (!hasScore(dice, s.rules)) {
    // Farkle — hold on the reveal so the dice stay visible; nextTurn resolves it.
    note(s, `Farkle! ${currentPlayer(s).name} loses ${s.turnScore}.`);
    s.lastFarkle = true;
    s.phase = "farkle";
    return s;
  }
  s.lastFarkle = false;
  s.phase = "pick";
  return s;
}

/** Resolve a farkle reveal: apply any streak penalty and pass the dice. */
export function nextTurn(state: FarkleState): FarkleState {
  if (state.phase !== "farkle") return state;
  const s = clone(state);
  const p = currentPlayer(s);
  p.last = { chunks: s.turnEvents, farkled: true, banked: 0 };
  p.farkles += 1;
  p.farkleStreak += 1;
  if (s.rules.farkleStreakPenalty && p.farkleStreak >= s.rules.farkleStreakLen) {
    p.score = Math.max(0, p.score - s.rules.farkleStreakPenalty);
    p.farkleStreak = 0;
    note(s, `${p.name} −${s.rules.farkleStreakPenalty} (${s.rules.farkleStreakLen} farkles in a row).`);
  }
  advance(s);
  return s;
}

/** Set aside a scoring selection from the current roll (banks its points). */
export function setAside(state: FarkleState, keep: number[]): FarkleState {
  if (state.phase !== "pick" || !isLegalKeep(state.dice, keep, state.rules)) return state;
  const s = clone(state);
  const gained = scoreDice(keep, s.rules).score;
  s.turnScore += gained;

  const remaining = [...s.dice];
  for (const d of keep) remaining.splice(remaining.indexOf(d), 1);
  s.kept = [...s.kept, ...keep];
  s.dice = [];
  const hot = remaining.length === 0;
  s.turnEvents = [...s.turnEvents, { gain: gained, hot }];
  if (hot) currentPlayer(s).hots += 1;

  if (remaining.length === 0) {
    // Hot dice — roll all six again.
    s.diceLeft = 6;
    s.kept = [];
    s.hotDice = true;
  } else {
    s.diceLeft = remaining.length;
  }
  s.phase = "roll";
  return s;
}

/** Whether the current player may bank right now. */
export function canBank(s: FarkleState): boolean {
  if (s.phase !== "roll" || s.turnScore <= 0) return false;
  const p = currentPlayer(s);
  return p.onBoard || s.turnScore >= s.rules.onBoardMin;
}

/** Bank the turn's points and pass the dice. */
export function bank(state: FarkleState): FarkleState {
  if (!canBank(state)) return state;
  const s = clone(state);
  const p = currentPlayer(s);
  p.score += s.turnScore;
  p.onBoard = true;
  p.farkleStreak = 0;
  p.last = { chunks: s.turnEvents, farkled: false, banked: s.turnScore };
  note(s, `${p.name} banks ${s.turnScore} (total ${p.score}).`);
  if (p.score >= s.rules.target) {
    s.result = { winner: s.current };
    s.phase = "gameOver";
    note(s, `${p.name} wins!`);
    return s;
  }
  advance(s);
  return s;
}
