import { useEffect, useState, type ReactNode } from "react";
import { ReviewReplay } from "./ReviewReplay";
import { WinGraph } from "./WinGraph";
import { type ReviewTurn } from "./reviewModel";

// The one hand/game review modal, shared by every game. It owns the chrome
// (backdrop, title, Copy, Close), the step state + ←/→ keys, AND the "analysing…"
// flow: while the review is still computing (turns empty, progress < 1) it shows a
// progress bar; once ready it shows the win-odds graph + stepper. Games supply only
// their data — a fix or feature added here reaches every game at once.

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
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const ready = turns.length > 0;
  const cur = Math.min(step, turns.length - 1);

  // ← / → step through the turns.
  useEffect(() => {
    const n = turns.length;
    if (!n) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        setStep((s) => Math.max(0, s - 1));
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        setStep((s) => Math.min(n - 1, s + 1));
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turns.length]);

  function copy() {
    void navigator.clipboard?.writeText(toText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="reveal-backdrop" onClick={onClose}>
      <div className="reveal review" onClick={(e) => e.stopPropagation()}>
        <h2 className="reveal-title">{title}</h2>

        {ready ? (
          <>
            {caption && <div className="wg-caption">{caption(turns)}</div>}
            {showGraph && turns.length > 1 && <WinGraph turns={turns} current={cur} onSelect={setStep} />}
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
        ) : (
          progress != null &&
          progress < 1 && (
            <div className="wg-progress">
              <div>
                {progressLabel}… {Math.round(progress * 100)}%
              </div>
              <div className="wg-bar">
                <div className="wg-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )
        )}

        <div className="review-actions">
          <button className="reveal-secondary" onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <button className="reveal-replay" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
