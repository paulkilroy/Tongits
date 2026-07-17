import { useState, type ReactNode } from "react";
import { DeepDivePanel, type DeepRow } from "./DeepDivePanel";

// The on-demand Monte-Carlo deep-dive shell, shared by every game. It owns the
// button, the running state, the "run it off a paint tick" timing, and the panel —
// each game supplies only `compute()`, which plays this turn's top discards out and
// returns the rows. (Gin and 65 previously copy-pasted this whole shell.)

export function CardDeepDive({ samples, compute }: { samples: number; compute: () => DeepRow[] }) {
  const [rows, setRows] = useState<DeepRow[] | null>(null);
  const [running, setRunning] = useState(false);

  function run() {
    setRunning(true);
    setRows(null);
    setTimeout(() => {
      setRows(compute());
      setRunning(false);
    }, 20);
  }

  return (
    <div className="rp-section">
      <div className="rp-label">
        Deep dive
        <button className="dd-run" onClick={run} disabled={running}>
          {running ? "running…" : `run ${samples} sims`}
        </button>
      </div>
      {!rows && !running && (
        <div className="rp-disc-more">Play this turn's top discards out {samples}× each — see how the hands end.</div>
      )}
      {rows && <DeepDivePanel rows={rows} />}
    </div>
  );
}

/** Build the deep-dive rows: autopsy each candidate discard, map its outcome buckets
 *  to a stacked bar, rank by win %. Games supply only their own autopsy + buckets. */
export function deepRows<C, O extends { winPct: number }>(
  candidates: C[],
  opts: {
    cardId: (c: C) => string;
    label: (c: C) => string;
    yourId: string;
    autopsy: (c: C, i: number) => O;
    segments: { key: keyof O; cls: string; label: string }[];
    legend: (o: O) => ReactNode;
  },
): DeepRow[] {
  return candidates
    .map((c, i) => {
      const o = opts.autopsy(c, i);
      return {
        label: `Discard ${opts.label(c)}`,
        isYours: opts.cardId(c) === opts.yourId,
        pct: Math.round(o.winPct * 100),
        segs: opts.segments.map((s) => ({ cls: s.cls, frac: o[s.key] as number, label: s.label })),
        legend: opts.legend(o),
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

/** The two lowest-deadwood discards plus the one you actually threw — the candidates
 *  worth simulating for a turn. */
export function topDiscards<C>(
  hand: C[],
  cardId: (c: C) => string,
  deadwoodAfter: (c: C) => number,
  yourDiscardId: string,
  n = 2,
): C[] {
  const byDw = hand.map((c) => ({ c, dw: deadwoodAfter(c) })).sort((a, b) => a.dw - b.dw);
  const chosen = new Map<string, C>();
  for (const { c } of byDw.slice(0, n)) chosen.set(cardId(c), c);
  const yourC = hand.find((c) => cardId(c) === yourDiscardId);
  if (yourC) chosen.set(yourDiscardId, yourC);
  return [...chosen.values()];
}
