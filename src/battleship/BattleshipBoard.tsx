import { useState } from "react";
import { BackButton } from "../ui/Icon";
import { BOARD, CELLS, FLEET, type Orient } from "./rules";
import { type BattleState, isSunk, allPlaced } from "./game";

const COLS = "ABCDEFGHIJ";

export interface BattleBoardProps {
  g: BattleState;
  me: number;
  title: string;
  onPlace: (key: string, start: number, orient: Orient) => void;
  onAutoPlace: () => void;
  onReady: () => void;
  onFire: (cell: number) => void;
  onExit: () => void;
  onNewGame?: () => void;
  waiting?: string | null;
}

/** A 10×10 grid of cells; `cell` renders the contents/classes for each index. */
function Grid({
  cell,
  onCell,
  label,
}: {
  cell: (i: number) => { cls: string; content?: string };
  onCell?: (i: number) => void;
  label: string;
}) {
  return (
    <div className="bs-grid-wrap">
      <div className="bs-grid-label">{label}</div>
      <div className="bs-grid">
        {Array.from({ length: CELLS }, (_, i) => {
          const { cls, content } = cell(i);
          return (
            <button
              key={i}
              className={`bs-cell ${cls}`}
              onClick={onCell ? () => onCell(i) : undefined}
              disabled={!onCell}
              aria-label={`${COLS[i % BOARD]}${Math.floor(i / BOARD) + 1}`}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BattleshipBoard({
  g,
  me,
  title,
  onPlace,
  onAutoPlace,
  onReady,
  onFire,
  onExit,
  onNewGame,
  waiting,
}: BattleBoardProps) {
  const meP = g.players[me];
  const opp = g.players[(me + 1) % g.players.length];
  const [orient, setOrient] = useState<Orient>("h");
  const placedKeys = new Set(meP.ships.map((s) => s.key));
  const firstUnplaced = FLEET.find((f) => !placedKeys.has(f.key))?.key ?? FLEET[0].key;
  const [active, setActive] = useState<string>(firstUnplaced);
  const activeKey = placedKeys.has(active) && placedKeys.size < FLEET.length ? firstUnplaced : active;

  const myShipCells = new Map<number, string>();
  meP.ships.forEach((s) => s.cells.forEach((c) => myShipCells.set(c, s.key)));
  const myShots = new Set(meP.shots);
  const oppShots = new Set(opp.shots);
  const oppSunkCells = new Set(opp.ships.filter((s) => isSunk(s, meP.shots)).flatMap((s) => s.cells));

  const myTurn = g.phase === "play" && g.current === me && !g.result;

  // ---------- placement ----------
  if (g.phase === "place") {
    const ready = meP.ready;
    return (
      <main className="app screen battleship">
        <Head title={title} onExit={onExit} />
        <div className="screen-body">
          {waiting && <div className="cr-waiting">{waiting}</div>}
          {ready ? (
            <p className="cr-instr">Fleet locked in. {waiting ?? "Waiting for your opponent…"}</p>
          ) : (
            <>
              <p className="cr-instr">Place your fleet — pick a ship, set direction, tap a square.</p>
              <div className="bs-palette">
                {FLEET.map((f) => (
                  <button
                    key={f.key}
                    className={`bs-ship ${placedKeys.has(f.key) ? "placed" : ""} ${activeKey === f.key ? "active" : ""}`}
                    onClick={() => setActive(f.key)}
                  >
                    {f.name} <span className="bs-ship-size">{f.size}</span>
                  </button>
                ))}
              </div>
              <div className="cr-row2">
                <button className="cr-coach-btn" onClick={() => setOrient((o) => (o === "h" ? "v" : "h"))}>
                  Direction: {orient === "h" ? "↔ across" : "↕ down"}
                </button>
                <button className="cr-coach-btn" onClick={onAutoPlace}>
                  🎲 Shuffle
                </button>
              </div>
            </>
          )}

          <Grid
            label="Your waters"
            onCell={ready ? undefined : (i) => onPlace(activeKey, i, orient)}
            cell={(i) => {
              const key = myShipCells.get(i);
              return { cls: key ? "ship" : "" };
            }}
          />

          {!ready && (
            <button className="big play-primary" disabled={!allPlaced(meP)} onClick={onReady}>
              {allPlaced(meP) ? "Ready" : `Place ${FLEET.length - placedKeys.size} more`}
            </button>
          )}
        </div>
      </main>
    );
  }

  // ---------- play / game over ----------
  return (
    <main className="app screen battleship">
      <Head title={title} onExit={onExit} />
      <div className="screen-body">
        {g.result ? (
          <div className="cr-phase cr-over">
            <h2>{g.result.winner === me ? "You win! 🎉" : `${g.players[g.result.winner].name} wins.`}</h2>
            <div className="cr-lbl">
              your hits {meP.shots.filter((c) => opp.ships.some((s) => s.cells.includes(c))).length} · shots{" "}
              {meP.shots.length}
            </div>
            {onNewGame && (
              <button className="reveal-replay" onClick={onNewGame}>
                New game
              </button>
            )}
          </div>
        ) : (
          <div className={`cr-turn ${myTurn ? "you" : ""}`}>
            {myTurn ? "Your shot — tap the enemy grid" : `${g.players[g.current].name} is taking aim…`}
          </div>
        )}
        {waiting && <div className="cr-waiting">{waiting}</div>}

        <Grid
          label="Enemy waters"
          onCell={myTurn ? (i) => !myShots.has(i) && onFire(i) : undefined}
          cell={(i) => {
            if (!myShots.has(i)) return { cls: "enemy" };
            const hit = opp.ships.some((s) => s.cells.includes(i));
            if (!hit) return { cls: "miss", content: "·" };
            return { cls: oppSunkCells.has(i) ? "sunk" : "hit", content: "✕" };
          }}
        />

        <Grid
          label="Your fleet"
          cell={(i) => {
            const isShip = myShipCells.has(i);
            const shot = oppShots.has(i);
            if (isShip && shot) return { cls: "hit", content: "✕" };
            if (isShip) return { cls: "ship" };
            if (shot) return { cls: "miss", content: "·" };
            return { cls: "" };
          }}
        />
      </div>
    </main>
  );
}

function Head({ title, onExit }: { title: string; onExit: () => void }) {
  return (
    <div className="screen-head">
      <BackButton onClick={onExit} />
      <h1>{title}</h1>
      <span />
    </div>
  );
}
