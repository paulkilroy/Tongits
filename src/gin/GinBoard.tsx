import { useEffect, useMemo, useRef, useState } from "react";
import { BackButton } from "../ui/Icon";
import { type Card, cardId, cardLabel, cardPoints, SUIT_CLASS } from "../engine/cards";
import { bestMelds } from "../engine/meldFinder";
import { type GinState, deadwoodPts, canKnock, KNOCK_MAX, TARGET } from "./game";
import { SortToggle, sortHand, type SortMode } from "../ui/handSort";
import { PlayingCard } from "../ui/PlayingCard";
import { DiscardHistory } from "../ui/DiscardHistory";
import { reviewGinHand, type GinTurn } from "./review";

function Chip({
  c,
  onClick,
  dim,
  selected,
  isNew,
  inMeld,
  mini,
}: {
  c: Card;
  onClick?: () => void;
  dim?: boolean;
  selected?: boolean;
  isNew?: boolean;
  inMeld?: boolean;
  mini?: boolean;
}) {
  return (
    <PlayingCard
      label={cardLabel(c)}
      suitClass={SUIT_CLASS[c.suit]}
      dim={dim}
      mini={mini}
      selected={selected}
      isNew={isNew}
      inMeld={inMeld}
      onClick={onClick}
    />
  );
}

export interface GinBoardProps {
  g: GinState;
  me: number;
  title: string;
  onDraw: (source: "deck" | "discard") => void;
  onDiscard: (cardId: string) => void;
  onKnock: (cardId: string) => void;
  onNextRound?: () => void;
  onNewGame?: () => void;
  onExit: () => void;
  waiting?: string | null;
}

