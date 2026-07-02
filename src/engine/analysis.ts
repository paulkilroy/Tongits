import { type Card, cardId, cardLabel, cardPoints } from "./cards";
import { makeRng } from "./deck";
import { type GameState, discard, layMeld, sapaw } from "./game";
import { canLayOff } from "./melds";
import { bestMelds, deadwood } from "./meldFinder";
import { handDraws } from "./odds";
import { estimateWinOdds } from "./winodds";
import { roundSegments } from "./review";

// Engine-graded play analysis (chess-engine style). For each of your turns we
// enumerate the plausible end-of-turn plays (which melds to lay, which loose
// cards to sapaw, which card to discard), estimate each one's win probability by
// Monte Carlo, and grade what you actually did against the best line found. The
// "reason" is derived from the diff between your line and the best — no hand-coded
// rules. The win% of YOUR line per turn is also the graph.

export type Grade = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

/** Per-discard Monte Carlo projection for the replay table. */
export interface DiscardOption {
  cardId: string;
  /** Human label, e.g. "5♦". */
  label: string;
  /** Win % if you make this discard (best variant if it also lays a meld). */
  pct: number;
  /** High-resolution (a contender we re-simulated) vs a rough screen estimate. */
  confirmed: boolean;
  /** This line also lays/sapaws a meld before discarding. */
  laidMeld: boolean;
}

export interface TurnGrade {
  turn: number;
  yourPct: number;
  bestPct: number;
  grade: Grade;
  reason: string;
  /** Card id you actually discarded this turn (for the replay highlight). */
  yourDiscard: string | null;
  /** Card id the best line discarded, when it differs from yours. */
  bestDiscard: string | null;
  /** Win % projection for each discard you could have made, best→worst (confirmed only). */
  discards: DiscardOption[];
  /** Count of weaker discards omitted from the table (rough estimates only). */
  moreDiscards: number;
  /** When a different meld/sapaw line wins: the concrete steps, e.g.
   *  ["Lay 3♠ 3♥ 3♦", "Sapaw 8♥ → Bot 1", "Discard K♣"]. Null if you played best. */
  bestLine: string[] | null;
}

/** Cards that are part of a live draw (a pair/run you're building) — don't sapaw these. */
function liveDrawIds(state: GameState, seat: number): Set<string> {
  const ids = new Set<string>();
  for (const d of handDraws(state, seat)) if (d.outsLive > 0) for (const c of d.held) ids.add(cardId(c));
  return ids;
}

/** Signature of just the melds on the table (everyone's), for comparing lay decisions. */
function meldSig(state: GameState): string {
  return state.players
    .map((p) => p.melds.map((m) => m.cards.map(cardId).sort().join("|")).sort().join(";"))
    .join("/");
}

/** A compact signature of a position from `seat`'s view, for de-duping plays. */
function sig(state: GameState, seat: number): string {
  const hand = [...state.players[seat].hand].map(cardId).sort().join(",");
  const top = state.discard.length ? cardId(state.discard[state.discard.length - 1]) : "";
  return `${state.current}#${meldSig(state)}#${hand}#${top}#${state.result?.winner ?? ""}`;
}

/** A meld/sapaw action, kept so we can spell out the recommended line in words. */
interface Move {
  kind: "meld" | "sapaw";
  cards: Card[];
  /** For a sapaw onto an OPPONENT, their name; undefined = onto your own meld. */
  targetName?: string;
}

/** A meld/sapaw decision (the table state) plus the moves that produced it. */
interface Config {
  state: GameState;
  moves: Move[];
}

interface Candidate {
  end: GameState;
  discardCard: Card | null;
  moves: Move[];
}

/** Lay every best-meld; record each lay as a move. */
function layAllWithMoves(state: GameState, seat: number): Config {
  let s = state;
  const moves: Move[] = [];
  for (const m of bestMelds(s.players[seat].hand)) {
    const nx = layMeld(s, [...m.cards]);
    if (nx !== s) {
      moves.push({ kind: "meld", cards: [...m.cards] });
      s = nx;
    }
  }
  return { state: s, moves };
}

