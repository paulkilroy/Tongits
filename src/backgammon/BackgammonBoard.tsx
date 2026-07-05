import { useEffect, useState } from "react";
import { BackButton } from "../ui/Icon";
import { POINTS, mine, pipCount } from "./rules";
import { type BgState, legalMoves } from "./game";

type From = number | "bar";

export interface BgBoardProps {
  g: BgState;
  me: number;
  title: string;
  onRoll: () => void;
  onMove: (from: From, die: number) => void;
  onExit: () => void;
  onNewGame?: () => void;
  waiting?: string | null;
}

/** One point (triangle) holding a stack of checkers. */
function Point({
  i,
  count,
  selectable,
  isDest,
  selected,
  onClick,
}: {
  i: number;
  count: number; // signed
  selectable: boolean;
  isDest: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const n = Math.abs(count);
  const owner = count > 0 ? 0 : count < 0 ? 1 : null;
  return (
    <button
      className={`bg-point ${i % 2 === 0 ? "even" : "odd"} ${selectable ? "sel-ok" : ""} ${isDest ? "dest" : ""} ${selected ? "on" : ""}`}
      onClick={onClick}
      aria-label={`point ${i + 1}`}
    >
      <span className="bg-pt-num">{i + 1}</span>
      <span className="bg-stack">
        {Array.from({ length: Math.min(n, 5) }, (_, k) => (
          <span key={k} className={`bg-chk p${owner}`} />
        ))}
        {n > 5 && <span className="bg-chk-more">{n}</span>}
      </span>
    </button>
  );
}

export function BackgammonBoard({ g, me, title, onRoll, onMove, onExit, onNewGame, waiting }: BgBoardProps) {
  const [sel, setSel] = useState<From | null>(null);
  useEffect(() => setSel(null), [g]);

  const myTurn = g.current === me && !g.result;
  const legal = myTurn && g.phase === "move" ? legalMoves(g) : [];
  const froms = new Set(legal.map((m) => String(m.from)));
  const dests = sel !== null ? legal.filter((m) => String(m.from) === String(sel)) : [];
  const destDie = (to: number | "off") => dests.find((m) => (m.to === "off" ? "off" : m.to) === to)?.die;

  const clickPoint = (i: number) => {
    if (!myTurn || g.phase !== "move") return;
    const die = destDie(i);
    if (sel !== null && die != null) {
      onMove(sel, die);
      setSel(null);
      return;
    }
    setSel(froms.has(String(i)) ? i : null);
  };

  const top = Array.from({ length: 12 }, (_, k) => 12 + k); // indices 12..23
  const bottom = Array.from({ length: 12 }, (_, k) => 11 - k); // indices 11..0

  const renderPoint = (i: number) => (
    <Point
      key={i}
      i={i}
      count={g.board.points[i]}
      selectable={froms.has(String(i))}
      isDest={destDie(i) != null}
      selected={sel === i}
      onClick={() => clickPoint(i)}
    />
  );

  const offDie = destDie("off");

  return (
    <main className="app screen backgammon">
      <div className="screen-head">
        <BackButton onClick={onExit} />
        <h1>{title}</h1>
        <span />
      </div>

      <div className="screen-body">
        <div className="bg-status">
          <span className={g.current === me ? "you" : ""}>
            {g.result
              ? g.result.winner === me
                ? "You win! 🎉"
                : `${g.players[g.result.winner].name} wins.`
              : myTurn
                ? g.phase === "roll"
                  ? "Your roll"
                  : "Your move"
                : `${g.players[g.current].name}…`}
          </span>
          <span className="bg-pips">
            pips {pipCount(g.board, me)}–{pipCount(g.board, (me + 1) % 2)}
          </span>
        </div>
        {waiting && <div className="cr-waiting">{waiting}</div>}

        <div className="bg-board">
          <div className="bg-row">{top.map(renderPoint)}</div>

          <div className="bg-mid">
            <button
              className={`bg-bar ${froms.has("bar") ? "sel-ok" : ""} ${sel === "bar" ? "on" : ""}`}
              onClick={() => {
                if (froms.has("bar")) setSel("bar");
              }}
            >
              bar
              <span className="bg-bar-counts">
                {g.board.bar[0] > 0 && <span className="bg-chk p0">{g.board.bar[0]}</span>}
                {g.board.bar[1] > 0 && <span className="bg-chk p1">{g.board.bar[1]}</span>}
              </span>
            </button>
            <button className={`bg-off ${offDie != null ? "dest" : ""}`} onClick={() => offDie != null && sel !== null && onMove(sel, offDie)}>
              off · you {g.board.off[me]} / {g.board.off[(me + 1) % 2]}
            </button>
          </div>

          <div className="bg-row">{bottom.map(renderPoint)}</div>
        </div>

        <div className="bg-dice">
          {g.phase === "move" && g.dice.map((d, k) => <span key={k} className="bg-die">{d}</span>)}
        </div>

        {g.result ? (
          onNewGame && (
            <button className="big play-primary" onClick={onNewGame}>
              New game
            </button>
          )
        ) : myTurn && g.phase === "roll" ? (
          <button className="big play-primary" onClick={onRoll}>
            🎲 Roll
          </button>
        ) : myTurn && g.phase === "move" && legal.length === 0 ? (
          <div className="cr-lbl">no moves — passing…</div>
        ) : myTurn && g.phase === "move" ? (
          <div className="cr-lbl">{sel === null ? "tap a checker to move" : "tap a destination"}</div>
        ) : null}
      </div>
    </main>
  );
}

/** Whether `me` has any checker at all (used by callers to sanity-check seats). */
export const hasCheckers = (g: BgState, me: number): boolean => {
  for (let i = 0; i < POINTS; i++) if (mine(g.board.points, me, i) > 0) return true;
  return g.board.bar[me] > 0 || g.board.off[me] > 0;
};