export function GinBoard({ g, me, title, onDraw, onDiscard, onKnock, onNextRound, onNewGame, onExit, waiting }: GinBoardProps) {
  const hand = g.players[me].hand;
  const myTurn = g.current === me && !g.result && (g.phase === "draw" || g.phase === "discard");

  const [sel, setSel] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("suit");
  const [showDiscards, setShowDiscards] = useState(false);
  const [showReview, setShowReview] = useState(false);
  useEffect(() => setSel(null), [g.current, g.phase]);

  // Record my turns this hand (the 8-card hand I held + what I threw) for the
  // post-hand coach. Resets when a new hand is dealt.
  const turnsRef = useRef<GinTurn[]>([]);
  const pendingRef = useRef<{ hand8: Card[]; drewDiscard: boolean } | null>(null);
  const handNoRef = useRef(g.handNo);
  useEffect(() => {
    if (g.handNo !== handNoRef.current) {
      handNoRef.current = g.handNo;
      turnsRef.current = [];
      pendingRef.current = null;
    }
    const myHand = g.players[me].hand;
    if (g.current === me && g.phase === "discard" && myHand.length === 8 && !pendingRef.current) {
      pendingRef.current = { hand8: myHand.map((c) => ({ rank: c.rank, suit: c.suit })), drewDiscard: g.drewFrom === "discard" };
    } else if (pendingRef.current && myHand.length === 7) {
      const disc = pendingRef.current.hand8.find((c) => !myHand.some((x) => cardId(x) === cardId(c)));
      if (disc) turnsRef.current.push({ hand8: pendingRef.current.hand8, discarded: disc, drewDiscard: pendingRef.current.drewDiscard });
      pendingRef.current = null;
    }
  }, [g, me]);
  const review = showReview ? reviewGinHand(turnsRef.current) : null;

  const meldedIds = useMemo(() => new Set(bestMelds(hand).flatMap((m) => m.cards.map(cardId))), [hand]);
  const sorted = useMemo(() => sortHand(hand, sortMode), [hand, sortMode]);
  const deadPts = deadwoodPts(hand);
  const canDiscard = myTurn && g.phase === "discard";
  // A card we can knock/gin with — prefer the selected one.
  const knockCardId = useMemo(() => {
    if (!canDiscard) return null;
    if (sel && canKnock(g, sel)) return sel;
    for (const c of hand) if (canKnock(g, cardId(c))) return cardId(c);
    return null;
  }, [g, hand, canDiscard, sel]);
  const knockGin = knockCardId ? deadwoodPts(hand.filter((c) => cardId(c) !== knockCardId)) === 0 : false;

  const discardTop = g.discard[g.discard.length - 1];

  return (
    <main className="app screen sixtyfive">
      <div className="screen-head">
        <BackButton onClick={onExit} />
        <h1>{title}</h1>
        <span />
      </div>

      <div className="screen-body">
        <div className="cr-scores">
          {g.players.map((p, i) => (
            <div className={`cr-score ${g.current === i && !g.result ? "active" : ""}`} key={i}>
              <div className="cr-score-top">
                <span>{i === me ? "You" : p.name}</span>
                <strong>{p.score}</strong>
              </div>
              <div className="cr-track">
                <div className="cr-track-fill" style={{ width: `${Math.min(100, (p.score / TARGET) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="cr-lbl sf-round">Gin · knock at ≤{KNOCK_MAX} · first to {TARGET}</div>
        {waiting && <div className="cr-waiting">{waiting}</div>}
        {g.log.length > 0 && <div className="cr-flash">{g.log[g.log.length - 1]}</div>}

        {g.phase === "roundEnd" && g.round ? (
          <div className="cr-phase">
            <h2 className="sf-h2">
              {g.players[g.round.knocker].name} {g.round.gin ? "goes Gin!" : "knocks"} ·{" "}
              {g.players[g.round.scorer].name} +{g.round.points}
              {g.round.undercut ? " (undercut!)" : ""}
            </h2>
            {[
              { seat: g.round.knocker, melds: g.round.knockerMelds, dead: g.round.knockerDeadwood, tag: "knocks" },
              {
                seat: (g.round.knocker + 1) % 2,
                melds: g.round.defenderMelds,
                dead: g.round.defenderDeadwood,
                tag: "defends",
              },
            ].map(({ seat, melds, dead, tag }) => (
              <div className="sf-reveal" key={seat}>
                <div className="sf-reveal-name">
                  {seat === me ? "You" : g.players[seat].name} · {tag} ·{" "}
                  <strong>{dead.reduce((a, c) => a + cardPoints(c), 0)} deadwood</strong>
                </div>
                <div className="sf-melds">
                  {melds.map((m, k) => (
                    <span className="sf-meld" key={k}>
                      {m.map((c) => (
                        <Chip key={cardId(c)} c={c} mini />
                      ))}
                    </span>
                  ))}
                  {dead.length > 0 && (
                    <span className="sf-dead">
                      {dead.map((c) => (
                        <Chip key={cardId(c)} c={c} dim mini />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div className="cr-row2">
              {turnsRef.current.length > 0 && (
                <button className="cr-coach-btn" onClick={() => setShowReview(true)}>
                  🔍 Review my hand
                </button>
              )}
              {onNextRound ? (
                <button className="big play-primary" onClick={onNextRound}>
                  Next hand
                </button>
              ) : (
                <div className="cr-lbl">waiting for the next hand…</div>
              )}
            </div>
          </div>
        ) : g.result ? (
          <div className="cr-phase cr-over">
            <h2>{g.result.winner === me ? "You win! 🎉" : `${g.players[g.result.winner].name} wins.`}</h2>
            <div className="cr-lbl">{g.players.map((p, i) => `${i === me ? "You" : p.name} ${p.score}`).join(" · ")}</div>
            {onNewGame && (
              <button className="reveal-replay" onClick={onNewGame}>
                New game
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="sf-piles">
              <button className="sf-pile" disabled={!(myTurn && g.phase === "draw")} onClick={() => onDraw("deck")}>
                <span className="sf-pile-back">🂠</span>
                <span className="cr-lbl">stock {g.deck.length}</span>
              </button>
              <button
                className="sf-pile"
                disabled={!(myTurn && g.phase === "draw") || !discardTop}
                onClick={() => onDraw("discard")}
              >
                {discardTop ? <Chip c={discardTop} /> : <span className="cr-lbl">—</span>}
                <span className="cr-lbl">take discard</span>
              </button>
              {g.discard.length > 0 && (
                <button className="sf-histfan" onClick={() => setShowDiscards(true)} title="see all discards">
                  <span className="histfan-cards">
                    {g.discard.slice(-3).map((c, i) => (
                      <span className="histfan-card" key={i}>
                        <Chip c={c} mini />
                      </span>
                    ))}
                  </span>
                  <span className="cr-lbl">all {g.discard.length}</span>
                </button>
              )}
            </div>

            {showDiscards && (
              <DiscardHistory count={g.discard.length} onClose={() => setShowDiscards(false)}>
                {[...g.discard].reverse().map((c, i) => (
                  <Chip key={`${cardId(c)}-${i}`} c={c} mini />
                ))}
              </DiscardHistory>
            )}

            <div className="sf-analyzer">
              <div className="sf-a-head">
                Your hand · deadwood <strong>{deadPts}</strong> · <span className="legend">green = meld</span>
                {deadPts === 0 && hand.length >= 7 && <span className="fk-good"> · Gin!</span>}
              </div>
              <SortToggle mode={sortMode} onChange={setSortMode} />
              <div className="sf-hand">
                {sorted.map((c) => (
                  <Chip
                    key={cardId(c)}
                    c={c}
                    inMeld={meldedIds.has(cardId(c))}
                    selected={sel === cardId(c)}
                    isNew={g.drawnId === cardId(c)}
                    onClick={canDiscard ? () => setSel((s) => (s === cardId(c) ? null : cardId(c))) : undefined}
                  />
                ))}
              </div>
            </div>

            <div className="sf-actions">
              {!myTurn ? (
                <div className="cr-turn">{g.players[g.current].name}…</div>
              ) : g.phase === "draw" ? (
                <div className="cr-lbl">draw from the stock or take the discard</div>
              ) : (
                <>
                  <div className="cr-lbl">{sel ? "discard the selected card, or:" : "tap a card to select"}</div>
                  <div className="cr-row2">
                    <button className="reveal-replay cr-discard-btn" disabled={!sel} onClick={() => sel && onDiscard(sel)}>
                      Discard
                    </button>
                    {knockCardId && (
                      <button className="cr-coach-btn" onClick={() => onKnock(knockCardId)}>
                        {knockGin ? "✊ Gin!" : "✊ Knock"}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {review && (
          <div className="reveal-backdrop" onClick={() => setShowReview(false)}>
            <div className="reveal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <h2 className="reveal-title">Hand review</h2>
              <p className="cr-lbl">
                {review.couldKnockTurn && review.couldKnockTurn < review.knockedTurn
                  ? `You could have knocked on turn ${review.couldKnockTurn} — you went out on turn ${review.knockedTurn}.`
                  : "Good knock timing — you went out as soon as you could."}
              </p>
              <div className="gin-review">
                {review.turns.map((t) => (
                  <div className={`gin-rev-turn grade-${t.grade}`} key={t.n}>
                    <span className="gin-rev-n">T{t.n}</span>
                    <span className="gin-rev-threw">
                      threw <PlayingCard label={cardLabel(t.discarded)} suitClass={SUIT_CLASS[t.discarded.suit]} mini />
                    </span>
                    <span className="gin-rev-note">
                      <strong className={`grade-${t.grade}`}>{t.grade}</strong>
                      {t.grade !== "best" && ` · ${t.note}`} · {t.deadwoodAfter} dw
                    </span>
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button onClick={() => setShowReview(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
