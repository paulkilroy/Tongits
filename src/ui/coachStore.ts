import { type GameReviewResult, type NoteTag } from "../engine/review";

// Persistent "coach": accumulates leak tallies across games (device-local) so we
// can surface recurring mistakes, not just one-game notes. The tally logic is a
// pure function (testable); load/save wrap localStorage.

export type LeakTag = Exclude<NoteTag, "clean">;

export interface CoachStats {
  games: number;
  turns: number;
  wins: number;
  /** Number of turns on which each leak appeared. */
  tags: Record<string, number>;
}

export const LEAK_INFO: Record<LeakTag, { title: string; fix: string }> = {
  "high-deadwood": { title: "Holding high deadwood", fix: "Dump loose face cards earlier." },
  "missed-sapaw": { title: "Missed sapaw chances", fix: "Always check if a card lays onto a meld." },
  "dead-draw": { title: "Holding dead draws", fix: "Drop a draw once its outs are gone." },
  competing: { title: "Keeping competing draws", fix: "Commit to one draw; discard the conflict." },
  "long-shot": { title: "Chasing long shots", fix: "Fold 1-out draws unless they're free." },
};

const KEY = "tongits.coach";

export function emptyStats(): CoachStats {
  return { games: 0, turns: 0, wins: 0, tags: {} };
}

/** Pure: fold one finished game's review into the running stats. */
export function tallyGame(stats: CoachStats, review: GameReviewResult, won: boolean): CoachStats {
  const tags = { ...stats.tags };
  let turns = stats.turns;
  for (const turn of review.turns) {
    turns++;
    const seen = new Set<string>();
    for (const note of turn.notes) {
      if (note.tag === "clean" || seen.has(note.tag)) continue;
      seen.add(note.tag);
      tags[note.tag] = (tags[note.tag] ?? 0) + 1;
    }
  }
  return { games: stats.games + 1, turns, wins: stats.wins + (won ? 1 : 0), tags };
}

export interface RankedLeak {
  tag: LeakTag;
  count: number;
  rate: number; // share of turns
  title: string;
  fix: string;
}

/** Leaks ranked by how often they happen (most frequent first). */
export function rankedLeaks(stats: CoachStats): RankedLeak[] {
  return (Object.keys(LEAK_INFO) as LeakTag[])
    .map((tag) => ({
      tag,
      count: stats.tags[tag] ?? 0,
      rate: stats.turns ? (stats.tags[tag] ?? 0) / stats.turns : 0,
      ...LEAK_INFO[tag],
    }))
    .filter((l) => l.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function loadCoach(): CoachStats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyStats(), ...(JSON.parse(raw) as CoachStats) };
  } catch {
    /* ignore */
  }
  return emptyStats();
}

export function saveCoach(stats: CoachStats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

export function resetCoach(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Record a finished round and return the updated stats. */
export function recordGame(review: GameReviewResult, won: boolean): CoachStats {
  const next = tallyGame(loadCoach(), review, won);
  saveCoach(next);
  return next;
}

/** Total count of a given tag (for "you've done this N times" annotations). */
export function tagCount(stats: CoachStats, tag: NoteTag): number {
  return tag === "clean" ? 0 : (stats.tags[tag] ?? 0);
}
