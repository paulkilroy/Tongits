import { useEffect, useState, type ReactNode } from "react";
import { ReviewReplay } from "./ReviewReplay";
import { type ReviewTurn } from "./reviewModel";

// The one hand/game review modal, shared by every game. It owns the chrome
// (backdrop, title, Copy, Close), the current-turn step state, and ←/→ keyboard
// navigation — so a fix or feature added here reaches every game at once. Games
// supply only their data: the graded `turns`, a `toText()` for Copy, an optional
// `header` above the stepper (win-odds graph, summary…), and per-turn `extra`
// panels below it (deep-dive, opponents, knock verdict…).

export function ReviewModal({
  title,
  turns,
  toText,
  onClose,
  discardTitle,
  headlineUnit,
  hideMelds,
  extra,
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
  /** Rendered above the stepper; gets step state so a graph can show the cursor. */
  header?: (step: number, setStep: (i: number) => void) => ReactNode;
}) {
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

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
        {header?.(step, setStep)}
        {turns.length > 0 && (
          <ReviewReplay
            turns={turns}
            step={step}
            setStep={setStep}
            discardTitle={discardTitle}
            headlineUnit={headlineUnit}
            hideMelds={hideMelds}
            extra={extra}
          />
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
