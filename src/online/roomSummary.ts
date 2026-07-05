import { type GameKind } from "../games";
import { fetchRoomData } from "./supabase";

// A short live status for an active game (shown on the home Rejoin panel), read
// straight off the room's jsonb. Typed loosely/structurally since we only touch
// a few fields and the payload shape is owned by each game.

export interface RoomStatus {
  finished: boolean;
  label: string;
}

interface PlayerLike {
  name: string;
  score?: number;
}
interface FarkleRoomLike {
  started?: boolean;
  seats?: { name: string }[];
  game?: { players: PlayerLike[]; result: { winner: number } | null } | null;
}
interface CribRoomLike {
  game?: { players: PlayerLike[]; phase: string; result: { winner: number } | null };
}
interface TongitsRoomLike {
  game?: { players: PlayerLike[]; rules?: { gamesToWin?: number } };
  wins?: number[];
  gameId?: number;
}
interface BattleRoomLike {
  started?: boolean;
  seats?: { name: string }[];
  game?: { players: PlayerLike[]; phase: string; result: { winner: number } | null } | null;
}

const scoreLine = (ps: PlayerLike[]) => ps.map((p) => `${p.name} ${p.score ?? 0}`).join(" · ");
const winnerName = (ps: PlayerLike[], i: number) => ps[i]?.name ?? "someone";

export async function fetchRoomStatus(code: string, kind: GameKind): Promise<RoomStatus | null> {
  if (kind === "pressyourluck") {
    const d = await fetchRoomData<FarkleRoomLike>(code).catch(() => null);
    if (!d) return null;
    if (!d.started || !d.game) return { finished: false, label: `lobby · ${d.seats?.length ?? 1} in` };
    if (d.game.result) return { finished: true, label: `${winnerName(d.game.players, d.game.result.winner)} won` };
    return { finished: false, label: scoreLine(d.game.players) };
  }
  if (kind === "cribbage") {
    const d = await fetchRoomData<CribRoomLike>(code).catch(() => null);
    if (!d?.game) return null;
    if (d.game.phase === "gameOver" && d.game.result) {
      return { finished: true, label: `${winnerName(d.game.players, d.game.result.winner)} won` };
    }
    return { finished: false, label: `${scoreLine(d.game.players)} · to 121` };
  }
  if (kind === "battleship") {
    const d = await fetchRoomData<BattleRoomLike>(code).catch(() => null);
    if (!d) return null;
    if (!d.started || !d.game) return { finished: false, label: `lobby · ${d.seats?.length ?? 1} in` };
    if (d.game.result) return { finished: true, label: `${winnerName(d.game.players, d.game.result.winner)} won` };
    if (d.game.phase === "place") return { finished: false, label: "placing fleets" };
    return { finished: false, label: "battle underway" };
  }
  if (kind === "backgammon") {
    const d = await fetchRoomData<BattleRoomLike>(code).catch(() => null);
    if (!d) return null;
    if (!d.started || !d.game) return { finished: false, label: `lobby · ${d.seats?.length ?? 1} in` };
    if (d.game.result) return { finished: true, label: `${winnerName(d.game.players, d.game.result.winner)} won` };
    return { finished: false, label: "game underway" };
  }
  // tongits
  const d = await fetchRoomData<TongitsRoomLike>(code).catch(() => null);
  if (!d?.game) return null;
  const target = d.game.rules?.gamesToWin ?? 5;
  const wins = d.wins ?? [];
  if (wins.some((w) => w >= target)) {
    const wi = wins.indexOf(Math.max(...wins));
    return { finished: true, label: `${winnerName(d.game.players, wi)} won the match` };
  }
  return { finished: false, label: `game ${d.gameId ?? 1} · ${wins.length ? wins.join("–") : "0–0"} wins` };
}
