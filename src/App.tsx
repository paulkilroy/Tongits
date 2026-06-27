import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
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
import { loadProfile, saveProfile, AVATARS, type Profile } from "./ui/profile";
import { loadRules, saveRules } from "./ui/rulesStore";
import { onlineConfigured, makeCode, createRoom, fetchRoom, pushRoom } from "./online/supabase";

/* ----------------------------- card helpers ------------------------------ */

type SortMode = "suit" | "rank";

function meldCardIds(hand: readonly Card[]): Set<string> {
  return new Set(bestMelds(hand).flatMap((m) => m.cards.map(cardId)));
}

const suitIndex = (s: Suit) => SUITS.indexOf(s);

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
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const cls = ["card", red ? "red" : "black"];
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
      {meld.cards.map((c) => cardLabel(c)).join(" ")}
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
  onNext,
  onNewMatch,
}: {
  state: GameState;
  me: number;
  wins: number[];
  target: number;
  matchOver: boolean;
  canControlMatch: boolean;
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
}) {
  const [selected, setSelected] = useState<Card[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("suit");
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

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
  const canDiscard = inAction && selected.length === 1 && !mustPlay;
  const canBaba = inAction && selectedMeld !== null;
  const canCall = inDraw && canCallFight(state);
  const canTake = inDraw && canTakeDiscard(state);

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

        <button type="button" className="pile discard" disabled={!canTake} onClick={() => act(draw(state, "discard"))}>
          <span className="pile-label">Kawat</span>
          {topDiscard(state) ? (
            <span
              className={`pile-top ${
                topDiscard(state)!.suit === "hearts" || topDiscard(state)!.suit === "diamonds"
                  ? "red"
                  : "black"
              }`}
            >
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

      <section className="actions">
        <button disabled={!canBaba} onClick={() => act(layMeld(state, selected))}>
          Buklad{selectedMeld ? ` (${selectedMeld.kind})` : ""}
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

function OnlineGame({ code, isHost, me, onExit }: { code: string; isHost: boolean; me: number; onExit: () => void }) {
  const { game, wins, target, matchOver, connected, dispatch, nextGame, newMatch } = useOnlineMatch(code, isHost);

  if (!game) {
    return (
      <main className="app center-screen">
        <h1>Tongits</h1>
        <p>{connected ? "Connecting to game…" : "Loading…"}</p>
        <p className="code-line">
          Game code: <strong>{code}</strong>
        </p>
        <button onClick={onExit}>Leave</button>
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
          <button onClick={onExit}>Leave</button>
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

function Lobby({ onStart, initialCode }: { onStart: (m: Mode) => void; initialCode?: string }) {
  const [screen, setScreen] = useState<"main" | "rules">("main");
  if (screen === "rules") return <RulesEditor onBack={() => setScreen("main")} />;
  return <LobbyMain onStart={onStart} initialCode={initialCode} onRules={() => setScreen("rules")} />;
}

function LobbyMain({
  onStart,
  initialCode,
  onRules,
}: {
  onStart: (m: Mode) => void;
  initialCode?: string;
  onRules: () => void;
}) {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [code, setCode] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(p: Profile) {
    setProfile(p);
    saveProfile(p);
  }
  const myName = profile.name || "Player 1";

  async function host(withBot: boolean) {
    setBusy(true);
    setError(null);
    try {
      const roomCode = makeCode(Math.floor(Math.random() * 1_000_000_000));
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
      await createRoom(roomCode, { game, wins: names.map(() => 0), version: 1 });
      onStart({ kind: "online", code: roomCode, isHost: true, me: 0 });
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
      const data = await fetchRoom(clean);
      if (!data) {
        setError("No game found with that code.");
        setBusy(false);
        return;
      }
      data.game.players[1].name = profile.name || "Player 2";
      data.game.players[1].avatar = profile.avatar;
      await pushRoom(clean, { ...data, version: data.version + 1 });
      onStart({ kind: "online", code: clean, isHost: false, me: 1 });
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  return (
    <main className="app center-screen">
      <h1>Tongits</h1>

      <div className="profile">
        <input
          placeholder="Your name"
          value={profile.name}
          onChange={(e) => update({ ...profile, name: e.target.value })}
          maxLength={12}
        />
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={`avatar ${profile.avatar === a ? "on" : ""}`}
              onClick={() => update({ ...profile, avatar: a })}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <button className="big" onClick={() => onStart({ kind: "local" })}>
        {profile.avatar} Practice vs AI
      </button>

      <button className="link-btn" onClick={onRules}>
        ⚙ House Rules
      </button>

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
  const joinCode = new URLSearchParams(window.location.search).get("join") ?? undefined;

  if (mode.kind === "lobby") return <Lobby onStart={setMode} initialCode={joinCode} />;
  if (mode.kind === "local") return <LocalGame onExit={() => setMode({ kind: "lobby" })} />;
  return (
    <OnlineGame
      code={mode.code}
      isHost={mode.isHost}
      me={mode.me}
      onExit={() => setMode({ kind: "lobby" })}
    />
  );
}
