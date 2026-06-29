import { type Card, cardId, cardLabel } from "./cards";
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

export type Grade = "best" | "good" | "inaccuracy" | "mistake";

export interface TurnGrade {
  turn: number;
  yourPct: number;
  bestPct: number;
  grade: Grade;
  reason: string;
}

/** Cards that are part of a live draw (a pair/run you're building) — don't sapaw these. */
function liveDrawIds(state: GameState, seat: number): Set<string> {
  const ids = new Set<string>();
  for (const d of handDraws(state, seat)) if (d.outsLive > 0) for (const c of d.held) ids.add(cardId(c));
  return ids;
}

/** Lay off every loose (non-draw) deadwood card that can go onto a meld. */
function sapawLoose(state: GameState, seat: number): GameState {
  let s = state;
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
  return s;
}

function layAll(state: GameState, seat: number): GameState {
  let s = state;
  for (const m of bestMelds(s.players[seat].hand)) {
    const nx = layMeld(s, [...m.cards]);
    if (nx !== s) s = nx;
  }
  return s;
}

/** A compact signature of a position from `seat`'s view, for de-duping plays. */
function sig(state: GameState, seat: number): string {
  const melds = state.players
    .map((p) => p.melds.map((m) => m.cards.map(cardId).sort().join("|")).sort().join(";"))
    .join("/");
  const hand = [...state.players[seat].hand].map(cardId).sort().join(",");
  const top = state.discard.length ? cardId(state.discard[state.discard.length - 1]) : "";
  return `${state.current}#${melds}#${hand}#${top}#${state.result?.winner ?? ""}`;
}

interface Candidate {
  end: GameState;
  discardCard: Card | null;
}

/** Plausible end-of-turn plays from the post-draw state (capped for compute). */
function candidatePlays(postDraw: GameState, seat: number): Candidate[] {
  const configs: GameState[] = [];
  const cfgSeen = new Set<string>();
  const addCfg = (s: GameState) => {
    const k = sig(s, seat);
    if (!cfgSeen.has(k)) {
      cfgSeen.add(k);
      configs.push(s);
    }
  };
  addCfg(postDraw); // hold everything
  addCfg(sapawLoose(postDraw, seat)); // dump loose deadwood
  const laid = layAll(postDraw, seat); // expose melds
  addCfg(laid);
  addCfg(sapawLoose(laid, seat));

  const out: Candidate[] = [];
  const endSeen = new Set<string>();
  const addEnd = (end: GameState, dc: Card | null) => {
    const k = sig(end, seat);
    if (!endSeen.has(k)) {
      endSeen.add(k);
      out.push({ end, discardCard: dc });
    }
  };
  for (const cfg of configs) {
    if (cfg.result) {
      addEnd(cfg, null); // melded out (Tongits) — no discard
      continue;
    }
    if (cfg.mustPlay) continue; // a taken-discard card still owed — can't end the turn here
    for (const c of cfg.players[seat].hand) {
      const end = discard(cfg, c);
      if (end !== cfg) addEnd(end, c);
    }
  }
  return out;
}

const gradeOf = (gap: number): Grade =>
  gap <= 1 ? "best" : gap <= 4 ? "good" : gap <= 9 ? "inaccuracy" : "mistake";

function describe(
  yourEnd: GameState,
  bestEnd: GameState,
  yourDiscard: Card | null,
  bestDiscard: Card | null,
  seat: number,
): string {
  if (bestDiscard && yourDiscard && cardId(bestDiscard) !== cardId(yourDiscard)) {
    return `Discard ${cardLabel(bestDiscard)} instead of ${cardLabel(yourDiscard)}.`;
  }
  const yourHand = new Set(yourEnd.players[seat].hand.map(cardId));
  const bestHand = new Set(bestEnd.players[seat].hand.map(cardId));
  const bestKeptYouPlayed = [...bestHand].filter((id) => !yourHand.has(id));
  const youKeptBestPlayed = [...yourHand].filter((id) => !bestHand.has(id));
  if (bestKeptYouPlayed.length) return "Hold those cards instead of laying them off — keep building.";
  if (youKeptBestPlayed.length) return "Lay off your loose cards to dump deadwood.";
  return "A slightly stronger line was available.";
}

export function analyzeTurns(
  history: readonly GameState[],
  seat: number,
  samples: number,
  onProgress?: (fraction: number) => void,
): TurnGrade[] {
  const work = roundSegments(history, seat).map((seg) => ({ seg, cands: candidatePlays(seg.first, seat) }));
  const total = Math.max(1, work.reduce((a, w) => a + w.cands.length + 1, 0));
  let done = 0;
  const out: TurnGrade[] = [];

  work.forEach(({ seg, cands }, idx) => {
    const yourDiscard =
      seg.last.players[seat].hand.find(
        (c) => !seg.after.players[seat].hand.some((h) => cardId(h) === cardId(c)),
      ) ?? null;
    const actualSig = sig(seg.after, seat);

    let best: { pct: number; cand: Candidate | null } = { pct: -1, cand: null };
    let yourPct = -1;
    for (const cand of cands) {
      const pct = Math.round(estimateWinOdds(cand.end, seat, samples) * 100);
      if (sig(cand.end, seat) === actualSig) yourPct = pct;
      if (pct > best.pct) best = { pct, cand };
      done++;
      onProgress?.(done / total);
    }
    if (yourPct < 0) yourPct = Math.round(estimateWinOdds(seg.after, seat, samples) * 100);
    done++;
    onProgress?.(done / total);

    const bestPct = best.cand ? best.pct : yourPct;
    const gap = bestPct - yourPct;
    const grade = gradeOf(gap);
    const reason =
      grade === "best" || !best.cand
        ? ""
        : describe(seg.after, best.cand.end, yourDiscard, best.cand.discardCard, seat);
    out.push({ turn: idx + 1, yourPct, bestPct, grade, reason });
  });

  return out;
}
