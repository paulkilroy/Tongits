import { useEffect, useState } from "react";
import { type ReviewTurn } from "./reviewModel";

// Refine a rummy hand review with real Monte-Carlo off the main thread. Pass the
// game's observations when the review opens (null when closed). Returns the exact
// ReviewTurn[] once the worker finishes, plus progress — the board shows its instant
// heuristic review meanwhile and swaps to these when ready.

const SAMPLES = 60;

export function useReviewWorker(game: "gin" | "65", obs: unknown | null): { turns: ReviewTurn[] | null; progress: number } {
  const [turns, setTurns] = useState<ReviewTurn[] | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setTurns(null);
    setProgress(0);
    if (!obs) return;
    const worker = new Worker(new URL("../workers/review.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === "progress") setProgress(d.fraction);
      else if (d.type === "done") {
        setTurns(d.turns);
        setProgress(1);
      }
    };
    worker.postMessage({ game, obs, samples: SAMPLES });
    return () => worker.terminate();
  }, [game, obs]);

  return { turns, progress };
}
