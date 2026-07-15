import { type ReviewTurn } from "./reviewModel";

// Shared review sparkline: your equity (win % / chance of success) across the turns,
// each point coloured by its play grade, with a movable cursor. Used by every game's
// review so the curve looks and behaves the same everywhere.

export function WinGraph({
  turns,
  current,
  onSelect,
}: {
  turns: ReviewTurn[];
  current?: number;
  onSelect?: (i: number) => void;
}) {
  const W = 520;
  const H = 130;
  const pad = 8;
  const n = turns.length;
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i / (n - 1)) * (W - 2 * pad));
  const y = (pct: number) => pad + (1 - pct / 100) * (H - 2 * pad);
  const line = turns.map((t, i) => `${x(i)},${y(t.yourPct)}`).join(" ");
  const area =
    `M ${x(0)},${H - pad} ` +
    turns.map((t, i) => `L ${x(i)},${y(t.yourPct)}`).join(" ") +
    ` L ${x(n - 1)},${H - pad} Z`;
  return (
    <svg className="wingraph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="win odds graph">
      <line className="wg-mid" x1={pad} x2={W - pad} y1={y(50)} y2={y(50)} />
      <path className="wg-area" d={area} />
      <polyline className="wg-line" points={line} />
      {current != null && <line className="wg-cursor" x1={x(current)} x2={x(current)} y1={pad} y2={H - pad} />}
      {turns.map((t, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(t.yourPct)}
          r={current === i ? 5.5 : 3.6}
          className={`wg-dot grade-${t.grade} ${current === i ? "active" : ""} ${onSelect ? "clickable" : ""}`}
          onClick={onSelect ? () => onSelect(i) : undefined}
        />
      ))}
    </svg>
  );
}
