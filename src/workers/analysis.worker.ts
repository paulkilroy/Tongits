import { analyzeTurns, deepDive } from "../engine/analysis";
import { type GameState } from "../engine/game";

// Runs the (heavy) engine analysis off the main thread. Two jobs:
//  - "analyze": grade every turn (the review).
//  - "deepdive": a big simulation of one turn's top plays, with a breakdown of
//    HOW the simulated rounds ended.

interface AnalyzeJob {
  mode?: "analyze";
  history: GameState[];
  seat: number;
  samples: number;
}
interface DeepJob {
  mode: "deepdive";
  history: GameState[];
  seat: number;
  samples: number;
  turn: number;
}

self.onmessage = (e: MessageEvent<AnalyzeJob | DeepJob>) => {
  const job = e.data;
  if (job.mode === "deepdive") {
    const outcomes = deepDive(job.history, job.seat, job.turn, job.samples, (fraction) =>
      self.postMessage({ type: "progress", fraction }),
    );
    self.postMessage({ type: "deepdone", outcomes });
    return;
  }
  const grades = analyzeTurns(job.history, job.seat, job.samples, (fraction) =>
    self.postMessage({ type: "progress", fraction }),
  );
  self.postMessage({ type: "done", grades });
};
