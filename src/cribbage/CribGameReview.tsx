import { useMemo } from "react";
import { type CribState } from "./game";
import { reviewHand, reviewToText } from "./review";
import { HandReviewBody } from "./CribReview";
import { ReviewShell } from "../ui/ReviewShell";

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
  const reviews = useMemo(() => hands.map((h) => reviewHand(h, me)), [hands, me]);

  return (
    <ReviewShell
      title="Game review"
      steps={n}
      className="cr-review"
      toText={(step) => {
        const r = reviews[Math.min(step, n - 1)];
        return r ? reviewToText(r, oppName) : "";
      }}
      onClose={onClose}
    >
      {(step, setStep) => {
        const idx = Math.max(0, Math.min(n - 1, step));
        const review = reviews[idx];
        if (!review) return null;
        const myScore = hands[idx].players[me].score;
        const oppScore = hands[idx].players[(me + 1) % 2].score;
        return (
          <>
            <div className="cr-gr-nav">
              <button className="rp-arrow" disabled={idx === 0} onClick={() => setStep(idx - 1)} aria-label="Previous hand">
                ‹
              </button>
              <div className="cr-gr-mid">
                <strong>Hand {idx + 1}</strong> / {n} · you {myScore} – {oppScore} {oppName}
              </div>
              <button
                className="rp-arrow"
                disabled={idx === n - 1}
                onClick={() => setStep(idx + 1)}
                aria-label="Next hand"
              >
                ›
              </button>
            </div>
            <HandReviewBody review={review} me={me} oppName={oppName} />
          </>
        );
      }}
    </ReviewShell>
  );
}
