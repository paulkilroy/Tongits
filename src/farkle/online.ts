import { useCallback, useEffect, useRef, useState } from "react";
import { type FarkleRules } from "./rules";
import { newGame, type FarkleState } from "./game";
import {
  createRoomData,
  fetchRoomData,
  makeCode,
  pushRoomData,
  pushRoomDataVersioned,
  subscribeRoomData,
} from "../online/supabase";
import { type LobbySeat } from "../online/Lobby";

/** Up to six can play Press Your Luck at once (including the host). */
export const MAX_FARKLE_SEATS = 6;
export const MIN_FARKLE_SEATS = 2;
/** Placeholder name from the old 2-seat rooms (kept so guest-name UI still reads). */
export const GUEST_PLACEHOLDER = "Opponent";

/** The whole Press Your Luck room: a seat lobby, then the mirrored game. */
export interface FarkleRoom {
  kind: "pressyourluck";
  version: number;
  rules: FarkleRules;
  hostId: string;
  seats: LobbySeat[]; // claimed seats; index = seat number
  started: boolean;
  game: FarkleState | null; // built from the seats when the host starts
}

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Create an online Press Your Luck lobby (host takes seat 0) and return its code. */
export async function hostFarkleRoom(host: LobbySeat, rules: FarkleRules): Promise<string> {
  const code = makeCode(randSeed());
  const room: FarkleRoom = {
    kind: "pressyourluck",
    version: 1,
    rules,
    hostId: host.id,
    seats: [host],
    started: false,
    game: null,
  };
  await createRoomData(code, room);
  return code;
}

const buildGame = (r: FarkleRoom): FarkleState =>
  newGame(
    r.rules,
    r.seats.map((s) => s.name),
    r.seats.map(() => false),
  );

/**
 * Mirror a Press Your Luck room. Before the game starts it's a seat lobby: each
 * client CAS-claims the next free seat (so several friends can join one room
 * without clobbering each other); the host then starts, which builds the game
 * from the seats. Once playing it's fully turn-based — only the active player
 * writes — so game moves use a plain optimistic push.
 */
export function useOnlineFarkle(code: string, me: LobbySeat) {
  const [room, setRoom] = useState<FarkleRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);
  const roomRef = useRef<FarkleRoom | null>(null);
  const claimingRef = useRef(false);

  const apply = useCallback((d: FarkleRoom) => {
    if (d.version < versionRef.current) return;
    versionRef.current = d.version;
    roomRef.current = d;
    setRoom(d);
  }, []);

  // Optimistic full-room write for turn-based game actions (no seat contention).
  const write = useCallback(
    (game: FarkleState) => {
      const base = roomRef.current;
      if (!base) return;
      const next: FarkleRoom = { ...base, game, version: versionRef.current + 1 };
      versionRef.current = next.version;
      roomRef.current = next;
      setRoom(next);
      void pushRoomData(code, next).catch((e) => console.error("farkle push failed", e));
    },
    [code],
  );

  // Host starts: build the game from the seated players (compare-and-swap so a
  // late seat claim can't be lost).
  const start = useCallback(async () => {
    const base = roomRef.current;
    if (!base || base.started || base.hostId !== me.id || base.seats.length < MIN_FARKLE_SEATS) return;
    const next: FarkleRoom = { ...base, started: true, game: buildGame(base), version: base.version + 1 };
    const ok = await pushRoomDataVersioned(code, next, base.version);
    if (ok) apply(next);
    else {
      const fresh = await fetchRoomData<FarkleRoom>(code);
      if (fresh) apply(fresh);
    }
  }, [code, me.id, apply]);

  // Seat claim: append myself to the first open seat once, via CAS with retry.
  useEffect(() => {
    if (!room || room.started || !room.seats) return;
    if (room.seats.some((s) => s.id === me.id)) return;
    if (room.seats.length >= MAX_FARKLE_SEATS || claimingRef.current) return;
    claimingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        for (let i = 0; i < 5 && !cancelled; i++) {
          const base = roomRef.current;
          if (
            !base ||
            base.started ||
            base.seats.some((s) => s.id === me.id) ||
            base.seats.length >= MAX_FARKLE_SEATS
          )
            return;
          const next: FarkleRoom = { ...base, seats: [...base.seats, me], version: base.version + 1 };
          if (await pushRoomDataVersioned(code, next, base.version)) {
            apply(next);
            return;
          }
          const fresh = await fetchRoomData<FarkleRoom>(code);
          if (fresh) apply(fresh);
        }
      } finally {
        claimingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, me, code, apply]);

  useEffect(() => {
    let active = true;
    const unsub = subscribeRoomData<FarkleRoom>(code, apply);
    setConnected(true);
    const pull = () =>
      void fetchRoomData<FarkleRoom>(code).then((d) => {
        if (active && d) apply(d);
      });
    pull();
    const poll = setInterval(pull, 2500);
    return () => {
      active = false;
      unsub();
      clearInterval(poll);
    };
  }, [code, apply]);

  const seats = room?.seats ?? [];
  const started = room?.started === true;
  const isHost = room?.hostId === me.id;
  const meIndex = seats.findIndex((s) => s.id === me.id);

  /** Rebuild a fresh game from the current seats (host, after a game ends). */
  const restart = useCallback(() => {
    const base = roomRef.current;
    if (base) write(buildGame(base));
  }, [write]);

  return { room, game: room?.game ?? null, connected, seats, started, isHost, meIndex, write, start, restart };
}
