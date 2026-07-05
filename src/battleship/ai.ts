import { CELLS, BOARD, neighbors } from "./rules";
import {
  type BattleState,
  autoPlace,
  setReady,
  fire,
  allPlaced,
  isSunk,
} from "./game";

// Practice-strength Battleship AI: random legal placement, then hunt/target
// firing — chase the neighbours of unresolved hits, otherwise sweep the board on
// a checkerboard parity (every ship is ≥2 long, so half the cells suffice).

/** Pick the AI's next target cell. */
export function chooseShot(state: BattleState, seat: number, rng: () => number = Math.random): number {
  const me = state.players[seat];
  const opp = state.players[(seat + 1) % 2];
  const shot = new Set(me.shots);

  // Hits that belong to a ship that isn't fully sunk yet.
  const sunkCells = new Set(opp.ships.filter((s) => isSunk(s, me.shots)).flatMap((s) => s.cells));
  const openHits = me.shots.filter((c) => opp.ships.some((s) => s.cells.includes(c)) && !sunkCells.has(c));

  if (openHits.length) {
    // If two open hits are in a line, extend that line; else try any neighbour.
    const line = lineTargets(openHits, shot);
    const targets = line.length ? line : openHits.flatMap((h) => neighbors(h)).filter((n) => !shot.has(n));
    if (targets.length) return targets[Math.floor(rng() * targets.length)];
  }

  const all = Array.from({ length: CELLS }, (_, i) => i).filter((c) => !shot.has(c));
  const parity = all.filter((c) => (Math.floor(c / BOARD) + (c % BOARD)) % 2 === 0);
  const pool = parity.length ? parity : all;
  return pool[Math.floor(rng() * pool.length)];
}

/** Given ≥2 collinear open hits, the unshot cells that extend the line. */
function lineTargets(openHits: number[], shot: Set<number>): number[] {
  const out: number[] = [];
  const set = new Set(openHits);
  for (const a of openHits) {
    for (const b of openHits) {
      if (a >= b) continue;
      const ar = Math.floor(a / BOARD);
      const ac = a % BOARD;
      const br = Math.floor(b / BOARD);
      const bc = b % BOARD;
      if (ar === br && Math.abs(ac - bc) === 1) {
        // horizontal neighbours → try the two ends
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (lo % BOARD > 0 && !shot.has(lo - 1) && !set.has(lo - 1)) out.push(lo - 1);
        if (hi % BOARD < BOARD - 1 && !shot.has(hi + 1) && !set.has(hi + 1)) out.push(hi + 1);
      } else if (ac === bc && Math.abs(ar - br) === 1) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (lo - BOARD >= 0 && !shot.has(lo - BOARD) && !set.has(lo - BOARD)) out.push(lo - BOARD);
        if (hi + BOARD < CELLS && !shot.has(hi + BOARD) && !set.has(hi + BOARD)) out.push(hi + BOARD);
      }
    }
  }
  return out;
}

/** One AI action: place+ready during setup, or fire on its turn. */
export function aiStep(state: BattleState, rng: () => number = Math.random): BattleState {
  if (state.result) return state;
  if (state.phase === "place") {
    for (let p = 0; p < state.players.length; p++) {
      if (state.players[p].isAI && !state.players[p].ready) {
        const placed = allPlaced(state.players[p]) ? state : autoPlace(state, p, rng);
        return setReady(placed, p);
      }
    }
    return state;
  }
  if (state.phase === "play" && state.players[state.current].isAI) {
    return fire(state, state.current, chooseShot(state, state.current, rng));
  }
  return state;
}
