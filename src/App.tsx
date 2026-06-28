import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { type Card, type Suit, SUITS, cardId, cardLabel, rankOrder } from "./engine/cards";
import { classifyMeld, canLayOff, type Meld } from "./engine/melds";
import { handPoints } from "./engine/scoring";
import { bestMelds, deadwood } from "./engine/meldFinder";
import { type RuleSet, type StockExhaustionRule } from "./engine/rules";
import {
  newRound,
  topDiscard,
  draw,
  layMeld,
  sapaw,
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
    if (i === r.winner) return r.reason === "tongits" ? "TONGITS!" : r.tupong ? "TUPONG" : "DAGO";
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

        {matchOver ? (
          <>
            <div className="reveal-match">
              {champion === me ? "You win the match! 🏆" : `${name(champion)} wins the match.`}
            </div>
            {canControlMatch ? (
              <button className="reveal-replay" onClick={onNewMatch}>
                New match
              </button>
            ) : (
              <div className="reveal-wait">Waiting for host to start a new match…</div>
            )}
          </>
        ) : canControlMatch ? (
          <button className="reveal-replay" onClick={onNext}>
            Next game
          </button>
        ) : (
          <div className="reveal-wait">Waiting for host to deal the next game…</div>
        )}
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
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 2800);
  }

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

  // The first meld the single selected card can lay onto (own, or an opponent's
  // if allowed) — so the Buklad button can sapaw, not just lay new melds.
  function firstSapawTarget(card: Card): { pi: number; mi: number } | null {
    for (let pi = 0; pi < state.players.length; pi++) {
      if (pi !== state.current && !state.rules.allowSapawOnOpponents) continue;
      const melds = state.players[pi].melds;
      for (let mi = 0; mi < melds.length; mi++) {
        if (canLayOff(melds[mi], card)) return { pi, mi };
      }
    }
    return null;
  }
  const sapawTarget = inAction && selected.length === 1 ? firstSapawTarget(selected[0]) : null;

  const canDiscard = inAction && selected.length === 1 && !mustPlay;
  const canBaba = inAction && (selectedMeld !== null || sapawTarget !== null);
  const canCall = inDraw && canCallFight(state);
  const canTake = inDraw && canTakeDiscard(state);

  function buklad() {
    if (selectedMeld) act(layMeld(state, selected));
    else if (sapawTarget) act(sapaw(state, sapawTarget.pi, sapawTarget.mi, selected[0]));
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
    if (!inAction || selected.length !== 1) return;
    const card = selected[0];
    const meld = state.players[playerIndex].melds[meldIndex];
    if (canLayOff(meld, card)) act(sapaw(state, playerIndex, meldIndex, card));
  }

  const instruction = !isMyTurn
    ? statusNote ?? `Waiting for ${state.players[state.current].name}…`
    : inDraw
      ? state.labanBlocked
        ? "Imo turno — Laban is locked (sapaw'd). Bulit (draw), or Kawat the pile to Buklad it."
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
                  active={selected.length === 1 && canLayOff(m, selected[0])}
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
                active={selected.length === 1 && canLayOff(m, selected[0])}
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
        />
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

  function leave() {
    if (window.confirm("Leave this game? The game stays open — you can rejoin with the code.")) onExit();
  }

  if (!game) {
    return (
      <main className="app center-screen">
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
    <Table
      state={game}
      me={me}
      wins={wins}
      target={target}
      matchOver={matchOver}
      onAction={(next) => dispatch(next)}
      onNext={nextGame}
      onNewMatch={newMatch}
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
  );
}

/* --------------------------------- lobby --------------------------------- */

type Mode =
  | { kind: "lobby" }
  | { kind: "local" }
  | { kind: "online"; code: string; isHost: boolean; me: number };

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
    <main className="app center-screen">
      <h1>House Rules</h1>
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
      <button className="big" onClick={onBack}>
        Done
      </button>
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
    <main className="app center-screen">
      <h1>Friends</h1>

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

      <button className="link-btn" onClick={onBack}>
        ← Back
      </button>
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
  const [screen, setScreen] = useState<"main" | "rules" | "friends">("main");
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

  const onlineFriends = fr.friends.filter((f) => f.online).length;

  return (
    <main className="app center-screen">
      {prompt}
      <h1>Tongits</h1>

      <div className="profile">
        <input
          placeholder="Your name"
          value={profile.name}
          onChange={(e) => localUpdate({ ...profile, name: e.target.value })}
          onBlur={() => onUpdateProfile({ name: profile.name })}
          maxLength={12}
        />
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={`avatar ${profile.avatar === a ? "on" : ""}`}
              onClick={() => {
                localUpdate({ ...profile, avatar: a });
                onUpdateProfile({ avatar: a });
              }}
            >
              {a}
            </button>
          ))}
        </div>
        {account && <div className="wallet">Wallet: ₱{account.balance}</div>}
      </div>

      <button className="big" onClick={() => onStart({ kind: "local" })}>
        {profile.avatar} Practice vs AI
      </button>

      <div className="lobby-links">
        <button className="link-btn" onClick={() => setScreen("rules")}>
          ⚙ House Rules
        </button>
        {onlineConfigured && (
          <button className="link-btn" onClick={() => setScreen("friends")}>
            👥 Friends{onlineFriends > 0 ? ` (${onlineFriends} online)` : ""}
          </button>
        )}
      </div>

      {onlineConfigured ? (
        <div className="lobby-online">
          <div className="lobby-section">
            <div className="lobby-title">Start a game (you host)</div>
            <div className="lobby-row">
              <button disabled={busy} onClick={() => host(false)}>
                Host vs a friend
              </button>
              <button disabled={busy} onClick={() => host(true)}>
                Host + AI (3 players)
              </button>
            </div>
          </div>
          <div className="lobby-section">
            <div className="lobby-title">Join a game</div>
            <div className="lobby-row">
              <input
                placeholder="Code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={5}
                style={{ textTransform: "uppercase" }}
              />
              <button disabled={busy || code.trim().length < 4} onClick={join}>
                Join
              </button>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <p className="muted">Online play isn’t configured yet (Supabase keys missing).</p>
      )}
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
