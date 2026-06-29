import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { type Card, type Suit, SUITS, cardId, cardLabel, rankOrder } from "./engine/cards";
import { classifyMeld, canLayOffMany, type Meld } from "./engine/melds";
import { handPoints } from "./engine/scoring";
import { bestMelds, deadwood } from "./engine/meldFinder";
import { type RuleSet, type StockExhaustionRule } from "./engine/rules";
import {
  newRound,
  topDiscard,
  draw,
  layMeld,
  sapawMany,
  discard,
  callFight,
  canCallFight,
  canTakeDiscard,
  type GameState,
} from "./engine/game";
import { useGame } from "./ui/useGame";
import { useOnlineMatch } from "./ui/useOnlineMatch";
import { useAccount } from "./ui/useAccount";
import { useFriends } from "./ui/useFriends";
import { addBalance, type Account } from "./online/auth";
import { findByCode, addFriend, acceptFriend, createChallenge, respondChallenge } from "./online/friends";
import { settlementDelta } from "./engine/wallet";
import { reviewRound, roundSegments } from "./engine/review";
import { type TurnGrade, type Grade } from "./engine/analysis";
import {
  recordAnalysis,
  loadCoach,
  resetCoach,
  accuracy,
  avgGap,
  type CoachStats,
} from "./ui/coachStore";
import { loadProfile, saveProfile, AVATARS, type Profile } from "./ui/profile";
import { loadRules, saveRules } from "./ui/rulesStore";
import { onlineConfigured, makeCode, createRoom, fetchRoom, pushRoom } from "./online/supabase";

/* ----------------------------- card helpers ------------------------------ */

type SortMode = "suit" | "rank";

function meldCardIds(hand: readonly Card[]): Set<string> {
  return new Set(bestMelds(hand).flatMap((m) => m.cards.map(cardId)));
}

const suitIndex = (s: Suit) => SUITS.indexOf(s);

// Four-colour deck for readability: ♥ red, ♦ blue, ♣ green, ♠ black.
const SUIT_CLASS: Record<Suit, string> = {
  clubs: "s-club",
  diamonds: "s-diamond",
  hearts: "s-heart",
  spades: "s-spade",
};

function sortHand(hand: readonly Card[], mode: SortMode): Card[] {
  const cmp =
    mode === "suit"
      ? (a: Card, b: Card) =>
          a.suit !== b.suit ? suitIndex(a.suit) - suitIndex(b.suit) : rankOrder(b.rank) - rankOrder(a.rank)
      : (a: Card, b: Card) =>
          rankOrder(a.rank) !== rankOrder(b.rank)
            ? rankOrder(b.rank) - rankOrder(a.rank)
            : suitIndex(a.suit) - suitIndex(b.suit);
  return [...hand].sort(cmp);
}

function applyCustomOrder(hand: readonly Card[], order: string[]): Card[] {
  const byId = new Map(hand.map((c) => [cardId(c), c] as const));
  const out: Card[] = [];
  for (const id of order) {
    const c = byId.get(id);
    if (c) {
      out.push(c);
      byId.delete(id);
    }
  }
  out.push(...sortHand([...byId.values()], "suit"));
  return out;
}

/* --------------------------------- icons --------------------------------- */
// Consistent line icons (Feather-style: 24×24, stroke = currentColor).
function Icon({ name, size = 22 }: { name: "card" | "gear" | "chart" | "people" | "back"; size?: number }) {
  const svg = (children: ReactNode) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
  switch (name) {
    case "card":
      return svg(
        <>
          <rect x="3" y="6" width="11" height="15" rx="2" transform="rotate(-9 8.5 13.5)" />
          <rect x="10" y="3" width="11" height="15" rx="2" transform="rotate(8 15.5 10.5)" />
        </>,
      );
    case "gear":
      return svg(
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
        </>,
      );
    case "chart":
      return svg(
        <>
          <line x1="6" y1="20" x2="6" y2="13" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="18" y1="20" x2="18" y2="9" />
        </>,
      );
    case "people":
      return svg(
        <>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>,
      );
    case "back":
      return svg(
        <>
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </>,
      );
  }
}