/** Lay off every loose (non-draw) deadwood card onto any meld; record each sapaw. */
function sapawLooseWithMoves(state: GameState, seat: number): Config {
  let s = state;
  const moves: Move[] = [];
  for (let guard = 0; guard < 20; guard++) {
    const keep = liveDrawIds(s, seat);
    const loose = deadwood(s.players[seat].hand).filter((c) => !keep.has(cardId(c)));
    let moved = false;
    for (const c of loose) {
      for (let pi = 0; pi < s.players.length && !moved; pi++) {
        if (pi !== seat && !s.rules.allowSapawOnOpponents) continue;
        const melds = s.players[pi].melds;
        for (let mi = 0; mi < melds.length; mi++) {
          if (canLayOff(melds[mi], c)) {
            const nx = sapaw(s, pi, mi, c);
            if (nx !== s) {
              moves.push({ kind: "sapaw", cards: [c], targetName: pi === seat ? undefined : s.players[pi].name });
              s = nx;
              moved = true;
              break;
            }
          }
        }
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  return { state: s, moves };
}

/** One config per loose card sapawed ALONE — models "sapaw one at a time". */
function singleSapaws(state: GameState, seat: number): Config[] {
  const keep = liveDrawIds(state, seat);
  const loose = deadwood(state.players[seat].hand)
    .filter((c) => !keep.has(cardId(c)))
    .sort((a, b) => cardPoints(b) - cardPoints(a)); // dump the costliest first
  const configs: Config[] = [];
  for (const c of loose) {
    for (let pi = 0; pi < state.players.length; pi++) {
      if (pi !== seat && !state.rules.allowSapawOnOpponents) continue;
      const melds = state.players[pi].melds;
      let placed = false;
      for (let mi = 0; mi < melds.length && !placed; mi++) {
        if (canLayOff(melds[mi], c)) {
          const nx = sapaw(state, pi, mi, c);
          if (nx !== state) {
            configs.push({
              state: nx,
              moves: [{ kind: "sapaw", cards: [c], targetName: pi === seat ? undefined : state.players[pi].name }],
            });
            placed = true;
          }
        }
      }
      if (placed) break;
    }
  }
  return configs;
}

/** Distinct meld/sapaw decisions from the post-draw state (deduped by meld layout). */
function enumerateConfigs(postDraw: GameState, seat: number): Config[] {
  const configs: Config[] = [];
  const seen = new Set<string>();
  const add = (c: Config) => {
    const k = meldSig(c.state);
    if (!seen.has(k)) {
      seen.add(k);
      configs.push(c);
    }
  };

  add({ state: postDraw, moves: [] }); // hold everything

  const lay = layAllWithMoves(postDraw, seat);
  if (lay.moves.length) add(lay); // lay every meld

  const melds = bestMelds(postDraw.players[seat].hand);
  if (melds.length > 1) {
    for (const m of melds) {
      const nx = layMeld(postDraw, [...m.cards]); // lay just THIS meld
      if (nx !== postDraw) add({ state: nx, moves: [{ kind: "meld", cards: [...m.cards] }] });
    }
  }

  const sHold = sapawLooseWithMoves(postDraw, seat); // sapaw without melding
  if (sHold.moves.length) add(sHold);
  if (lay.moves.length) {
    const sLay = sapawLooseWithMoves(lay.state, seat); // lay then sapaw
    if (sLay.moves.length) add({ state: sLay.state, moves: [...lay.moves, ...sLay.moves] });
  }

  for (const c of singleSapaws(postDraw, seat).slice(0, 3)) add(c); // one-at-a-time sapaws

  return configs;
}

/** The card you'd most plausibly discard from a config (costliest loose card). */
function naturalDiscard(state: GameState, seat: number): Card | null {
  const hand = state.players[seat].hand;
  if (!hand.length) return null;
  const keep = liveDrawIds(state, seat);
  const dw = deadwood(hand);
  const loose = dw.filter((c) => !keep.has(cardId(c)));
  const pool = loose.length ? loose : dw.length ? dw : hand;
  return [...pool].sort((a, b) => cardPoints(b) - cardPoints(a))[0] ?? hand[0];
}

/** Spell out a line as human steps: lays, sapaws, then the discard. */
function lineText(moves: Move[], discardCard: Card | null): string[] {
  const out = moves.map((m) =>
    m.kind === "meld"
      ? `Lay ${m.cards.map(cardLabel).join(" ")}`
      : `Sapaw ${m.cards.map(cardLabel).join(" ")}${m.targetName ? ` → ${m.targetName}` : " onto your meld"}`,
  );
  out.push(discardCard ? `Discard ${cardLabel(discardCard)}` : "Tongits — meld out!");
  return out;
}

/** Plausible end-of-turn plays. Your actual meld decision + holding everything get
 *  EVERY discard (the per-card table); other meld/sapaw lines get only their natural
 *  discard (enough to judge whether that line beats yours). */
function candidatePlays(postDraw: GameState, seat: number, yourMeldSig: string): Candidate[] {
  const holdSig = meldSig(postDraw);
  const out: Candidate[] = [];
  const endSeen = new Set<string>();
  const addEnd = (end: GameState, dc: Card | null, moves: Move[]) => {
    const k = sig(end, seat);
    if (!endSeen.has(k)) {
      endSeen.add(k);
      out.push({ end, discardCard: dc, moves });
    }
  };

  for (const cfg of enumerateConfigs(postDraw, seat)) {
    if (cfg.state.result) {
      addEnd(cfg.state, null, cfg.moves); // melded out (Tongits) — no discard
      continue;
    }
    if (cfg.state.mustPlay) continue; // a taken-discard card still owed — can't end here
    const ms = meldSig(cfg.state);
    if (ms === holdSig || ms === yourMeldSig) {
      for (const c of cfg.state.players[seat].hand) {
        const end = discard(cfg.state, c);
        if (end !== cfg.state) addEnd(end, c, cfg.moves);
      }
    } else {
      const c = naturalDiscard(cfg.state, seat);
      if (c) {
        const end = discard(cfg.state, c);
        if (end !== cfg.state) addEnd(end, c, cfg.moves);
      }
    }
  }
  return out;
}

// Thresholds in win-% given up. Deliberately forgiving at the low end (a couple
// points is MC noise), harsher at the top: giving up more than ~12% equity is a
// blunder. The two-stage confirm makes gaps this large trustworthy.
const gradeOf = (gap: number): Grade =>
  gap <= 2 ? "best" : gap <= 6 ? "good" : gap <= 9 ? "inaccuracy" : gap <= 12 ? "mistake" : "blunder";

function describe(
  yourEnd: GameState,
  bestEnd: GameState,
  yourDiscard: Card | null,
  bestDiscard: Card | null,
  seat: number,
): string {
  // Only blame the discard when both lines laid the SAME melds — otherwise the
  // real gain is the meld decision, and naming the discard would mislead.
  const sameMelds = meldSig(yourEnd) === meldSig(bestEnd);
  if (sameMelds && bestDiscard && yourDiscard && cardId(bestDiscard) !== cardId(yourDiscard)) {
    return `Discard ${cardLabel(bestDiscard)} instead of ${cardLabel(yourDiscard)}.`;
  }
  const yourHand = new Set(yourEnd.players[seat].hand.map(cardId));
  const bestHand = new Set(bestEnd.players[seat].hand.map(cardId));
  const bestKeptYouPlayed = [...bestHand].filter((id) => !yourHand.has(id));
  const youKeptBestPlayed = [...yourHand].filter((id) => !bestHand.has(id));
  if (bestKeptYouPlayed.length) return "Hold those cards instead of laying them off — keep building.";
  if (youKeptBestPlayed.length) return "Lay off your loose cards to dump deadwood.";
  if (!sameMelds) return "A different meld decision was a touch stronger.";
  return "A slightly stronger line was available.";
}

/** How many distinct discards (top by screen) to confirm at high resolution and show. */
const TABLE_M = 4;

export function analyzeTurns(
  history: readonly GameState[],
  seat: number,
  samples: number,
  onProgress?: (fraction: number) => void,
): TurnGrade[] {
  // `samples` is the SCREEN budget (cheap, ranks every candidate). The apparent
  // best handful + your actual play are then CONFIRMED at much higher resolution,
  // because the max over many noisy estimates is biased upward and otherwise
  // invents "mistakes" — e.g. telling you to break a live draw on a lucky sample.
  const screen = samples;
  const confirm = Math.max(samples * 4, 220);

  const work = roundSegments(history, seat).map((seg) => ({
    seg,
    yourMeldSig: meldSig(seg.after),
    cands: candidatePlays(seg.first, seat, meldSig(seg.after)),
  }));
  const total = Math.max(
    1,
    work.reduce((a, w) => a + w.cands.length + Math.min(TABLE_M + 5, w.cands.length) + 1, 0),
  );
  let done = 0;
  const tick = () => onProgress?.(++done / total);
  const out: TurnGrade[] = [];

  work.forEach(({ seg, cands, yourMeldSig }, idx) => {
    const yourDiscard =
      seg.last.players[seat].hand.find(
        (c) => !seg.after.players[seat].hand.some((h) => cardId(h) === cardId(c)),
      ) ?? null;
    const actualSig = sig(seg.after, seat);

    // Common random numbers: judge every candidate against the SAME seeded deals,
    // so a comparison reflects the PLAY, not lucky draws. Fresh seed per stage so
    // the confirm pass isn't locked into the screen pass's particular scenarios.
    const seedScreen = ((idx + 1) * 0x9e3779b1) >>> 0;
    const seedConfirm = ((idx + 1) * 0x85ebca77) >>> 0;

    const baseMelds = meldSig(seg.first);
    const yourDiscardId = yourDiscard ? cardId(yourDiscard) : null;

    // Stage 1 — screen all candidates cheaply.
    const screened = cands.map((cand) => {
      const pct = estimateWinOdds(cand.end, seat, screen, makeRng(seedScreen));
      tick();
      return {
        cand,
        pct,
        confirmed: false,
        discardId: cand.discardCard ? cardId(cand.discardCard) : null,
        label: cand.discardCard ? cardLabel(cand.discardCard) : null,
        isYours: sig(cand.end, seat) === actualSig,
        laidMeld: meldSig(cand.end) !== baseMelds,
      };
    });
    type Item = (typeof screened)[number];

    // The discard table is about YOUR meld decision: one row per discard you could
    // have made while keeping the melds you actually laid (so it answers "which card
    // should I have thrown?" without muddling in a different meld choice).
    const rowFor = new Map<string, Item>();
    for (const s of screened) {
      if (!s.discardId || meldSig(s.cand.end) !== yourMeldSig) continue;
      const p = rowFor.get(s.discardId);
      if (!p || s.pct > p.pct) rowFor.set(s.discardId, s);
    }
    const yourItem = screened.find((s) => s.isYours);
    if (yourItem && yourDiscardId) rowFor.set(yourDiscardId, yourItem);

    // Confirm set: top-M table rows + your play + best meld-out + the top few lines
    // OVERALL (so a different meld/sapaw decision gets a high-resolution check too).
    const confirmSet = new Set<Item>();
    for (const s of [...rowFor.values()].sort((a, b) => b.pct - a.pct).slice(0, TABLE_M)) confirmSet.add(s);
    if (yourItem) confirmSet.add(yourItem);
    const meldOut = screened.filter((s) => !s.discardId).sort((a, b) => b.pct - a.pct)[0];
    if (meldOut) confirmSet.add(meldOut);
    for (const s of [...screened].sort((a, b) => b.pct - a.pct).slice(0, 3)) confirmSet.add(s);

    // Stage 2 — confirm them at high resolution; grade and table use only these.
    let best: { pct: number; cand: Candidate | null } = { pct: -1, cand: null };
    for (const s of confirmSet) {
      s.pct = estimateWinOdds(s.cand.end, seat, confirm, makeRng(seedConfirm));
      s.confirmed = true;
      if (s.pct > best.pct) best = { pct: s.pct, cand: s.cand };
      tick();
    }
    let yourFrac: number;
    if (yourItem) {
      yourFrac = yourItem.pct;
    } else {
      yourFrac = estimateWinOdds(seg.after, seat, confirm, makeRng(seedConfirm));
      tick();
    }

    const yourPct = Math.round(yourFrac * 100);
    const bestPct = best.cand ? Math.max(Math.round(best.pct * 100), yourPct) : yourPct;

    // Per-discard table: only confirmed rows (the noisy screen tail is dropped, with
    // a count, so an unconfirmed estimate can never out-rank your confirmed play).
    const confirmedRows = [...rowFor.values()].filter((s) => s.confirmed);
    const discards: DiscardOption[] = confirmedRows
      .map((s) => ({
        cardId: s.discardId!,
        label: s.label!,
        pct: Math.round(s.pct * 100),
        confirmed: true,
        laidMeld: s.laidMeld,
      }))
      .sort((a, b) => b.pct - a.pct);
    const moreDiscards = rowFor.size - confirmedRows.length;
    const gap = bestPct - yourPct;
    const grade = gradeOf(gap);
    const differs =
      grade !== "best" &&
      best.cand != null &&
      best.cand.discardCard != null &&
      yourDiscard != null &&
      cardId(best.cand.discardCard) !== cardId(yourDiscard) &&
      meldSig(seg.after) === meldSig(best.cand.end);
    const reason =
      grade === "best" || !best.cand
        ? ""
        : describe(seg.after, best.cand.end, yourDiscard, best.cand.discardCard, seat);

    // Best line in words — only when the winning play involves a different meld/sapaw
    // decision than yours (a pure discard swap is already covered by `reason`).
    const meldDiffers = best.cand != null && meldSig(seg.after) !== meldSig(best.cand.end);
    const bestLine =
      grade !== "best" && best.cand && meldDiffers && best.cand.moves.length
        ? lineText(best.cand.moves, best.cand.discardCard)
        : null;

    out.push({
      turn: idx + 1,
      yourPct,
      bestPct,
      grade,
      reason,
      yourDiscard: yourDiscard ? cardId(yourDiscard) : null,
      bestDiscard: differs && best.cand!.discardCard ? cardId(best.cand!.discardCard) : null,
      discards,
      moreDiscards,
      bestLine,
    });
  });

  return out;
}
