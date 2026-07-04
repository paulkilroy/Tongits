import { type GameKind } from "../games";

// Remembers the online rooms you're currently in, so you can rejoin an
// in-progress game with one tap instead of hunting for the code. The full game
// state lives in the Supabase room; this is just a local pointer list. Entries
// self-expire after a day and can be dismissed by hand.

export interface ActiveGame {
  code: string;
  kind: GameKind;
  isHost: boolean;
  me?: number; // Tongits seat (host/guest is derived from isHost for the others)
  ts: number;
}

const KEY = "ldr_active_games";
const MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_KEEP = 12;

export function listActiveGames(): ActiveGame[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as ActiveGame[];
    const fresh = raw.filter((g) => g && g.code && Date.now() - g.ts < MAX_AGE);
    if (fresh.length !== raw.length) localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export function recordActiveGame(g: Omit<ActiveGame, "ts">): void {
  const list = listActiveGames().filter((x) => x.code !== g.code);
  list.unshift({ ...g, ts: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_KEEP)));
}

export function forgetActiveGame(code: string): void {
  localStorage.setItem(KEY, JSON.stringify(listActiveGames().filter((g) => g.code !== code)));
}
