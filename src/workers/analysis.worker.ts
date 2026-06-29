import { analyzeTurns } from "../engine/analysis";
import { type GameState } from "../engine/game";

// Runs the (heavy) engine-graded play analysis off the main thread, reporting
// progress as each candidate play is evaluated.

interface Job {
  history: GameState[];
  seat: number;
  samples: number;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { history, seat, samples } = e.data;
  const grades = analyzeTurns(history, seat, samples, (fraction) =>
    self.postMessage({ type: "progress", fraction }),
  );
  self.postMessage({ type: "done", grades });
};
