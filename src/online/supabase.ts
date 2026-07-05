import { type GameState } from "../engine/game";
import { type RuleSet } from "../engine/rules";
import type { LobbySeat } from "./Lobby";
import { getClient } from "./client";

export { onlineConfigured } from "./client";

// Online play uses one Supabase row per game "room". The full match (game state
// + games won) is mirrored into a jsonb column; because Tongits is turn-based,
// only the player whose turn it is writes meaningful changes, so last-writer
// conflicts are rare. Realtime postgres-changes pushes every update to both
// devices. This is a friendly-game design — no anti-cheat; the row holds all
// hands, the UI just doesn't show opponents'.

/** The whole match, mirrored to the room row. */
export interface RoomData {
  /** Which game this room is — lets challenges route to the right board. */
  kind?: "tongits";
  /** The dealt match, or null while the room is still a seat lobby. */
  game: GameState | null;
  wins: number[];
  /** Identifies the current round, so wallets settle exactly once per game. */
  gameId: number;
  /** Bumped on every write so clients can ignore their own stale echoes. */
  version: number;
  // --- seat lobby (before the first deal) ---
  seats?: LobbySeat[]; // claimed seats; index = seat number
  hostId?: string;
  started?: boolean;
  rules?: RuleSet; // chosen ruleset; playerCount is set to seats.length on start
}

/** Read just the game kind of a room (defaults to tongits for legacy rooms). */
export async function fetchRoomKind(code: string): Promise<string | null> {
  const room = await fetchRoomData<{ kind?: string }>(code);
  if (!room) return null;
  return room.kind ?? "tongits";
}

const supabase = getClient;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars

/** A short, shareable room code, derived from a seed so it needs no RNG import. */
export function makeCode(seed: number): string {
  let n = Math.abs(Math.floor(seed));
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += ALPHABET[n % ALPHABET.length];
    n = Math.floor(n / ALPHABET.length) + (i + 1) * 7;
  }
  return code;
}

/** Create a room row. Returns the data that was written. */
export async function createRoom(code: string, data: RoomData): Promise<void> {
  const { error } = await supabase().from("rooms").insert({ code, data });
  if (error) throw error;
}

/** Read a room's current data, or null if the code doesn't exist. */
export async function fetchRoom(code: string): Promise<RoomData | null> {
  const { data, error } = await supabase().from("rooms").select("data").eq("code", code).maybeSingle();
  if (error) throw error;
  return (data?.data as RoomData) ?? null;
}

/** Overwrite a room's data (used after every local move / match update). */
export async function pushRoom(code: string, data: RoomData): Promise<void> {
  const { error } = await supabase().from("rooms").update({ data }).eq("code", code);
  if (error) throw error;
}

/** Subscribe to live updates for a room. Returns an unsubscribe function. */
export function subscribeRoom(code: string, onData: (data: RoomData) => void): () => void {
  return subscribeRoomData(code, onData);
}

// ---- generic variants (any jsonb payload) — used by other games (cribbage) ----
// The `rooms.data` column is opaque jsonb, so a room can carry any game's shape.
// Rooms are keyed by code, and a client only ever reads its own room, so Tongits
// and cribbage rooms coexist safely in the same table.

export async function createRoomData<T>(code: string, data: T): Promise<void> {
  const { error } = await supabase().from("rooms").insert({ code, data });
  if (error) throw error;
}

export async function fetchRoomData<T>(code: string): Promise<T | null> {
  const { data, error } = await supabase().from("rooms").select("data").eq("code", code).maybeSingle();
  if (error) throw error;
  return (data?.data as T) ?? null;
}

export async function pushRoomData<T>(code: string, data: T): Promise<void> {
  const { error } = await supabase().from("rooms").update({ data }).eq("code", code);
  if (error) throw error;
}

/** Compare-and-swap write: only succeeds if the row's current data.version still
 *  equals `expectedVersion`. Lets two clients act on the SAME state (e.g. both
 *  discarding at once) without one silently clobbering the other. */
export async function pushRoomDataVersioned<T>(
  code: string,
  data: T,
  expectedVersion: number,
): Promise<boolean> {
  const { data: rows, error } = await supabase()
    .from("rooms")
    .update({ data })
    .eq("code", code)
    .eq("data->>version", String(expectedVersion))
    .select("code");
  if (error) throw error;
  return (rows?.length ?? 0) > 0;
}

export function subscribeRoomData<T>(code: string, onData: (data: T) => void): () => void {
  const channel = supabase()
    .channel(`room:${code}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` },
      (payload) => {
        const row = payload.new as { data?: T } | null;
        if (row?.data) onData(row.data);
      },
    )
    .subscribe();
  return () => {
    void supabase().removeChannel(channel);
  };
}
