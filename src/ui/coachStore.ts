import { type Grade, type TurnGrade } from "../engine/analysis";

// Persistent coach: accumulates engine-graded play quality across the games you
// review (device-local). Tally logic is pure (testable); load/save wrap storage.

export interface CoachStats {
  games: number;
  turns: number;
  grades: Record<Grade, number>;
  /** Total win% given up across all graded turns. */
  gapSum: number;
}

const KEY = "tongits.coach";

export function emptyStats(): CoachStats {
  return {
    games: 0,
    turns: 0,
    grades: { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
    gapSum: 0,
  };
}

/** Pure: fold one reviewed game's grades into the running stats. */
export function tallyGame(stats: CoachStats, grades: TurnGrade[]): CoachStats {
  const g = { ...stats.grades };
  let gapSum = stats.gapSum;
  for (const t of grades) {
    g[t.grade] = (g[t.grade] ?? 0) + 1;
    gapSum += Math.max(0, t.bestPct - t.yourPct);
  }
  return { games: stats.games + 1, turns: stats.turns + grades.length, grades: g, gapSum };
}

/** Share of turns played best-or-good. */
export function accuracy(stats: CoachStats): number {
  if (!stats.turns) return 0;
  return Math.round(((stats.grades.best + stats.grades.good) / stats.turns) * 100);
}

/** Average win% given up per turn. */
export function avgGap(stats: CoachStats): number {
  return stats.turns ? Number((stats.gapSum / stats.turns).toFixed(1)) : 0;
}

export function loadCoach(): CoachStats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<CoachStats>;
      if (p.grades) return { ...emptyStats(), ...p, grades: { ...emptyStats().grades, ...p.grades } };
    }
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

/** Record a reviewed game's grades and return the updated stats. */
export function recordAnalysis(grades: TurnGrade[]): CoachStats {
  const next = tallyGame(loadCoach(), grades);
  saveCoach(next);
  return next;
}
