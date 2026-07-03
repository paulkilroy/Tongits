import { cardId } from "../engine/cards";
import { type HandReview } from "./review";
import { type CribGrade } from "./coach";
import { describeShow } from "./scoring";
import { CribCard } from "./CribbageBoard";

const GRADE_LABEL: Record<CribGrade, string> = { best: "Best", good: "Good", ok: "OK", loose: "Loose" };
// Reuse the Tongits grade colours (grade-best/good/inaccuracy/mistake).
const GRADE_CLASS: Record<CribGrade, string> = {
  best: "best",
  good: "good",
  ok: "inaccuracy",
  loose: "mistake",
};

export function CribReview({ review, me, onClose }: { review: HandReview; me: number; onClose: () => void }) {
  const r = review;
  const keptIds = new Set(r.discard.kept.map(cardId));
  return (
    <div className="reveal-backdrop">
      <div className="reveal review cr-review">
        <h2 className="reveal-title">Hand review</h2>
        <div className="cr-rv-starter">
          <span className="cr-lbl">cut</span>
          <CribCard card={r.starter} mini />
        </div>

        {/* ---- discard ---- */}
        <div className="cr-rv-sec">
          <div className="cr-rv-head">
            <span className={`rv-grade grade-${GRADE_CLASS[r.discard.grade]}`}>{GRADE_LABEL[r.discard.grade]}</span>
            Discard
            {r.discard.lost > 0.3 && <span className="cr-rv-lost"> · gave up {r.discard.lost.toFixed(1)} pts</span>}
          </div>
          <div className="cr-rv-row">
            <span className="cr-lbl">kept</span>
            {r.discard.kept.map((c) => (
              <CribCard key={cardId(c)} card={c} mini />
            ))}
            <span className="cr-lbl">→ crib</span>
            {r.discard.discarded.map((c) => (
              <CribCard key={cardId(c)} card={c} mini />
            ))}
          </div>
          <div className="cr-coach">
            <div className="cr-lbl">best keeps · net EV {r.ownsCrib ? "(your crib +)" : "(their crib −)"}</div>
            {r.discard.top.map((e, i) => {
              const isMine = e.keep.every((c) => keptIds.has(cardId(c)));
              return (
                <div className={`cr-coach-row ${i === 0 ? "best" : ""} ${isMine ? "mine" : ""}`} key={i}>
                  <span className="cr-coach-keep">
                    {e.keep.map((c) => (
                      <CribCard key={cardId(c)} card={c} mini />
                    ))}
                  </span>
                  <span className="cr-coach-ev">
                    <strong>{e.net.toFixed(1)}</strong>
                    <span className="cr-coach-split">
                      hand {e.handEV.toFixed(1)} · crib {r.ownsCrib ? "+" : "−"}
                      {e.cribEV.toFixed(1)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- pegging ---- */}
        <div className="cr-rv-sec">
          <div className="cr-rv-head">
            Pegging — you scored <strong>{r.yourPegPoints}</strong>
            {r.yourMissed > 0 && <span className="cr-rv-lost"> · missed {r.yourMissed}</span>}
          </div>
          <div className="cr-pegs">
            {r.pegging.map((p, i) => (
              <div className={`cr-peg ${p.by === me ? "mine" : "theirs"} ${p.by === me && p.missed > 0 ? "miss" : ""}`} key={i}>
                <CribCard card={p.card} mini />
                <span className="cr-peg-total">{p.total}</span>
                {p.pts > 0 && <span className="cr-peg-pts">+{p.pts}</span>}
                {p.by === me && p.missed > 0 && <span className="cr-peg-miss">missed +{p.missed}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ---- show ---- */}
        <div className="cr-rv-sec">
          <div className="cr-rv-head">The show</div>
          <div className="cr-rv-row">
            <span className="cr-lbl">your hand</span>
            <strong>{r.handScore.total}</strong>
            <span className="cr-rv-desc">{describeShow(r.handScore)}</span>
          </div>
          {r.cribScore && (
            <div className="cr-rv-row">
              <span className="cr-lbl">your crib</span>
              <strong>{r.cribScore.total}</strong>
              <span className="cr-rv-desc">{describeShow(r.cribScore)}</span>
            </div>
          )}
        </div>

        <div className="review-actions">
          <button className="reveal-replay" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
