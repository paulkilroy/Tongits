import {
  type Board,
  POINTS,
  CHECKERS,
  startBoard,
  dir,
  mine,
  opp,
  barEntry,
  allHome,
  bearPip,
} from "./rules";

// Backgammon engine (2 players, no doubling cube). A turn: roll → make all
// forced/available moves → pass. Move legality enforces the standard rules:
// enter from the bar first, don't land on a point with ≥2 enemy checkers, bear
// off only when all home (with the higher-die overflow rule), and you must play
// as many dice as possible (so a single playable die must be the larger one).

export type BgPhase = "roll" | "move" | "gameOver";

export interface Move {
  from: number | "bar";
  die: number;
  to: number | "off";
}

export interface BgState {
  board: Board;
  players: { name: string; isAI: boolean }[];
  current: number;
  dice: number[]; // dice still to be played this turn
  phase: BgPhase;
  result: { winner: number } | null;
  log: string[];
}

const cloneBoard = (b: Board): Board => ({ points: [...b.points], bar: [...b.bar] as [number, number], off: [...b.off] as [number, number] });
const note = (s: BgState, m: string): void => {
  s.log = [...s.log, m];
};
const removeOne = (arr: number[], v: number): number[] => {
  const i = arr.indexOf(v);
  return i < 0 ? arr : [...arr.slice(0, i), ...arr.slice(i + 1)];
};

/** Is checker at home index `i` the farthest from the edge (for higher-die bear-off)? */
function isFarthest(b: Board, player: number, i: number): boolean {
  if (player === 0) {
    for (let j = i + 1; j < POINTS; j++) if (mine(b.points, player, j) > 0) return false;
  } else {
    for (let j = i - 1; j >= 0; j--) if (mine(b.points, player, j) > 0) return false;
  }
  return true;
}

/** Every single-die move legal right now (bar entry takes priority). */
export function singleMoves(b: Board, player: number, dice: number[]): Move[] {
  const ds = [...new Set(dice)];
  const moves: Move[] = [];
  if (b.bar[player] > 0) {
    for (const d of ds) {
      const to = barEntry(player, d);
      if (opp(b.points, player, to) < 2) moves.push({ from: "bar", die: d, to });
    }
    return moves;
  }
  for (let i = 0; i < POINTS; i++) {
    if (mine(b.points, player, i) <= 0) continue;
    for (const d of ds) {
      const dest = i + dir(player) * d;
      if (dest >= 0 && dest < POINTS) {
        if (opp(b.points, player, dest) < 2) moves.push({ from: i, die: d, to: dest });
      } else if (allHome(b, player)) {
        const pip = bearPip(player, i);
        if (d === pip || (d > pip && isFarthest(b, player, i))) moves.push({ from: i, die: d, to: "off" });
      }
    }
  }
  return moves;
}

/** Apply one move to a board (assumes it is legal), returning a new board. */
export function applyBoardMove(b: Board, player: number, m: Move): Board {
  const nb = cloneBoard(b);
  const sign = player === 0 ? 1 : -1;
  if (m.from === "bar") nb.bar[player]--;
  else nb.points[m.from] -= sign;
  if (m.to === "off") {
    nb.off[player]++;
  } else {
    if (opp(nb.points, player, m.to) === 1) {
      nb.points[m.to] = 0;
      nb.bar[1 - player]++;
    }
    nb.points[m.to] += sign;
  }
  return nb;
}

/** Max number of dice playable from here — drives the "use as many as possible" rule. */
export function maxPlies(b: Board, player: number, dice: number[]): number {
  if (!dice.length) return 0;
  const moves = singleMoves(b, player, dice);
  if (!moves.length) return 0;
  let best = 0;
  for (const m of moves) {
    const plies = 1 + maxPlies(applyBoardMove(b, player, m), player, removeOne(dice, m.die));
    if (plies > best) best = plies;
    if (best === dice.length) break;
  }
  return best;
}

/** The moves a player may actually make now: legal AND keeping max dice usage. */
export function legalMoves(state: BgState): Move[] {
  if (state.phase !== "move") return [];
  const { board: b, current: p, dice } = state;
  const maxP = maxPlies(b, p, dice);
  if (maxP === 0) return [];
  return singleMoves(b, p, dice).filter(
    (m) => 1 + maxPlies(applyBoardMove(b, p, m), p, removeOne(dice, m.die)) === maxP,
  );
}

export function newGame(names: string[], ai: boolean[]): BgState {
  return {
    board: startBoard(),
    players: names.map((name, i) => ({ name, isAI: ai[i] ?? false })),
    current: 0,
    dice: [],
    phase: "roll",
    result: null,
    log: [`${names[0]} to roll.`],
  };
}

function endTurn(s: BgState): void {
  s.current = 1 - s.current;
  s.dice = [];
  s.phase = "roll";
  note(s, `${s.players[s.current].name} to roll.`);
}

/** Roll the dice to open a turn. Passes automatically if nothing is playable. */
export function roll(state: BgState, rng: () => number = Math.random): BgState {
  if (state.phase !== "roll" || state.result) return state;
  const s = { ...state, board: cloneBoard(state.board), log: state.log };
  const d1 = 1 + Math.floor(rng() * 6);
  const d2 = 1 + Math.floor(rng() * 6);
  s.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  s.phase = "move";
  note(s, `${s.players[s.current].name} rolls ${d1}-${d2}.`);
  if (maxPlies(s.board, s.current, s.dice) === 0) {
    note(s, `No legal moves — ${s.players[s.current].name} passes.`);
    endTurn(s);
  }
  return s;
}

/** Make the move `from`→using `die` (must be one of legalMoves). */
export function applyMove(state: BgState, from: number | "bar", die: number): BgState {
  if (state.phase !== "move" || state.result) return state;
  const legal = legalMoves(state).find((m) => m.from === from && m.die === die);
  if (!legal) return state;
  const s: BgState = { ...state, board: applyBoardMove(state.board, state.current, legal), dice: removeOne(state.dice, die), log: state.log };
  const to = legal.to === "off" ? "off" : `point ${(legal.to as number) + 1}`;
  note(s, `${s.players[s.current].name} moves ${from === "bar" ? "bar" : `point ${from + 1}`} → ${to}.`);

  if (s.board.off[state.current] >= CHECKERS) {
    s.result = { winner: state.current };
    s.phase = "gameOver";
    note(s, `${s.players[state.current].name} wins!`);
    return s;
  }
  if (s.dice.length === 0 || maxPlies(s.board, s.current, s.dice) === 0) endTurn(s);
  return s;
}

export const currentPlayer = (s: BgState) => s.players[s.current];
