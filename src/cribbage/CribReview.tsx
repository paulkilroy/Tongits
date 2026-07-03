import { useState } from "react";
import { cardId } from "../engine/cards";
import { type HandReview, reviewToText } from "./review";
import { type CribGrade } from "./coach";
import { describeShow } from "./scoring";
import { CribCard } from "./CribbageBoard";

const ev = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;

const GRADE_LABEL: Record<CribGrade, string> = { best: "Best", good: "Good", ok: "OK", loose: "Loose" };
// Reuse the Tongits grade colours (grade-best/good/inaccuracy/mistake).
const GRADE_CLASS: Record<CribGrade, string> = {
  best: "best",
  good: "good",
  ok: "inaccuracy",
  loose: "mistake",
};

/** The review content for one hand (no modal chrome). Shared by the single-hand
 *  review and the game review stepper. */
export function HandReviewBody({ review, me, oppName }: { review: HandReview; me: number; oppName: string }) {
  const r = review;
  const keptIds = new Set(r.discard.kept.map(cardId));
  return (
    <>
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
                    <span className="cr-coach-toss" title="into the crib">
                      {e.discard.map((c) => (
                        <CribCard key={cardId(c)} card={c} mini />
                      ))}
                    </span>
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

        {/* ---- pegging (play-by-play MC) ---- */}
        <div className="cr-rv-sec">
          <div className="cr-rv-head">
            Pegging — you scored <strong>{r.yourPegPoints}</strong>
            {r.yourEvLost > 0.3 && <span className="cr-rv-lost"> · gave up {r.yourEvLost.toFixed(1)} net</span>}
          </div>
          <div className="cr-plays">
            {r.pegging.map((p, i) => {
              const mine = p.by === me;
              const off = mine && p.evLost !== undefined && p.evLost > 0.5;
              return (
                <div className={`cr-play ${mine ? "mine" : "theirs"} ${off ? "off" : ""}`} key={i}>
                  <div className="cr-play-main">
                    <span className="cr-play-who">{mine ? "You" : oppName}</span>
                    <CribCard card={p.card} mini />
                    <span className="cr-play-total">{p.total}</span>
                    {p.pts > 0 && <span className="cr-peg-pts">+{p.pts}</span>}
                    {mine && p.yourEV !== undefined && <span className="cr-play-ev">net {ev(p.yourEV)}</span>}
                  </div>
                  {mine && p.options && p.options.length > 1 && (
                    <div className="cr-play-opts">
                      {p.options.map((o) => (
                        <span
                          key={o.id}
                          className={`cr-opt ${o.id === p.options![0].id ? "best" : ""} ${o.id === cardId(p.card) ? "you" : ""}`}
                        >
                          {o.label} {ev(o.ev)}
                        </span>
                      ))}
                    </div>
                  )}
                  {off && p.reason && <div className="cr-play-why">{p.reason}</div>}
                </div>
              );
            })}
          </div>
          <div className="cr-lbl cr-play-note">net = expected pegging points you − opponent, over the rest of the play</div>
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
    </>
  );
}

export function CribReview({
  review,
  me,
  oppName,
  onClose,
}: {
  review: HandReview;
  me: number;
  oppName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard?.writeText(reviewToText(review, oppName));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="reveal-backdrop">
      <div className="reveal review cr-review">
        <h2 className="reveal-title">Hand review</h2>
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
