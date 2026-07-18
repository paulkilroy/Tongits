import { useEffect, useState, type ReactNode } from "react";

// The chrome shared by every review modal: the backdrop, title, Copy + Close buttons,
// a current-step index, and ← / → keyboard navigation. The body (a rummy stepper, a
// cribbage hand review, …) is supplied as a children render-prop that receives the
// step state. Both ui/ReviewModal (rummy) and cribbage's game review render through it.

export function ReviewShell({
  title,
  steps,
  toText,
  onClose,
  className,
  children,
}: {
  title: string;
  /** Number of steps for ← / → navigation (0/undefined = no keyboard nav). */
  steps?: number;
  /** Plain-text of the current view, for Copy (given the current step). */
  toText: (step: number) => string;
  onClose: () => void;
  /** Extra class on the `.reveal` panel (e.g. "cr-review"). */
  className?: string;
  children: (step: number, setStep: (i: number) => void) => ReactNode;
}) {
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const n = steps ?? 0;
    if (n <= 1) return;
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
  }, [steps]);

  function copy() {
    void navigator.clipboard?.writeText(toText(step));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="reveal-backdrop" onClick={onClose}>
      <div className={`reveal review ${className ?? ""}`.trim()} onClick={(e) => e.stopPropagation()}>
        <h2 className="reveal-title">{title}</h2>
        {children(step, setStep)}
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
