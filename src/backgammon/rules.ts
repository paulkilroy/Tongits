// Standard backgammon geometry. Points are indices 0..23 holding a SIGNED count:
// positive = player 0's checkers, negative = player 1's.
//
// Player 0 moves toward index 0 and bears off past index −1; home board = 0..5.
// Player 1 moves toward index 23 and bears off past index 24; home board = 18..23.
// Each side has 15 checkers. This module holds only pure geometry helpers so the
// engine and AI can share one source of truth for direction/home/entry/bear-off.

export const POINTS = 24;
export const CHECKERS = 15;

export interface Board {
  points: number[]; // length 24, signed
  bar: [number, number]; // checkers on the bar per player
  off: [number, number]; // checkers borne off per player
}

/** The standard opening position. */
export function startBoard(): Board {
  const points = new Array(POINTS).fill(0);
  // Player 0 (moving high→low): 24-pt(2), 13-pt(5), 8-pt(3), 6-pt(5).
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  // Player 1 mirrors (index i ↔ 23−i).
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return { points, bar: [0, 0], off: [0, 0] };
}

export const dir = (player: number): number => (player === 0 ? -1 : 1);

/** Count of `player`'s checkers on a point (0 if the point is empty/opponent's). */
export function mine(points: number[], player: number, i: number): number {
  const v = points[i];
  return player === 0 ? Math.max(v, 0) : Math.max(-v, 0);
}
export function opp(points: number[], player: number, i: number): number {
  const v = points[i];
  return player === 0 ? Math.max(-v, 0) : Math.max(v, 0);
}

/** Where a checker entering from the bar with die `d` lands, in board index space. */
export const barEntry = (player: number, d: number): number => (player === 0 ? POINTS - d : d - 1);

/** Home-board membership + pip distance (to the edge) for bearing off. */
export const inHome = (player: number, i: number): boolean => (player === 0 ? i <= 5 : i >= 18);
export const bearPip = (player: number, i: number): number => (player === 0 ? i + 1 : POINTS - i);

/** All of a player's checkers are in the home board (and none on the bar). */
export function allHome(b: Board, player: number): boolean {
  if (b.bar[player] > 0) return false;
  for (let i = 0; i < POINTS; i++) {
    if (mine(b.points, player, i) > 0 && !inHome(player, i)) return false;
  }
  return true;
}

/** Total pip count (distance to bear all checkers off) for a player. */
export function pipCount(b: Board, player: number): number {
  let pips = b.bar[player] * (player === 0 ? 25 : 25);
  for (let i = 0; i < POINTS; i++) {
    const n = mine(b.points, player, i);
    if (n) pips += n * bearPip(player, i);
  }
  return pips;
}
