// Classic Battleship: a 10×10 grid and the standard five-ship fleet.

export const BOARD = 10;
export const CELLS = BOARD * BOARD;

export interface ShipType {
  key: string;
  name: string;
  size: number;
}

export const FLEET: ShipType[] = [
  { key: "carrier", name: "Carrier", size: 5 },
  { key: "battleship", name: "Battleship", size: 4 },
  { key: "cruiser", name: "Cruiser", size: 3 },
  { key: "submarine", name: "Submarine", size: 3 },
  { key: "destroyer", name: "Destroyer", size: 2 },
];

export type Orient = "h" | "v";

/** The board cells a ship of `size` occupies from `start`, or null if off-board. */
export function cellsFor(start: number, size: number, orient: Orient): number[] | null {
  const r = Math.floor(start / BOARD);
  const c = start % BOARD;
  if (orient === "h") {
    if (c + size > BOARD) return null;
    return Array.from({ length: size }, (_, k) => start + k);
  }
  if (r + size > BOARD) return null;
  return Array.from({ length: size }, (_, k) => start + k * BOARD);
}

/** Orthogonal neighbours of a cell (for the targeting AI). */
export function neighbors(i: number): number[] {
  const r = Math.floor(i / BOARD);
  const c = i % BOARD;
  const out: number[] = [];
  if (r > 0) out.push(i - BOARD);
  if (r < BOARD - 1) out.push(i + BOARD);
  if (c > 0) out.push(i - 1);
  if (c < BOARD - 1) out.push(i + 1);
  return out;
}
