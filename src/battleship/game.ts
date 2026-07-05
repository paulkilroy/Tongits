import { BOARD, CELLS, FLEET, cellsFor, type Orient } from "./rules";

// 2-player Battleship. Both players place their fleet (the "place" phase), then
// take turns firing one shot at a time until one fleet is wholly sunk. The room
// holds both boards; each client only reveals its own ships (friendly model).

export type BattlePhase = "place" | "play" | "gameOver";

export interface Ship {
  key: string;
  size: number;
  cells: number[]; // board indices, in order
}

export interface BattlePlayer {
  name: string;
  isAI: boolean;
  ships: Ship[]; // placed fleet (up to FLEET.length)
  ready: boolean; // placement confirmed
  shots: number[]; // cells this player has fired at the opponent
}

export interface BattleState {
  players: BattlePlayer[]; // exactly 2
  phase: BattlePhase;
  current: number; // whose turn to fire
  log: string[];
  result: { winner: number } | null;
}

const clone = (s: BattleState): BattleState => structuredClone(s);
const other = (p: number): number => (p + 1) % 2;
const note = (s: BattleState, m: string): void => {
  s.log = [...s.log, m];
};

export function newGame(names: string[], ai: boolean[]): BattleState {
  return {
    players: names.map((name, i) => ({
      name,
      isAI: ai[i] ?? false,
      ships: [],
      ready: false,
      shots: [],
    })),
    phase: "place",
    current: 0,
    log: ["Place your fleet."],
    result: null,
  };
}

const occupied = (ships: Ship[], exceptKey?: string): Set<number> => {
  const s = new Set<number>();
  for (const sh of ships) if (sh.key !== exceptKey) for (const c of sh.cells) s.add(c);
  return s;
};

export const allPlaced = (p: BattlePlayer): boolean => p.ships.length === FLEET.length;

/** Place (or move) one fleet ship. No-op if off-board or overlapping. */
export function placeShip(
  state: BattleState,
  player: number,
  key: string,
  start: number,
  orient: Orient,
): BattleState {
  if (state.phase !== "place" || state.players[player].ready) return state;
  const type = FLEET.find((f) => f.key === key);
  if (!type) return state;
  const cells = cellsFor(start, type.size, orient);
  if (!cells) return state;
  const taken = occupied(state.players[player].ships, key);
  if (cells.some((c) => taken.has(c))) return state;

  const s = clone(state);
  const ships = s.players[player].ships.filter((sh) => sh.key !== key);
  ships.push({ key, size: type.size, cells });
  s.players[player].ships = ships;
  return s;
}

/** Randomly place the whole fleet for a player (used by "shuffle" and the AI). */
export function autoPlace(state: BattleState, player: number, rng: () => number = Math.random): BattleState {
  if (state.phase !== "place" || state.players[player].ready) return state;
  const s = clone(state);
  const ships: Ship[] = [];
  for (const type of FLEET) {
    let placed = false;
    for (let tries = 0; tries < 500 && !placed; tries++) {
      const orient: Orient = rng() < 0.5 ? "h" : "v";
      const start = Math.floor(rng() * CELLS);
      const cells = cellsFor(start, type.size, orient);
      if (!cells) continue;
      const taken = occupied(ships);
      if (cells.some((c) => taken.has(c))) continue;
      ships.push({ key: type.key, size: type.size, cells });
      placed = true;
    }
  }
  s.players[player].ships = ships;
  return s;
}

/** Confirm a player's placement. When both are ready, the play begins. */
export function setReady(state: BattleState, player: number): BattleState {
  if (state.phase !== "place" || !allPlaced(state.players[player]) || state.players[player].ready) return state;
  const s = clone(state);
  s.players[player].ready = true;
  note(s, `${s.players[player].name} is ready.`);
  if (s.players.every((p) => p.ready)) {
    s.phase = "play";
    s.current = 0;
    note(s, `Battle! ${s.players[0].name} fires first.`);
  }
  return s;
}

const shipAt = (p: BattlePlayer, cell: number): Ship | undefined => p.ships.find((s) => s.cells.includes(cell));
export const isSunk = (ship: Ship, attackerShots: number[]): boolean => ship.cells.every((c) => attackerShots.includes(c));
export const fleetSunk = (defender: BattlePlayer, attackerShots: number[]): boolean =>
  defender.ships.length > 0 && defender.ships.every((s) => isSunk(s, attackerShots));

export interface ShotOutcome {
  hit: boolean;
  sunk: Ship | null;
}

/** Resolve (without mutating) what firing at `cell` would do — for the UI/AI. */
export function shotOutcome(state: BattleState, shooter: number, cell: number): ShotOutcome {
  const def = state.players[other(shooter)];
  const ship = shipAt(def, cell);
  if (!ship) return { hit: false, sunk: null };
  const after = [...state.players[shooter].shots, cell];
  return { hit: true, sunk: isSunk(ship, after) ? ship : null };
}

/** Fire one shot. Turn alternates each shot (classic rules). */
export function fire(state: BattleState, shooter: number, cell: number): BattleState {
  if (state.phase !== "play" || state.current !== shooter || state.result) return state;
  if (cell < 0 || cell >= CELLS || state.players[shooter].shots.includes(cell)) return state;

  const s = clone(state);
  const me = s.players[shooter];
  const def = s.players[other(shooter)];
  me.shots.push(cell);
  const ship = shipAt(def, cell);
  if (ship) {
    const sunk = isSunk(ship, me.shots);
    note(s, `${me.name} fires ${coord(cell)} — hit${sunk ? ` & sank the ${shipName(ship)}!` : "!"}`);
    if (fleetSunk(def, me.shots)) {
      s.result = { winner: shooter };
      s.phase = "gameOver";
      note(s, `${me.name} wins — fleet destroyed!`);
      return s;
    }
  } else {
    note(s, `${me.name} fires ${coord(cell)} — miss.`);
  }
  s.current = other(shooter);
  return s;
}

const shipName = (ship: Ship): string => FLEET.find((f) => f.key === ship.key)?.name ?? ship.key;

/** Human-readable cell like "B7" (column letter, 1-based row). */
export function coord(cell: number): string {
  const r = Math.floor(cell / BOARD);
  const c = cell % BOARD;
  return `${String.fromCharCode(65 + c)}${r + 1}`;
}
