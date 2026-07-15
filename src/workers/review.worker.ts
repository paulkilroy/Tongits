import { analyzeGinMC } from "../gin/analysis";
import { type GinObs } from "../gin/review";
import { analyzeSixtyFiveMC } from "../sixtyfive/analysis";
import { type SFObs } from "../sixtyfive/analysis";

// Runs the exact Monte-Carlo hand review off the main thread for the discard-based
// rummy games. The heuristic review shows instantly on the board; this refines every
// discard's odds by real playouts and posts the finished ReviewTurn[] back.

type Job =
  | { game: "gin"; obs: GinObs; samples: number }
  | { game: "65"; obs: SFObs; samples: number };

self.onmessage = (e: MessageEvent<Job>) => {
  const job = e.data;
  const onProgress = (fraction: number) => self.postMessage({ type: "progress", fraction });
  const turns =
    job.game === "gin"
      ? analyzeGinMC(job.obs, job.samples, onProgress)
      : analyzeSixtyFiveMC(job.obs, job.samples, onProgress);
  self.postMessage({ type: "done", turns });
};
