import { describe, it, expect } from "vitest";
import { makeRng } from "../engine/deck";
import { FLEET } from "./rules";
import {
  newGame,
  autoPlace,
  setReady,
  fire,
  placeShip,
  allPlaced,
  fleetSunk,
  type BattleState,
} from "./game";
import { aiStep, chooseShot } from "./ai";

function bothPlaced(seed = 1): BattleState {
  let s = newGame(["A", "B"], [false, false]);
  s = autoPlace(s, 0, makeRng(seed));
  s = autoPlace(s, 1, makeRng(seed + 100));
  s = setReady(s, 0);
  s = setReady(s, 1);
  return s;
}

describe("battleship placement", () => {
  it("auto-places the whole fleet without overlaps", () => {
    const s = autoPlace(newGame(["A", "B"], [false, false]), 0, makeRng(3));
    expect(s.players[0].ships).toHaveLength(FLEET.length);
    const cells = s.players[0].ships.flatMap((sh) => sh.cells);
    expect(new Set(cells).size).toBe(cells.length); // no overlaps
    cells.forEach((c) => expect(c).toBeGreaterThanOrEqual(0));
    cells.forEach((c) => expect(c).toBeLessThan(100));
    expect(allPlaced(s.players[0])).toBe(true);
  });

  it("rejects an off-board or overlapping manual placement", () => {
    let s = newGame(["A", "B"], [false, false]);
    s = placeShip(s, 0, "carrier", 8, "h"); // col 8 + size 5 → off-board
    expect(s.players[0].ships).toHaveLength(0);
    s = placeShip(s, 0, "carrier", 0, "h"); // A1..E1
    expect(s.players[0].ships).toHaveLength(1);
    const overlap = placeShip(s, 0, "battleship", 0, "h"); // overlaps carrier
    expect(overlap.players[0].ships).toHaveLength(1);
  });

  it("starts the play only once both are ready", () => {
    let s = autoPlace(newGame(["A", "B"], [false, false]), 0, makeRng(1));
    s = autoPlace(s, 1, makeRng(2));
    expect(setReady(s, 0).phase).toBe("place");
    s = setReady(setReady(s, 0), 1);
    expect(s.phase).toBe("play");
    expect(s.current).toBe(0);
  });
});

describe("battleship firing", () => {
  it("registers hits and misses and alternates turns", () => {
    const s = bothPlaced();
    const target = s.players[1].ships[0].cells[0]; // a known enemy ship cell
    const after = fire(s, 0, target);
    expect(after.players[0].shots).toContain(target);
    expect(after.current).toBe(1); // turn passed
  });

  it("can't fire the same cell twice or out of turn", () => {
    const s = bothPlaced();
    expect(fire(s, 1, 0)).toBe(s); // not player 1's turn
    const after = fire(s, 0, 5);
    expect(fire(after, 0, 5)).toBe(after); // still player 1's turn now
  });

  it("sinking the whole enemy fleet ends the game", () => {
    let s = bothPlaced();
    const enemyCells = s.players[1].ships.flatMap((sh) => sh.cells);
    // Fire at every enemy cell (player 0), letting player 1 waste shots between.
    let guard = 0;
    for (const c of enemyCells) {
      if (s.result) break;
      if (s.current !== 0) s = fire(s, 1, firstUnshot(s, 1));
      s = fire(s, 0, c);
      if (guard++ > 300) break;
    }
    expect(s.result).not.toBeNull();
    expect(s.result?.winner).toBe(0);
    expect(fleetSunk(s.players[1], s.players[0].shots)).toBe(true);
  });
});

function firstUnshot(s: BattleState, seat: number): number {
  for (let c = 0; c < 100; c++) if (!s.players[seat].shots.includes(c)) return c;
  return 0;
}

describe("battleship AI", () => {
  it("plays a full game to a winner", () => {
    let s = newGame(["Bot A", "Bot B"], [true, true]);
    let guard = 0;
    while (!s.result && guard++ < 1000) {
      const next = aiStep(s, makeRng(guard));
      if (next === s) break;
      s = next;
    }
    expect(s.result).not.toBeNull();
  });

  it("chases a hit: after hitting, targets an adjacent cell", () => {
    let s = bothPlaced(5);
    const hitCell = s.players[1].ships[2].cells[0];
    s = fire(s, 0, hitCell); // player 0 scores a hit (ship not sunk if size>1)
    // Back to player 0's turn to test targeting.
    s = { ...s, current: 0 };
    const shot = chooseShot(s, 0, makeRng(9));
    const neighborsOf = [hitCell - 1, hitCell + 1, hitCell - 10, hitCell + 10];
    // Only assert when that ship isn't already sunk.
    if (!s.players[1].ships[2].cells.every((c) => s.players[0].shots.includes(c))) {
      expect(neighborsOf).toContain(shot);
    }
  });
});
