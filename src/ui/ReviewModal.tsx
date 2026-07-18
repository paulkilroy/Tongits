import { type ReactNode } from "react";
import { ReviewReplay } from "./ReviewReplay";
import { ReviewShell } from "./ReviewShell";
import { WinGraph } from "./WinGraph";
import { type ReviewTurn } from "./reviewModel";

// The rummy hand/game review: the shared ReviewShell chrome (backdrop, title, Copy,
// Close, ← / → keys) wrapped around the rummy body — a progress bar while the review
// is still computing, then the win-odds graph + stepper once ready. Games supply
// only their data; a fix or feature added here reaches every game at once.

export function ReviewModal({
  title,
  turns,
  toText,
  onClose,
  discardTitle,
  headlineUnit,
  hideMelds,
  extra,
  progress,
  progressLabel = "Analysing your play",
  showGraph,
  caption,
  header,
}: {
  title: string;
  turns: ReviewTurn[];
  /** Plain-text rendering of the review, for the Copy button. */
  toText: () => string;
  onClose: () => void;
  discardTitle?: string;
  headlineUnit?: string;
  hideMelds?: boolean;
  extra?: (turn: ReviewTurn, index: number) => ReactNode;
  /** 0-1 while the review is being computed (e.g. in a worker); omit if instant. */
  progress?: number;
  /** Label on the progress bar, e.g. "Simulating your hand". */
  progressLabel?: string;
  /** Show the built-in win-odds graph across turns once ready. */
  showGraph?: boolean;
  /** A line above the graph (called with the ready turns, so it can read them). */
  caption?: (turns: ReviewTurn[]) => ReactNode;
  /** Extra content above the stepper once ready (e.g. Tongits' round summary). */
  header?: (step: number, setStep: (i: number) => void) => ReactNode;
}) {
  const ready = turns.length > 0;

  return (
    <ReviewShell title={title} steps={turns.length} toText={() => toText()} onClose={onClose}>
      {(step, setStep) =>
        ready ? (
          <>
            {caption && <div className="wg-caption">{caption(turns)}</div>}
            {showGraph && turns.length > 1 && (
              <WinGraph turns={turns} current={Math.min(step, turns.length - 1)} onSelect={setStep} />
            )}
            {header?.(step, setStep)}
            <ReviewReplay
              turns={turns}
              step={step}
              setStep={setStep}
              discardTitle={discardTitle}
              headlineUnit={headlineUnit}
              hideMelds={hideMelds}
              extra={extra}
            />
          </>
        ) : progress != null && progress < 1 ? (
          <div className="wg-progress">
            <div>
              {progressLabel}… {Math.round(progress * 100)}%
            </div>
            <div className="wg-bar">
              <div className="wg-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        ) : null
      }
    </ReviewShell>
  );
}
