import { useEffect, useMemo, useState } from "react";
import { type CribState } from "./game";
import { reviewHand, reviewToText } from "./review";
import { HandReviewBody } from "./CribReview";

/** Step through every hand of a finished (or in-progress) game, each fully reviewed. */
export function CribGameReview({
  hands,
  me,
  oppName,
  onClose,
}: {
  hands: CribState[];
  me: number;
  oppName: string;
  onClose: () => void;
}) {
  const n = hands.length;
  const [i, setI] = useState(0);
  const idx = Math.max(0, Math.min(n - 1, i));
  const review = useMemo(() => (hands[idx] ? reviewHand(hands[idx], me) : null), [hands, idx, me]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
      else if (e.key === "ArrowRight") setI((v) => Math.min(n - 1, v + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);

  if (!review) return null;
  function copy() {
    void navigator.clipboard?.writeText(reviewToText(review!, oppName));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  const myScore = hands[idx].players[me].score;
  const oppScore = hands[idx].players[(me + 1) % 2].score;

  return (
    <div className="reveal-backdrop">
      <div className="reveal review cr-review">
        <h2 className="reveal-title">Game review</h2>
        <div className="cr-gr-nav">
          <button className="rp-arrow" disabled={idx === 0} onClick={() => setI(idx - 1)} aria-label="Previous hand">
            ‹
          </button>
          <div className="cr-gr-mid">
            <strong>Hand {idx + 1}</strong> / {n} · you {myScore} – {oppScore} {oppName}
          </div>
          <button
            className="rp-arrow"
            disabled={idx === n - 1}
            onClick={() => setI(idx + 1)}
            aria-label="Next hand"
          >
            ›
          </button>
        </div>
        <HandReviewBody review={review} me={me} oppName={oppName} />
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
