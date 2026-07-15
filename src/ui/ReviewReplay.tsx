import { type ReactNode } from "react";
import { type ReviewTurn, GRADE_LABEL } from "./reviewModel";

// The shared hand-review stepper — the Tongits "Game Review" board, generalised so
// every card game renders identically. It only knows `ReviewTurn[]`; game-specific
// panels (Tongits deep-dive/draws, Gin opponent estimate) come in through `extra`.

export function ReviewReplay({
  turns,
  step,
  setStep,
  discardTitle = "If you discard… · projected win %",
  headlineUnit = "%",
  extra,
}: {
  turns: ReviewTurn[];
  step: number;
  setStep: (i: number) => void;
  /** Heading over the per-discard table. */
  discardTitle?: string;
  /** Suffix on the headline equity number ("%" for win-odds). */
  headlineUnit?: string;
  /** Game-specific sections rendered below the shared core for the current turn. */
  extra?: (turn: ReviewTurn, index: number) => ReactNode;
}) {
  const n = turns.length;
  const i = Math.max(0, Math.min(n - 1, step));
  const g = turns[i];
  if (!g) return null;

  return (
    <div className="replay">
      <div className="rp-nav">
        <button className="rp-arrow" onClick={() => setStep(i - 1)} disabled={i === 0} aria-label="Previous play">
          ‹
        </button>
        <div className="rp-nav-mid">
          <span className={`rv-grade grade-${g.grade}`}>{GRADE_LABEL[g.grade]}</span>
          <span className="rp-turn">
            Turn {g.turn} / {n}
          </span>
          <strong>
            {g.yourPct}
            {headlineUnit}
          </strong>
          {g.bestPct > g.yourPct && (
            <span className="rv-best">
              {" "}
              best {g.bestPct}
              {headlineUnit}
            </span>
          )}
        </div>
        <button className="rp-arrow" onClick={() => setStep(i + 1)} disabled={i === n - 1} aria-label="Next play">
          ›
        </button>
      </div>

      {g.reason && <div className="rv-reason">{g.reason}</div>}

      {g.bestLine && (
        <div className="rp-bestline">
          <span className="rp-bestline-tag">Best line</span>
          {g.bestLine.map((s, k) => (
            <span key={k} className="rp-step">
              {k > 0 && <span className="rp-step-arrow">›</span>}
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="rp-section">
        <div className="rp-label">
          Your hand · {g.hand.length} cards
          <span className="rp-legend">
            <span className="rp-key discarded">▦ discarded</span>
            {g.bestDiscard && <span className="rp-key shoulda">▦ should’ve</span>}
          </span>
        </div>
        <div className="rp-hand">
          {g.hand.map((h, k) => (
            <span key={k} className={`mc ${h.card.suitClass} ${h.loose ? "loose" : ""} ${h.mark}`}>
              {h.card.label}
            </span>
          ))}
        </div>
      </div>

      {g.discards.length > 1 && (
        <div className="rp-section">
          <div className="rp-label">{discardTitle}</div>
          <div className="rp-discards">
            {g.discards.map((d) => {
              const isYou = d.cardId === g.yourDiscard;
              const isBest = d.cardId === g.discards[0].cardId;
              return (
                <div className={`rp-disc ${isYou ? "you" : ""}`} key={d.cardId}>
                  <div className="rp-disc-main">
                    <span className={`mc ${d.card.suitClass}`}>{d.card.label}</span>
                    <div className="rp-disc-bar">
                      <div
                        className={`rp-disc-fill ${isBest ? "best" : ""}`}
                        style={{ width: `${Math.max(2, d.pct)}%` }}
                      />
                    </div>
                    <span className="rp-disc-pct">{d.pct}%</span>
                    {isBest && <span className="rp-disc-tag best">best</span>}
                    {isYou && <span className="rp-disc-tag you">you</span>}
                  </div>
                  {d.note && <div className="rp-disc-note">{d.note}</div>}
                </div>
              );
            })}
          </div>
          {g.moreDiscards > 0 && (
            <div className="rp-disc-more">
              +{g.moreDiscards} weaker discard{g.moreDiscards > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {extra?.(g, i)}

      <div className="rp-section">
        <div className="rp-label">Your melds</div>
        {g.melds.length ? (
          <div className="rp-melds">
            {g.melds.map((m, mi) => (
              <span className="meld" key={mi}>
                {m.map((c, ci) => (
                  <span key={ci} className={`mc ${c.suitClass}`}>
                    {c.label}
                  </span>
                ))}
              </span>
            ))}
          </div>
        ) : (
          <div className="rp-empty">— none down yet —</div>
        )}
      </div>
    </div>
  );
}
