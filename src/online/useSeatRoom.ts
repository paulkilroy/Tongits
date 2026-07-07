import { useCallback, useEffect, useRef, useState } from "react";
import { type LobbySeat } from "./Lobby";
import {
  createRoomData,
  fetchRoomData,
  makeCode,
  pushRoomData,
  pushRoomDataVersioned,
  subscribeRoomData,
} from "./supabase";

// The seat-lobby transport shared by every 2–N player game (Press Your Luck,
// Cribbage, Battleship, Backgammon, 65, Gin). A room is a lobby of claimed seats,
// then the mirrored game. This hook owns all the common plumbing so each game's
// online module is a ~10-line wrapper that just supplies `buildGame`.
//
// Provided actions:
//  - write(game):   optimistic full-room push (turn-based games; only the active
//                   player writes, so no contention).
//  - mutate(fn):    compare-and-swap apply of a game reducer, for games where two
//                   players can act at once (Battleship placement, Cribbage discard).
//  - start():       host deals the game from the seated players.
//  - addBot():      host adds an AI seat.
//  - restart():     rebuild a fresh game from the same seats (new game after over).

export interface SeatRoom<TGame, TConfig = undefined> {
  kind: string;
  version: number;
  hostId: string;
  seats: LobbySeat[];
  started: boolean;
  game: TGame | null;
  config?: TConfig;
}

const seed = () => Math.floor(Math.random() * 2 ** 31);

/** Create a seat-lobby room (host takes seat 0) and return its code. */
export async function hostSeatRoom<TConfig = undefined>(
  kind: string,
  host: LobbySeat,
  config?: TConfig,
): Promise<string> {
  const code = makeCode(seed());
  const room: SeatRoom<unknown, TConfig> = {
    kind,
    version: 1,
    hostId: host.id,
    seats: [host],
    started: false,
    game: null,
    config,
  };
  await createRoomData(code, room);
  return code;
}

export interface SeatRoomOpts<TGame, TConfig> {
  minSeats: number;
  maxSeats: number;
  buildGame: (seats: LobbySeat[], config: TConfig | undefined) => TGame;
}

export function useSeatRoom<TGame, TConfig = undefined>(
  code: string,
  mySeat: LobbySeat,
  opts: SeatRoomOpts<TGame, TConfig>,
) {
  type Room = SeatRoom<TGame, TConfig>;
  const { minSeats, maxSeats, buildGame } = opts;

  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);
  const roomRef = useRef<Room | null>(null);
  const claimingRef = useRef(false);

  const apply = useCallback((d: Room) => {
    if (d.version < versionRef.current) return;
    versionRef.current = d.version;
    roomRef.current = d;
    setRoom(d);
  }, []);

  /** Optimistic full-room write (turn-based moves — no seat contention). */
  const write = useCallback(
    (game: TGame) => {
      const base = roomRef.current;
      if (!base) return;
      const next: Room = { ...base, game, version: versionRef.current + 1 };
      versionRef.current = next.version;
      roomRef.current = next;
      setRoom(next);
      void pushRoomData(code, next).catch((e) => console.error(`${base.kind} push failed`, e));
    },
    [code],
  );

  /** Compare-and-swap write with re-fetch/retry on conflict. */
  const casWrite = useCallback(
    async (patch: (base: Room) => Room | null) => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const base = roomRef.current;
        if (!base) return;
        const next = patch(base);
        if (!next) return;
        const data: Room = { ...next, version: base.version + 1 };
        if (await pushRoomDataVersioned(code, data, base.version).catch(() => false)) {
          apply(data);
          return;
        }
        const fresh = await fetchRoomData<Room>(code).catch(() => null);
        if (fresh) apply(fresh);
        else return;
      }
    },
    [code, apply],
  );

  /** Apply a game reducer through the compare-and-swap path (concurrent actions). */
  const mutate = useCallback(
    (fn: (g: TGame) => TGame) =>
      void casWrite((base) => {
        if (!base.game) return null;
        const ng = fn(base.game);
        return ng === base.game ? null : { ...base, game: ng };
      }),
    [casWrite],
  );

  // Guest: claim the next open seat once, via CAS with retry.
  useEffect(() => {
    if (!room || room.started || !room.seats) return;
    if (room.seats.some((s) => s.id === mySeat.id)) return;
    if (room.seats.length >= maxSeats || claimingRef.current) return;
    claimingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        for (let i = 0; i < 5 && !cancelled; i++) {
          const base = roomRef.current;
          if (!base || base.started || base.seats.some((s) => s.id === mySeat.id) || base.seats.length >= maxSeats)
            return;
          const next: Room = { ...base, seats: [...base.seats, mySeat], version: base.version + 1 };
          if (await pushRoomDataVersioned(code, next, base.version)) {
            apply(next);
            return;
          }
          const fresh = await fetchRoomData<Room>(code);
          if (fresh) apply(fresh);
        }
      } finally {
        claimingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, mySeat, code, apply, maxSeats]);

  const seats = room?.seats ?? [];
  const started = room?.started === true;
  const isHost = room?.hostId === mySeat.id;
  const meIndex = seats.findIndex((s) => s.id === mySeat.id);

  const addBot = useCallback(
    () =>
      void casWrite((base) => {
        if (base.started || base.hostId !== mySeat.id || (base.seats?.length ?? 0) >= maxSeats) return null;
        const n = (base.seats ?? []).filter((s) => s.isAI).length + 1;
        const bot: LobbySeat = { id: `bot-${n}-${base.version}`, name: n > 1 ? `Bot ${n}` : "Bot", avatar: "🤖", isAI: true };
        return { ...base, seats: [...(base.seats ?? []), bot] };
      }),
    [casWrite, mySeat.id, maxSeats],
  );

  const start = useCallback(
    () =>
      void casWrite((base) => {
        if (base.started || base.hostId !== mySeat.id || (base.seats?.length ?? 0) < minSeats) return null;
        return { ...base, started: true, game: buildGame(base.seats, base.config) };
      }),
    [casWrite, mySeat.id, minSeats, buildGame],
  );

  const restart = useCallback(() => {
    const base = roomRef.current;
    if (base) write(buildGame(base.seats, base.config));
  }, [write, buildGame]);

  useEffect(() => {
    let active = true;
    const unsub = subscribeRoomData<Room>(code, apply);
    setConnected(true);
    const pull = () =>
      void fetchRoomData<Room>(code).then((d) => {
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

  return { room, game: room?.game ?? null, connected, seats, started, isHost, meIndex, write, mutate, casWrite, start, addBot, restart };
}
