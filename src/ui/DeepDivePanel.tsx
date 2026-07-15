import { type ReactNode } from "react";

// The one deep-dive panel, shared by every game. A game runs its own Monte-Carlo
// autopsy (how each candidate play's simulated deals actually end) and hands the
// results in as generic rows: a win %, a stacked outcome bar (green wins / red
// losses), and a free-text legend. No game-specific outcome buckets live here.

export interface DeepSeg {
  /** Colour class: w1/w2/w3 for wins, l1/l2/l3 for losses. */
  cls: string;
  /** Fraction of resolved playouts (0-1). */
  frac: number;
  /** Tooltip label, e.g. "you go out". */
  label: string;
}

export interface DeepRow {
  /** e.g. "Discard K♣" or a meld/sapaw line. */
  label: string;
  isYours: boolean;
  /** Win %, 0-100. */
  pct: number;
  segs: DeepSeg[];
  legend?: ReactNode;
}

export function DeepDivePanel({ rows }: { rows: DeepRow[] }) {
  return (
    <div className="dd-panel">
      {rows.map((r, i) => (
        <div className={`dd-row ${r.isYours ? "you" : ""}`} key={i}>
          <div className="dd-head">
            <strong>{r.label}</strong>
            <span className="dd-pct">{r.pct}% win</span>
            {i === 0 && <span className="rp-disc-tag best">best</span>}
            {r.isYours && <span className="rp-disc-tag you">you</span>}
          </div>
          <div className="dd-bar">
            {r.segs.map((s, k) =>
              s.frac > 0 ? (
                <div
                  key={k}
                  className={`dd-seg ${s.cls}`}
                  style={{ width: `${s.frac * 100}%` }}
                  title={`${s.label}: ${Math.round(s.frac * 100)}%`}
                />
              ) : null,
            )}
          </div>
          {r.legend && <div className="dd-legend">{r.legend}</div>}
        </div>
      ))}
    </div>
  );
}