function CardView({
  card,
  selected,
  inMeld,
  isNew,
  mustPlay,
  interactive,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  card: Card;
  selected?: boolean;
  inMeld?: boolean;
  isNew?: boolean;
  mustPlay?: boolean;
  interactive?: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
}) {
  const cls = ["card", SUIT_CLASS[card.suit]];
  if (selected) cls.push("selected");
  if (inMeld) cls.push("inmeld");
  if (isNew) cls.push("new");
  if (mustPlay) cls.push("mustplay");
  return (
    <button
      type="button"
      data-card-id={cardId(card)}
      className={cls.join(" ")}
      disabled={!interactive}
      style={interactive ? { touchAction: "none" } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {cardLabel(card)}
      {mustPlay && <span className="tag tag-play">play</span>}
      {isNew && !mustPlay && <span className="tag tag-new">new</span>}
    </button>
  );
}

function MeldChip({ meld, onClick, active }: { meld: Meld; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      className={`meld ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={!onClick}
      title={meld.kind}
    >
      {meld.cards.map((c) => (
        <span key={cardId(c)} className={`mc ${SUIT_CLASS[c.suit]}`}>
          {cardLabel(c)}
        </span>
      ))}
    </button>
  );
}

/* ------------------------------ round reveal ----------------------------- */

function RoundReveal({
  state,
  me,
  wins,
  target,
  matchOver,
  canControlMatch,
  moneyDelta,
  onNext,
  onNewMatch,
  onReview,
  onExit,
}: {
  state: GameState;
  me: number;
  wins: number[];
  target: number;
  matchOver: boolean;
  canControlMatch: boolean;
  moneyDelta?: number | null;
  onNext: () => void;
  onNewMatch: () => void;
  onReview: () => void;
  onExit: () => void;
}) {
  const r = state.result!;
  const pts = r.handPoints;
  const isMe = (i: number) => i === me;
  const name = (i: number) => (isMe(i) ? "You" : state.players[i].name);
  const winnerName = r.winner >= 0 ? name(r.winner) : null;
  const champion = matchOver ? wins.findIndex((w) => w >= target) : -1;

  const youWon = r.winner === me;
  const verb = youWon ? "win" : "wins";

  const title =
    r.reason === "tongits" ? "Tongits!" : r.reason === "showdown" ? "Laban!" : "Stock empty";
  const subtitle =
    r.reason === "tongits"
      ? `${winnerName} emptied ${youWon ? "your" : "their"} hand`
      : r.reason === "showdown"
        ? `${name(r.caller ?? r.winner)} called — lowest hand wins`
        : "Draw pile ran out — lowest hand wins";

  const verdict =
    r.winner < 0
      ? "It's a tie."
      : r.reason === "tongits"
        ? `${winnerName} ${verb} by Tongits 🎉`
        : `${winnerName} ${verb} with ${pts[r.winner]} pts`;

  // Per-player splash word over each avatar.
  const badge = (i: number): string | null => {
    if (i === r.winner) return r.reason === "tongits" ? "TONGITS!" : r.tupong ? "TUPONG" : "DAOG";
    if (r.winner < 0) return null;
    return state.players[i].melds.length === 0 ? "SUNOG" : "LUPIG"; // no meld down = burned
  };

  return (
    <div className="reveal-backdrop">
      <div className="reveal">
        <h2 className={`reveal-title ${r.reason}`}>{title}</h2>
        <p className="reveal-sub">{subtitle}</p>

        <div className="reveal-players">
          {state.players.map((p, i) => {
            const ordered = sortHand(p.hand, "suit");
            const ids = meldCardIds(p.hand);
            return (
              <div key={p.id} className={`rp ${i === r.winner ? "win" : ""}`}>
                <div className="rp-head">
                  <strong>
                    {i === r.winner ? "👑 " : ""}
                    {p.avatar} {name(i)}
                  </strong>
                  <span className="rp-right">
                    {badge(i) && (
                      <span className={`outcome ${i === r.winner ? "win" : "lose"}`}>{badge(i)}</span>
                    )}
                    <span className="rp-pts">{pts[i]} unmatched</span>
                  </span>
                </div>
                {p.melds.length > 0 && (
                  <div className="melds">
                    {p.melds.map((m, mi) => (
                      <MeldChip key={mi} meld={m} />
                    ))}
                  </div>
                )}
                <div className="rp-hand">
                  {p.hand.length === 0 ? (
                    <span className="rp-empty">— empty hand —</span>
                  ) : (
                    ordered.map((c) => (
                      <CardView key={cardId(c)} card={c} inMeld={ids.has(cardId(c))} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="reveal-verdict">{verdict}</div>

        {moneyDelta != null && moneyDelta !== 0 && (
          <div className={`reveal-money ${moneyDelta > 0 ? "up" : "down"}`}>
            {moneyDelta > 0 ? `+₱${moneyDelta}` : `−₱${Math.abs(moneyDelta)}`}
          </div>
        )}

        <div className="reveal-score">
          {state.players.map((p, i) => (
            <span key={p.id} className={i === champion ? "sb-player champ" : "sb-player"}>
              {name(i)} <strong>{wins[i]}</strong>
            </span>
          ))}
          <span className="sb-label">to {target}</span>
        </div>

        {matchOver && (
          <div className="reveal-match">
            {champion === me ? "You win the match! 🏆" : `${name(champion)} wins the match.`}
          </div>
        )}

        {canControlMatch ? (
          <button className="reveal-replay" onClick={matchOver ? onNewMatch : onNext}>
            {matchOver ? "New match" : "Next game"}
          </button>
        ) : (
          <div className="reveal-wait">
            Waiting for host to {matchOver ? "start a new match" : "deal the next game"}…
          </div>
        )}

        <div className="reveal-links">
          <button className="link-btn" onClick={onReview}>
            Game Review
          </button>
          <button className="link-btn" onClick={onExit}>
            Home
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ game review ------------------------------ */

// Accumulate a per-ply snapshot of the round for post-game review. The log grows
// by one+ line per action, so a longer log = a new ply; a shorter log = new round.
function useGameHistory(state: GameState) {
  const hist = useRef<GameState[]>([]);
  useEffect(() => {
    const arr = hist.current;
    const last = arr[arr.length - 1];
    if (!last || state.log.length < last.log.length) hist.current = [state];
    else if (state.log.length > last.log.length) arr.push(state);
  }, [state]);
  return hist;
}

// Spin up the worker once when the review opens; report progress + the engine grades.
function useAnalysis(history: GameState[], seat: number) {
  const [progress, setProgress] = useState(0);
  const [grades, setGrades] = useState<TurnGrade[] | null>(null);
  useEffect(() => {
    const worker = new Worker(new URL("./workers/analysis.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === "progress") setProgress(d.fraction);
      else if (d.type === "done") {
        setGrades(d.grades);
        setProgress(1);
      }
    };
    worker.postMessage({ history, seat, samples: 48 });
    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { progress, grades };
}

const GRADE_LABEL: Record<Grade, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
};

function WinGraph({
  grades,
  current,
  onSelect,
}: {
  grades: TurnGrade[];
  current?: number;
  onSelect?: (i: number) => void;
}) {
  const W = 520;
  const H = 130;
  const pad = 8;
  const n = grades.length;
  const x = (i: number) => (n === 1 ? W / 2 : pad + (i / (n - 1)) * (W - 2 * pad));
  const y = (pct: number) => pad + (1 - pct / 100) * (H - 2 * pad);
  const line = grades.map((g, i) => `${x(i)},${y(g.yourPct)}`).join(" ");
  const area =
    `M ${x(0)},${H - pad} ` +
    grades.map((g, i) => `L ${x(i)},${y(g.yourPct)}`).join(" ") +
    ` L ${x(n - 1)},${H - pad} Z`;
  return (
    <svg className="wingraph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="win odds graph">
      <line className="wg-mid" x1={pad} x2={W - pad} y1={y(50)} y2={y(50)} />
      <path className="wg-area" d={area} />
      <polyline className="wg-line" points={line} />
      {current != null && <line className="wg-cursor" x1={x(current)} x2={x(current)} y1={pad} y2={H - pad} />}
      {grades.map((g, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(g.yourPct)}
          r={current === i ? 5.5 : 3.6}
          className={`wg-dot grade-${g.grade} ${current === i ? "active" : ""} ${onSelect ? "clickable" : ""}`}
          onClick={onSelect ? () => onSelect(i) : undefined}
        />
      ))}
    </svg>
  );
}

function reviewToText(result: ReturnType<typeof reviewRound>, grades: TurnGrade[] | null): string {
  const out: string[] = ["Tongits — Game Review", ""];
  if (grades && grades.length) {
    out.push("Win odds: " + grades.map((g) => `T${g.turn} ${g.yourPct}%`).join("  "), "");
  }
  out.push("Summary:", ...result.summary.map((s) => "- " + s), "");
  const byTurn = new Map(result.turns.map((t) => [t.turn, t]));
  for (const g of grades ?? []) {
    const t = byTurn.get(g.turn);
    const opp = t ? t.opponents.map((o) => `${o.name} ${o.cards}c/${o.melds}m`).join(", ") : "";
    out.push(
      `Turn ${g.turn} — ${GRADE_LABEL[g.grade]} · ${g.yourPct}% (best ${g.bestPct}%)${
        t ? ` · ${t.deadwoodPts} pts` : ""
      }${opp ? " · " + opp : ""}`,
    );
    if (g.reason) out.push(`  → ${g.reason}`);
    if (g.discards.length > 1)
      out.push(
        "  discard: " +
          g.discards
            .map((d) => `${d.label} ${d.pct}%${d.laidMeld ? "+meld" : ""}${d.cardId === g.yourDiscard ? "(you)" : ""}`)
            .join("  ") +
          (g.moreDiscards > 0 ? `  +${g.moreDiscards} weaker` : ""),
      );
    if (t) for (const d of t.draws) out.push(`  ${d.held.map(cardLabel).join(" ")}  ${d.kind}  ${d.outsLive}/${d.outsMax} outs  ${Math.round(d.probability * 100)}%`);
    out.push("");
  }
  return out.join("\n");
}

// Step through your turns: your full hand + melds and each opponent's melds, with
// the engine's grade/reason for the play you actually made on that turn.
function ReplayBoard({
  history,
  me,
  grades,
  result,
  step,
  setStep,
}: {
  history: GameState[];
  me: number;
  grades: TurnGrade[];
  result: ReturnType<typeof reviewRound>;
  step: number;
  setStep: (i: number) => void;
}) {
  const segments = useMemo(() => roundSegments(history, me), [history, me]);
  const n = Math.min(segments.length, grades.length);
  const i = Math.max(0, Math.min(n - 1, step));
  const seg = segments[i];
  const g = grades[i];
  const t = result.turns.find((x) => x.turn === g.turn);
  const meP = seg.first.players[me];
  const handIds = meldCardIds(meP.hand);
  const hand = [...meP.hand].sort(
    (a, b) => suitIndex(a.suit) - suitIndex(b.suit) || rankOrder(a.rank) - rankOrder(b.rank),
  );
  const handById = new Map(meP.hand.map((c) => [cardId(c), c] as const));
  const opponents = seg.first.players.map((p, pi) => ({ p, pi })).filter((x) => x.pi !== me);

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
          <strong>{g.yourPct}%</strong>
          {g.bestPct > g.yourPct && <span className="rv-best"> best {g.bestPct}%</span>}
        </div>
        <button
          className="rp-arrow"
          onClick={() => setStep(i + 1)}
          disabled={i === n - 1}
          aria-label="Next play"
        >
          ›
        </button>
      </div>

      {g.reason && <div className="rv-reason">{g.reason}</div>}

      <div className="rp-section">
        <div className="rp-label">
          Your hand · {meP.hand.length} cards
          <span className="rp-legend">
            <span className="rp-key discarded">▦ discarded</span>
            {g.bestDiscard && <span className="rp-key shoulda">▦ should’ve</span>}
          </span>
        </div>
        <div className="rp-hand">
          {hand.map((c) => {
            const id = cardId(c);
            const mark =
              id === g.yourDiscard ? "discarded" : id === g.bestDiscard ? "shoulda" : "";
            return (
              <span
                key={id}
                className={`mc ${SUIT_CLASS[c.suit]} ${handIds.has(id) ? "" : "loose"} ${mark}`}
              >
                {cardLabel(c)}
              </span>
            );
          })}
        </div>
      </div>

      {g.discards.length > 1 && (
        <div className="rp-section">
          <div className="rp-label">If you discard… · projected win %</div>
          <div className="rp-discards">
            {g.discards.map((d) => {
              const c = handById.get(d.cardId);
              const isYou = d.cardId === g.yourDiscard;
              const isBest = d.cardId === g.discards[0].cardId;
              return (
                <div className={`rp-disc ${isYou ? "you" : ""}`} key={d.cardId}>
                  {c && (
                    <span className={`mc ${SUIT_CLASS[c.suit]}`}>{cardLabel(c)}</span>
                  )}
                  <div className="rp-disc-bar">
                    <div
                      className={`rp-disc-fill ${isBest ? "best" : ""}`}
                      style={{ width: `${Math.max(2, d.pct)}%` }}
                    />
                  </div>
                  <span className="rp-disc-pct">{d.pct}%</span>
                  {d.laidMeld && <span className="rp-disc-tag">+meld</span>}
                  {isBest && <span className="rp-disc-tag best">best</span>}
                  {isYou && <span className="rp-disc-tag you">you</span>}
                </div>
              );
            })}
          </div>
          {g.moreDiscards > 0 && (
            <div className="rp-disc-more">+{g.moreDiscards} weaker discard{g.moreDiscards > 1 ? "s" : ""}</div>
          )}
        </div>
      )}

      <div className="rp-section">
        <div className="rp-label">Your melds</div>
        {meP.melds.length ? (
          <div className="rp-melds">
            {meP.melds.map((m, mi) => (
              <MeldChip key={mi} meld={m} />
            ))}
          </div>
        ) : (
          <div className="rp-empty">— none down yet —</div>
        )}
      </div>

      {t && t.draws.length > 0 && (
        <div className="rp-section">
          <div className="rp-label">Draws you're building</div>
          <div className="rv-draws">
            {t.draws.map((d, di) => (
              <div className="rv-draw" key={di}>
                <span className="rv-cards">
                  {d.held.map((c) => (
                    <span key={cardId(c)} className={`mc ${SUIT_CLASS[c.suit]}`}>
                      {cardLabel(c)}
                    </span>
                  ))}
                </span>
                <span className="rv-odds-wrap">
                  <span className={`rv-odds ${d.outsLive === 0 ? "dead" : d.probability < 0.15 ? "low" : ""}`}>
                    {d.outsLive}/{d.outsMax} outs · {Math.round(d.probability * 100)}%
                  </span>
                  {d.gone.length > 0 && (
                    <span className="rv-gone">
                      {d.outsLive === 0 ? "dead — " : "needs "}
                      {d.gone.map(cardLabel).join(", ")} gone
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rp-section">
        <div className="rp-label">Opponents</div>
        {opponents.map(({ p }) => (
          <div key={p.name} className="rp-opp">
            <div className="rp-opp-head">
              {p.name} · {p.hand.length} cards
            </div>
            {p.melds.length ? (
              <div className="rp-melds">
                {p.melds.map((m, mi) => (
                  <MeldChip key={mi} meld={m} />
                ))}
              </div>
            ) : (
              <div className="rp-empty">— no melds —</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GameReview({ history, me, onClose }: { history: GameState[]; me: number; onClose: () => void }) {
  const result = useMemo(() => reviewRound(history, me), [history, me]);
  const { progress, grades } = useAnalysis(history, me);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(0);
  const recorded = useRef(false);

  // Once the engine finishes, fold these grades into the cross-game coach (once).
  useEffect(() => {
    if (grades && grades.length && !recorded.current) {
      recorded.current = true;
      recordAnalysis(grades);
    }
  }, [grades]);

  function copy() {
    void navigator.clipboard?.writeText(reviewToText(result, grades));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="reveal-backdrop">
      <div className="reveal review">
        <h2 className="reveal-title">Game Review</h2>

        {grades ? (
          grades.length > 0 && (
            <>
              <div className="wg-caption">
                Win odds · {grades[0].yourPct}% → <strong>{grades[grades.length - 1].yourPct}%</strong>
                <span className="wg-legend"> · dot colour = play grade</span>
              </div>
              <WinGraph grades={grades} current={Math.min(step, grades.length - 1)} onSelect={setStep} />
            </>
          )
        ) : (
          <div className="wg-progress">
            <div>Analyzing your play… {Math.round(progress * 100)}%</div>
            <div className="wg-bar">
              <div className="wg-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )}

        <div className="review-summary">
          {result.summary.map((s, i) => (
            <div key={i}>{s}</div>
          ))}
        </div>
        {grades && grades.length > 0 && (
          <ReplayBoard history={history} me={me} grades={grades} result={result} step={step} setStep={setStep} />
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

/* -------------------------------- table ---------------------------------- */

function Table({
  state,
  me,
  wins,
  target,
  matchOver,
  onAction,
  onNext,
  onNewMatch,
  onExit,
  canControlMatch,
  headerExtra,
  statusNote,
  banner,
  balance,
  moneyDelta,
}: {
  state: GameState;
  me: number;
  wins: number[];
  target: number;
  matchOver: boolean;
  onAction: (next: GameState) => void;
  onNext: () => void;
  onNewMatch: () => void;
  onExit: () => void;
  canControlMatch: boolean;
  headerExtra?: ReactNode;
  statusNote?: string;
  banner?: ReactNode;
  balance?: number;
  moneyDelta?: number | null;
}) {
  const [selected, setSelected] = useState<Card[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("suit");
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [event, setEvent] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const lastLogLen = useRef(state.log.length);
  const history = useGameHistory(state);

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 2800);
  }

  // Surface new sapaw events as an on-screen toast so the burn timing is visible.
  useEffect(() => {
    if (state.log.length > lastLogLen.current) {
      const fresh = state.log.slice(lastLogLen.current);
      const sapawLine = [...fresh].reverse().find((l) => /sapaw/i.test(l));
      if (sapawLine) setEvent(sapawLine);
    }
    lastLogLen.current = state.log.length;
  }, [state.log]);
  useEffect(() => {
    if (!event) return;
    const t = window.setTimeout(() => setEvent(null), 4500);
    return () => window.clearTimeout(t);
  }, [event]);

  const isMyTurn = !state.result && state.current === me;
  const meP = state.players[me];
  const sel = (c: Card) => selected.some((s) => cardId(s) === cardId(c));

  function toggle(card: Card) {
    if (!isMyTurn || state.phase !== "action") return;
    setSelected((prev) =>
      prev.some((s) => cardId(s) === cardId(card))
        ? prev.filter((s) => cardId(s) !== cardId(card))
        : [...prev, card],
    );
  }

  function act(next: GameState) {
    onAction(next);
    setSelected([]);
  }

  const inAction = isMyTurn && state.phase === "action";
  const inDraw = isMyTurn && state.phase === "draw";
  const mustPlay = state.mustPlay;
  const selectedMeld = classifyMeld(selected);

  // The first meld the selected card(s) can ALL lay onto (own, or an opponent's
  // if allowed) — so Buklad can sapaw one or several cards, not just lay melds.
  function firstSapawTarget(cards: Card[]): { pi: number; mi: number } | null {
    if (cards.length === 0) return null;
    for (let pi = 0; pi < state.players.length; pi++) {
      if (pi !== state.current && !state.rules.allowSapawOnOpponents) continue;
      const melds = state.players[pi].melds;
      for (let mi = 0; mi < melds.length; mi++) {
        if (canLayOffMany(melds[mi], cards)) return { pi, mi };
      }
    }
    return null;
  }
  const sapawTarget = inAction && selected.length >= 1 ? firstSapawTarget(selected) : null;

  const canDiscard = inAction && selected.length === 1 && !mustPlay;
  const canBaba = inAction && (selectedMeld !== null || sapawTarget !== null);
  const canCall = inDraw && canCallFight(state);
  const canTake = inDraw && canTakeDiscard(state);

  function buklad() {
    if (selectedMeld) act(layMeld(state, selected));
    else if (sapawTarget) act(sapawMany(state, sapawTarget.pi, sapawTarget.mi, selected));
  }

  function takeDiscard() {
    const top = topDiscard(state);
    if (!top) return;
    if (!canTakeDiscard(state)) {
      flash("You can only take the discard if it completes a meld (or lays onto one).");
      return;
    }
    onAction(draw(state, "discard"));
    setSelected([top]); // auto-raise + select the taken card, ready to Buklad/sapaw
  }

  function onMeldClick(playerIndex: number, meldIndex: number) {
    if (!inAction || selected.length < 1) return;
    const meld = state.players[playerIndex].melds[meldIndex];
    if (canLayOffMany(meld, selected)) act(sapawMany(state, playerIndex, meldIndex, selected));
  }

  const sapawLocked = state.rules.sapawLockAllRound ? meP.burned : state.labanBlocked;
  const instruction = !isMyTurn
    ? statusNote ?? `Waiting for ${state.players[state.current].name}…`
    : inDraw
      ? sapawLocked
        ? "Imo turno — Laban is locked (your meld was sapaw'd). Bulit (draw), or Kawat the pile to Buklad it."
        : "Imo turno — Bulit (draw), Kawat the pile to Buklad (meld), or Laban!"
      : mustPlay
        ? `You took ${cardLabel(mustPlay)} — Buklad it (meld or sapaw) before you Labyog.`
        : state.lastDrawn
          ? `You drew ${cardLabel(state.lastDrawn)}. Buklad what you can, then Labyog.`
          : "Buklad what you can, then Labyog one card.";

  const meldIds = meldCardIds(meP.hand);
  const handOrder = customOrder ? applyCustomOrder(meP.hand, customOrder) : sortHand(meP.hand, sortMode);
  const unmatched = handPoints(deadwood(meP.hand));
  const isMustPlay = (c: Card) => mustPlay != null && cardId(c) === cardId(mustPlay);
  const isNew = (c: Card) => state.lastDrawn != null && cardId(c) === cardId(state.lastDrawn);
  const inMeld = (c: Card) => meldIds.has(cardId(c));

  function onCardDown(e: ReactPointerEvent, card: Card) {
    drag.current = { id: cardId(card), x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onCardMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      d.moved = true;
      setCustomOrder(handOrder.map(cardId));
    }
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
      "[data-card-id]",
    );
    const overId = over?.getAttribute("data-card-id");
    if (overId && overId !== d.id) {
      setCustomOrder((prev) => {
        const base = prev ?? handOrder.map(cardId);
        const arr = base.filter((x) => x !== d.id);
        const idx = arr.indexOf(overId);
        if (idx < 0) return base;
        arr.splice(idx, 0, d.id);
        return arr;
      });
    }
  }
  function onCardUp(card: Card) {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) toggle(card);
  }

  const opponents = state.players.map((p, i) => ({ p, i })).filter(({ i }) => i !== me);

  return (
    <main className="app">
      {event && <div className="event-toast">🔥 {event}</div>}

      <header className="top">
        <h1>Tongits</h1>
        <div className="newgame">{headerExtra}</div>
      </header>

      <section className="scoreboard">
        <span className="sb-label">Games to {target}</span>
        {state.players.map((p, i) => (
          <span key={p.id} className="sb-player">
            {p.avatar} {i === me ? "You" : p.name} <strong>{wins[i]}</strong>
          </span>
        ))}
        {balance != null && <span className="sb-money">₱{balance}</span>}
      </section>

      {banner}

      <section className="opponents">
        {opponents.map(({ p, i }) => (
          <div key={p.id} className={`opp ${state.current === i ? "turn" : ""}`}>
            <div className="opp-head">
              <strong>
                {p.avatar} {p.name}
              </strong>
              <span className="count">{p.hand.length} cards</span>
            </div>
            <div className="melds">
              {p.melds.map((m, mi) => (
                <MeldChip
                  key={mi}
                  meld={m}
                  active={selected.length >= 1 && canLayOffMany(m, selected)}
                  onClick={() => onMeldClick(i, mi)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="center">
        <button
          type="button"
          className="pile stock"
          disabled={!inDraw}
          onClick={() => act(draw(state, "stock"))}
        >
          <span className="pile-label">Bulit</span>
          <span className="pile-count">{state.stock.length}</span>
        </button>

        <button
          type="button"
          className={`pile discard ${canTake ? "takeable" : inDraw ? "notyet" : ""}`}
          disabled={!(inDraw && !!topDiscard(state))}
          onClick={takeDiscard}
        >
          <span className="pile-label">Kawat</span>
          {topDiscard(state) ? (
            <span className={`pile-top ${SUIT_CLASS[topDiscard(state)!.suit]}`}>
              {cardLabel(topDiscard(state)!)}
            </span>
          ) : (
            <span className="pile-top empty">—</span>
          )}
        </button>
      </section>

      {meP.melds.length > 0 && (
        <section className="your-melds">
          <div className="section-label">Your melds</div>
          <div className="melds">
            {meP.melds.map((m, mi) => (
              <MeldChip
                key={mi}
                meld={m}
                active={selected.length >= 1 && canLayOffMany(m, selected)}
                onClick={() => onMeldClick(me, mi)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="hand-area">
        <div className="section-label">
          Your hand · <strong>{unmatched}</strong> unmatched pts
          <span className="legend"> · green = meld · drag to reorder</span>
        </div>
        <div className="hand-controls">
          <span className="sort-label">Sort</span>
          <button
            className={!customOrder && sortMode === "suit" ? "on" : ""}
            onClick={() => {
              setCustomOrder(null);
              setSortMode("suit");
            }}
          >
            Suit
          </button>
          <button
            className={!customOrder && sortMode === "rank" ? "on" : ""}
            onClick={() => {
              setCustomOrder(null);
              setSortMode("rank");
            }}
          >
            Rank
          </button>
          {customOrder && <button onClick={() => setCustomOrder(null)}>Reset</button>}
        </div>
        <div className="instruction">{instruction}</div>
        <div className="hand">
          {handOrder.map((c) => (
            <CardView
              key={cardId(c)}
              card={c}
              selected={sel(c)}
              isNew={isNew(c)}
              mustPlay={isMustPlay(c)}
              inMeld={inMeld(c)}
              interactive
              onPointerDown={(e) => onCardDown(e, c)}
              onPointerMove={onCardMove}
              onPointerUp={() => onCardUp(c)}
            />
          ))}
        </div>
      </section>

      {notice && <div className="notice">{notice}</div>}

      <section className="actions">
        <button disabled={!canBaba} onClick={buklad}>
          {selectedMeld ? `Buklad (${selectedMeld.kind})` : sapawTarget ? "Sapaw" : "Buklad"}
        </button>
        <button disabled={!canDiscard} onClick={() => act(discard(state, selected[0]))}>
          Labyog
        </button>
        <button className="laban" disabled={!canCall} onClick={() => act(callFight(state))}>
          Laban!
        </button>
      </section>

      {state.result && (
        <RoundReveal
          state={state}
          me={me}
          wins={wins}
          target={target}
          matchOver={matchOver}
          canControlMatch={canControlMatch}
          moneyDelta={moneyDelta}
          onNext={onNext}
          onNewMatch={onNewMatch}
          onReview={() => setReviewing(true)}
          onExit={onExit}
        />
      )}

      {reviewing && (
        <GameReview history={history.current} me={me} onClose={() => setReviewing(false)} />
      )}

      <section className="log">
        {state.log.slice(-5).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </section>
    </main>
  );
}

/* ------------------------------ local game ------------------------------- */

function LocalGame({ onExit }: { onExit: () => void }) {
  const { state, setState, wins, target, matchOver, nextGame, newMatch } = useGame(1);
  return (
    <Table
      state={state}
      me={0}
      wins={wins}
      target={target}
      matchOver={matchOver}
      onAction={setState}
      onNext={nextGame}
      onNewMatch={() => newMatch((state.players.length - 1) as 1 | 2)}
      onExit={onExit}
      canControlMatch
      headerExtra={
        <>
          <button onClick={() => newMatch(1)}>1 bot</button>
          <button onClick={() => newMatch(2)}>2 bots</button>
          <button onClick={onExit}>Exit</button>
        </>
      }
    />
  );
}

/* ------------------------------ invite/share ----------------------------- */

function inviteUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}?join=${code}`;
}

function ShareControls({ code, big }: { code: string; big?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function share() {
    const url = inviteUrl(code);
    const text = `Join my Tongits game 🃏  Code: ${code}`;
    try {
      // On iPhone this opens the native sheet (WhatsApp, Messenger, Messages…).
      await navigator.share({ title: "Tongits", text, url });
    } catch {
      /* user dismissed the sheet — no-op */
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${inviteUrl(code)}`);
      setMsg("Copied!");
    } catch {
      setMsg("Copy failed");
    }
    setTimeout(() => setMsg(null), 1500);
  }

  return (
    <span className={`share ${big ? "big" : ""}`}>
      {canShare && (
        <button className="primary" onClick={share}>
          Send invite
        </button>
      )}
      <button onClick={copy}>{msg ?? "Copy link"}</button>
    </span>
  );
}

/* ------------------------------ online game ------------------------------ */

// Settle a wallet at most once per game, surviving reloads.
function settleKey(code: string, gameId: number): string {
  return `${code}:${gameId}`;
}
function alreadySettled(key: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem("tongits.settled") ?? "[]") as string[]).includes(key);
  } catch {
    return false;
  }
}
function markSettled(key: string): void {
  try {
    const a = JSON.parse(localStorage.getItem("tongits.settled") ?? "[]") as string[];
    a.push(key);
    localStorage.setItem("tongits.settled", JSON.stringify(a.slice(-300)));
  } catch {
    /* ignore */
  }
}

function OnlineGame({
  code,
  isHost,
  me,
  account,
  onBalance,
  onExit,
}: {
  code: string;
  isHost: boolean;
  me: number;
  account: Account | null;
  onBalance: (b: number) => void;
  onExit: () => void;
}) {
  const { game, wins, gameId, target, matchOver, connected, dispatch, nextGame, newMatch } =
    useOnlineMatch(code, isHost);
  const [moneyDelta, setMoneyDelta] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // When a round ends, settle this seat's wallet exactly once.
  const result = game?.result;
  useEffect(() => {
    if (!result || !game) {
      setMoneyDelta(null);
      return;
    }
    const key = settleKey(code, gameId);
    if (alreadySettled(key)) return;
    markSettled(key);
    const delta = settlementDelta(game, me);
    setMoneyDelta(delta || null);
    if (delta !== 0) void addBalance(delta).then((b) => b != null && onBalance(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, gameId]);

  // Warn before a refresh / tab-close / back-navigation drops you out of the game.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const leave = () => setConfirmLeave(true);

  const leaveModal = confirmLeave ? (
    <div className="reveal-backdrop">
      <div className="reveal" style={{ maxWidth: 320 }}>
        <h2 className="reveal-title">Leave game?</h2>
        <p className="reveal-sub">The game stays open — you can rejoin with the code.</p>
        <div className="modal-actions">
          <button onClick={() => setConfirmLeave(false)}>Stay</button>
          <button className="big" onClick={onExit}>
            Leave
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (!game) {
    return (
      <main className="app center-screen">
        {leaveModal}
        <h1>Tongits</h1>
        <p>{connected ? "Connecting to game…" : "Loading…"}</p>
        <p className="code-line">
          Game code: <strong>{code}</strong>
        </p>
        <button onClick={leave}>Leave</button>
      </main>
    );
  }

  const otherName = game.players.find((_, i) => i !== me)?.name ?? "opponent";
  const waiting = `Waiting for ${otherName}…`;
  // The guest's seat keeps its placeholder name until they actually join.
  const waitingForGuest =
    isHost && !!game.players[1] && !game.players[1].isAI && game.players[1].name === "Player 2";

  return (
    <>
      {leaveModal}
      <Table
        state={game}
      me={me}
      wins={wins}
      target={target}
      matchOver={matchOver}
      onAction={(next) => dispatch(next)}
      onNext={nextGame}
      onNewMatch={newMatch}
      onExit={onExit}
      canControlMatch={isHost}
      statusNote={waiting}
      balance={account?.balance}
      moneyDelta={moneyDelta}
      banner={
        waitingForGuest ? (
          <section className="invite">
            <div className="invite-title">Invite your friend</div>
            <div className="invite-code">{code}</div>
            <ShareControls code={code} big />
            <div className="invite-hint">They tap your link, or enter this code → Join.</div>
          </section>
        ) : undefined
      }
      headerExtra={
        <>
          <span className="code-chip">
            Code <strong>{code}</strong>
          </span>
          <ShareControls code={code} />
          <button onClick={leave}>Leave</button>
        </>
      }
      />
    </>
  );
}

/* --------------------------------- lobby --------------------------------- */

type Mode =
  | { kind: "lobby" }
  | { kind: "local" }
  | { kind: "online"; code: string; isHost: boolean; me: number };

/* ------------------------------ sub-screens ------------------------------ */

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="screen-head">
      <button className="back-btn" onClick={onBack} aria-label="Back">
        <Icon name="back" size={20} />
      </button>
      <h1>{title}</h1>
    </header>
  );
}

/* ------------------------------ house rules ------------------------------ */

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rule-row">
      <span>{label}</span>
      <button className={`switch ${value ? "on" : ""}`} onClick={() => onChange(!value)}>
        {value ? "On" : "Off"}
      </button>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rule-row">
      <span>{label}</span>
      <span className="stepper">
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          −
        </button>
        <strong>{value}</strong>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          +
        </button>
      </span>
    </div>
  );
}

function RulesEditor({ onBack }: { onBack: () => void }) {
  const [rules, setRules] = useState<RuleSet>(loadRules);
  function update(patch: Partial<RuleSet>) {
    const r = { ...rules, ...patch };
    setRules(r);
    saveRules(r);
  }
  const stockOpts: [StockExhaustionRule, string][] = [
    ["lowestHandWins", "Lowest hand wins"],
    ["lastDrawerLoses", "Last drawer loses"],
  ];

  return (
    <main className="app screen">
      <ScreenHeader title="House Rules" onBack={onBack} />
      <div className="screen-body">
      <div className="rules-list">
        <Stepper
          label="Games to win the match"
          value={rules.gamesToWin}
          min={1}
          max={11}
          onChange={(v) => update({ gamesToWin: v })}
        />
        <Toggle
          label="Laban (call a fight)"
          value={rules.enableLaban}
          onChange={(v) => update({ enableLaban: v })}
        />
        <Toggle
          label="Need a meld down to call Laban"
          value={rules.mustHaveMeldToCall}
          onChange={(v) => update({ mustHaveMeldToCall: v })}
        />
        <Toggle
          label="Sapaw on opponents' melds"
          value={rules.allowSapawOnOpponents}
          onChange={(v) => update({ allowSapawOnOpponents: v })}
        />
        <div className="rule-row col">
          <span>When your meld is sapaw'd, no Laban for…</span>
          <div className="segmented">
            <button
              className={rules.sapawLockAllRound ? "on" : ""}
              onClick={() => update({ sapawLockAllRound: true })}
            >
              Rest of round
            </button>
            <button
              className={!rules.sapawLockAllRound ? "on" : ""}
              onClick={() => update({ sapawLockAllRound: false })}
            >
              Next turn only
            </button>
          </div>
        </div>
        <div className="rule-row col">
          <span>When the stock runs out</span>
          <div className="segmented">
            {stockOpts.map(([val, text]) => (
              <button
                key={val}
                className={rules.stockExhaustion === val ? "on" : ""}
                onClick={() => update({ stockExhaustion: val })}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="muted">Applies to games you host (and your practice games).</p>
      </div>
    </main>
  );
}

// Room helpers shared by host/join, challenge, and challenge-accept.
async function hostRoom(profile: Profile, withBot: boolean): Promise<string> {
  const roomCode = makeCode(Math.floor(Math.random() * 1_000_000_000));
  const myName = profile.name || "Player 1";
  const names = withBot ? [myName, "Player 2", "Bot"] : [myName, "Player 2"];
  const avatars = withBot ? [profile.avatar, "🙂", "🤖"] : [profile.avatar, "🙂"];
  const ai = withBot ? [false, false, true] : [false, false];
  const game = newRound(
    { ...loadRules(), playerCount: names.length as 2 | 3 },
    Math.floor(Math.random() * 1_000_000_000),
    names,
    ai,
    0,
    avatars,
  );
  await createRoom(roomCode, { game, wins: names.map(() => 0), gameId: 1, version: 1 });
  return roomCode;
}

async function joinRoomAs(code: string, profile: Profile): Promise<boolean> {
  const data = await fetchRoom(code);
  if (!data) return false;
  data.game.players[1].name = profile.name || "Player 2";
  data.game.players[1].avatar = profile.avatar;
  await pushRoom(code, { ...data, version: data.version + 1 });
  return true;
}

type FriendsHook = ReturnType<typeof useFriends>;

function ChallengePrompt({
  name,
  avatar,
  onAccept,
  onDecline,
}: {
  name: string;
  avatar: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="reveal-backdrop">
      <div className="reveal" style={{ maxWidth: 340 }}>
        <h2 className="reveal-title">Challenge!</h2>
        <p className="reveal-sub">
          {avatar} {name} wants to play Tongits
        </p>
        <div className="lobby-row">
          <button className="big" onClick={onAccept}>
            Accept
          </button>
          <button onClick={onDecline}>Decline</button>
        </div>
      </div>
    </div>
  );
}

function FriendsScreen({
  account,
  fr,
  busy,
  onBack,
  onChallenge,
}: {
  account: Account | null;
  fr: FriendsHook;
  busy: boolean;
  onBack: () => void;
  onChallenge: (friendId: string) => void;
}) {
  const [addCode, setAddCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function add() {
    setMsg(null);
    const found = await findByCode(addCode);
    if (!found) {
      setMsg("No player with that code.");
      return;
    }
    const res = await addFriend(found.id);
    setMsg(
      res === "self"
        ? "That's your own code 🙂"
        : res === "accepted"
          ? `You're now friends with ${found.name}!`
          : res === "exists"
            ? `Already linked with ${found.name}.`
            : `Request sent to ${found.name}.`,
    );
    setAddCode("");
    fr.refresh();
  }

  const onlineCount = fr.friends.filter((f) => f.online).length;

  return (
    <main className="app screen">
      <ScreenHeader title="Friends" onBack={onBack} />
      <div className="screen-body">
      {account && (
        <div className="lobby-section narrow">
          <div className="lobby-title">Your friend code</div>
          <div className="invite-code">{account.friendCode}</div>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(account.friendCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied!" : "Copy code"}
          </button>
        </div>
      )}

      <div className="lobby-section narrow">
        <div className="lobby-title">Add a friend by code</div>
        <div className="lobby-row">
          <input
            placeholder="Friend code"
            value={addCode}
            onChange={(e) => setAddCode(e.target.value)}
            maxLength={6}
            style={{ textTransform: "uppercase" }}
          />
          <button disabled={addCode.trim().length < 4} onClick={add}>
            Add
          </button>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </div>

      {fr.incoming.length > 0 && (
        <div className="lobby-section narrow">
          <div className="lobby-title">Friend requests</div>
          {fr.incoming.map(({ friendship, profile }) => (
            <div className="friend-row" key={friendship.id}>
              <span>
                {profile.avatar} {profile.name}
              </span>
              <button
                onClick={async () => {
                  await acceptFriend(friendship.id);
                  fr.refresh();
                }}
              >
                Accept
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="lobby-section narrow">
        <div className="lobby-title">
          Friends{fr.friends.length > 0 ? ` · ${onlineCount} online` : ""}
        </div>
        {fr.friends.length === 0 ? (
          <p className="muted">No friends yet — share your code above.</p>
        ) : (
          fr.friends.map(({ friendship, profile, online }) => (
            <div className="friend-row" key={friendship.id}>
              <span>
                <span className={`dot ${online ? "on" : ""}`} /> {profile.avatar} {profile.name}
              </span>
              <button disabled={!online || busy} onClick={() => onChallenge(profile.id)}>
                {online ? "Challenge" : "Offline"}
              </button>
            </div>
          ))
        )}
      </div>

      </div>
    </main>
  );
}

const GRADE_ORDER: Grade[] = ["best", "good", "inaccuracy", "mistake"];

function CoachScreen({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<CoachStats>(loadCoach);
  const acc = accuracy(stats);
  const gap = avgGap(stats);

  return (
    <main className="app screen">
      <ScreenHeader title="Coach" onBack={onBack} />
      <div className="screen-body">
      {stats.turns === 0 ? (
        <p className="muted">Review a finished game — I'll track how sharply you play here.</p>
      ) : (
        <>
          <div className="coach-head">
            {stats.games} games · {stats.turns} turns reviewed
          </div>
          <div className="coach-headline">
            Accuracy: <strong>{acc}%</strong> · giving up <strong>{gap}%</strong> win odds per turn
          </div>
          <div className="rules-list">
            {GRADE_ORDER.map((gr) => {
              const count = stats.grades[gr];
              const rate = stats.turns ? count / stats.turns : 0;
              return (
                <div key={gr} className="leak-row">
                  <div className="leak-top">
                    <span className={`rv-grade grade-${gr}`}>{GRADE_LABEL[gr]}</span>
                    <span className="leak-rate">{Math.round(rate * 100)}% of turns</span>
                  </div>
                  <div className="leak-bar">
                    <div
                      className={`leak-bar-fill grade-${gr}`}
                      style={{ width: `${Math.min(100, Math.round(rate * 100))}%` }}
                    />
                  </div>
                  <div className="leak-fix">{count}× total</div>
                </div>
              );
            })}
          </div>
          <button
            className="link-btn"
            onClick={() => {
              resetCoach();
              setStats(loadCoach());
            }}
          >
            Reset stats
          </button>
        </>
      )}
      </div>
    </main>
  );
}

function Lobby({
  onStart,
  initialCode,
  account,
  onUpdateProfile,
}: {
  onStart: (m: Mode) => void;
  initialCode?: string;
  account: Account | null;
  onUpdateProfile: (patch: Partial<Pick<Account, "name" | "avatar">>) => void;
}) {
  const [screen, setScreen] = useState<"main" | "rules" | "friends" | "coach">("main");
  const [showAvatars, setShowAvatars] = useState(false);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [code, setCode] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fr = useFriends(account);

  useEffect(() => {
    if (account) setProfile({ name: account.name, avatar: account.avatar });
  }, [account]);

  function localUpdate(p: Profile) {
    setProfile(p);
    saveProfile(p);
  }

  async function host(withBot: boolean) {
    setBusy(true);
    setError(null);
    try {
      onStart({ kind: "online", code: await hostRoom(profile, withBot), isHost: true, me: 0 });
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const clean = code.trim().toUpperCase();
      if (await joinRoomAs(clean, profile)) {
        onStart({ kind: "online", code: clean, isHost: false, me: 1 });
      } else {
        setError("No game found with that code.");
        setBusy(false);
      }
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  async function challenge(friendId: string) {
    setBusy(true);
    try {
      const roomCode = await hostRoom(profile, false);
      await createChallenge(friendId, roomCode);
      onStart({ kind: "online", code: roomCode, isHost: true, me: 0 });
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  async function acceptChallenge() {
    const ch = fr.challenge;
    if (!ch) return;
    fr.clearChallenge();
    if (await joinRoomAs(ch.room_code, profile)) {
      await respondChallenge(ch.id, "accepted");
      onStart({ kind: "online", code: ch.room_code, isHost: false, me: 1 });
    } else {
      await respondChallenge(ch.id, "declined");
    }
  }

  const challenger = fr.challenge
    ? fr.friends.find((f) => f.profile.id === fr.challenge!.from_id)?.profile
    : null;
  const prompt = fr.challenge ? (
    <ChallengePrompt
      name={challenger?.name ?? "A friend"}
      avatar={challenger?.avatar ?? "👤"}
      onAccept={acceptChallenge}
      onDecline={() => {
        void respondChallenge(fr.challenge!.id, "declined");
        fr.clearChallenge();
      }}
    />
  ) : null;

  if (screen === "rules")
    return (
      <>
        {prompt}
        <RulesEditor onBack={() => setScreen("main")} />
      </>
    );
  if (screen === "friends")
    return (
      <>
        {prompt}
        <FriendsScreen account={account} fr={fr} busy={busy} onBack={() => setScreen("main")} onChallenge={challenge} />
      </>
    );
  if (screen === "coach")
    return (
      <>
        {prompt}
        <CoachScreen onBack={() => setScreen("main")} />
      </>
    );

  const onlineFriends = fr.friends.filter((f) => f.online).length;

  return (
    <main className="app home">
      {prompt}

      <header className="home-top">
        <h1>
          <Icon name="card" size={26} /> Tongits
        </h1>
        <span className="wallet-chip">{account ? `₱${account.balance.toLocaleString()}` : "₱ ⋯"}</span>
      </header>

      <section className="panel identity">
        <button
          className="avatar-big"
          onClick={() => setShowAvatars((v) => !v)}
          aria-label="Change avatar"
        >
          {profile.avatar}
        </button>
        <input
          className="name-input"
          placeholder="Your name"
          value={profile.name}
          onChange={(e) => localUpdate({ ...profile, name: e.target.value })}
          onBlur={() => onUpdateProfile({ name: profile.name })}
          maxLength={12}
        />
      </section>

      {showAvatars && (
        <div className="panel avatar-grid">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={`avatar ${profile.avatar === a ? "on" : ""}`}
              onClick={() => {
                localUpdate({ ...profile, avatar: a });
                onUpdateProfile({ avatar: a });
                setShowAvatars(false);
              }}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      <section className="panel play">
        <button className="big play-primary" onClick={() => onStart({ kind: "local" })}>
          ▶ Practice vs AI
        </button>

        {onlineConfigured ? (
          <>
            <div className="divider">Play online</div>
            {onlineFriends > 0 && (
              <div className="online-friends">
                <div className="of-label">Online now</div>
                {fr.friends
                  .filter((f) => f.online)
                  .map(({ profile }) => (
                    <div className="of-row" key={profile.id}>
                      <span>
                        <span className="dot on" /> {profile.avatar} {profile.name}
                      </span>
                      <button disabled={busy} onClick={() => challenge(profile.id)}>
                        Challenge
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <div className="play-online">
              <button disabled={busy} onClick={() => host(false)}>
                Host vs friend
              </button>
              <button disabled={busy} onClick={() => host(true)}>
                Host + AI
              </button>
            </div>
            <div className="join-row">
              <input
                placeholder="Enter code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={5}
                style={{ textTransform: "uppercase" }}
              />
              <button disabled={busy || code.trim().length < 4} onClick={join}>
                Join
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </>
        ) : (
          <p className="muted">Online play isn’t configured yet.</p>
        )}
      </section>

      <nav className="tiles">
        <button className="tile" onClick={() => setScreen("rules")}>
          <span className="tile-icon">
            <Icon name="gear" size={26} />
          </span>
          Rules
        </button>
        <button className="tile" onClick={() => setScreen("coach")}>
          <span className="tile-icon">
            <Icon name="chart" size={26} />
          </span>
          Coach
        </button>
        {onlineConfigured && (
          <button className="tile" onClick={() => setScreen("friends")}>
            <span className="tile-icon">
              <Icon name="people" size={26} />
            </span>
            Friends
            {onlineFriends > 0 && <span className="tile-badge">{onlineFriends}</span>}
          </button>
        )}
      </nav>
    </main>
  );
}

/* --------------------------------- app ----------------------------------- */

export function App() {
  const [mode, setMode] = useState<Mode>({ kind: "lobby" });
  const { account, update, setBalance } = useAccount();
  const joinCode = new URLSearchParams(window.location.search).get("join") ?? undefined;

  if (mode.kind === "lobby")
    return <Lobby onStart={setMode} initialCode={joinCode} account={account} onUpdateProfile={update} />;
  if (mode.kind === "local") return <LocalGame onExit={() => setMode({ kind: "lobby" })} />;
  return (
    <OnlineGame
      code={mode.code}
      isHost={mode.isHost}
      me={mode.me}
      account={account}
      onBalance={setBalance}
      onExit={() => setMode({ kind: "lobby" })}
    />
  );
}
