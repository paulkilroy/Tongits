import { winOddsSeries } from "../engine/winodds";
import { type GameState } from "../engine/game";

// Runs the (heavy) Monte Carlo win-odds off the main thread, reporting progress.

interface Job {
  history: GameState[];
  seat: number;
  samples: number;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { history, seat, samples } = e.data;
  const series = winOddsSeries(history, seat, samples, (fraction) =>
    self.postMessage({ type: "progress", fraction }),
  );
  self.postMessage({ type: "done", series });
};
