import { useCallback, useEffect, useRef, useState } from "react";
import { newGame, type GinState } from "./game";
import {
  createRoomData,
  fetchRoomData,
  makeCode,
  pushRoomData,
  pushRoomDataVersioned,
  subscribeRoomData,
} from "../online/supabase";
import { type LobbySeat } from "../online/Lobby";

export const MIN_GIN_SEATS = 2;
export const MAX_GIN_SEATS = 2;

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

export interface GinRoom {
  kind: "gin";
  version: number;
  hostId: string;
  seats: LobbySeat[];
  started: boolean;
  game: GinState | null;
}

export async function hostGinRoom(host: LobbySeat): Promise<string> {
  const code = makeCode(randSeed());
  const room: GinRoom = { kind: "gin", version: 1, hostId: host.id, seats: [host], started: false, game: null };
  await createRoomData(code, room);
  return code;
}

/** Mirror a 2-player Gin room: seat lobby, then turn-based play (optimistic pushes). */
export function useOnlineGin(code: string, mySeat: LobbySeat) {
  const [room, setRoom] = useState<GinRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);
  const roomRef = useRef<GinRoom | null>(null);
  const claimingRef = useRef(false);

  const apply = useCallback((d: GinRoom) => {
    if (d.version < versionRef.current) return;
    versionRef.current = d.version;
    roomRef.current = d;
    setRoom(d);
  }, []);

  const write = useCallback(
    (game: GinState) => {
      const base = roomRef.current;
      if (!base) return;
      const next: GinRoom = { ...base, game, version: versionRef.current + 1 };
      versionRef.current = next.version;
      roomRef.current = next;
      setRoom(next);
      void pushRoomData(code, next).catch((e) => console.error("gin push failed", e));
    },
    [code],
  );

  const casSeat = useCallback(
    async (patch: (base: GinRoom) => GinRoom | null) => {
      const base = roomRef.current;
      if (!base) return;
      const next = patch(base);
      if (!next) return;
      const data: GinRoom = { ...next, version: base.version + 1 };
      if (await pushRoomDataVersioned(code, data, base.version).catch(() => false)) apply(data);
      else {
        const fresh = await fetchRoomData<GinRoom>(code).catch(() => null);
        if (fresh) apply(fresh);
      }
    },
    [code, apply],
  );

  useEffect(() => {
    if (!room || room.started || !room.seats) return;
    if (room.seats.some((s) => s.id === mySeat.id)) return;
    if (room.seats.length >= MAX_GIN_SEATS || claimingRef.current) return;
    claimingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        for (let i = 0; i < 5 && !cancelled; i++) {
          const base = roomRef.current;
          if (!base || base.started || base.seats.some((s) => s.id === mySeat.id) || base.seats.length >= MAX_GIN_SEATS)
            return;
          const next: GinRoom = { ...base, seats: [...base.seats, mySeat], version: base.version + 1 };
          if (await pushRoomDataVersioned(code, next, base.version)) {
            apply(next);
            return;
          }
          const fresh = await fetchRoomData<GinRoom>(code);
          if (fresh) apply(fresh);
        }
      } finally {
        claimingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, mySeat, code, apply]);

  const seats = room?.seats ?? [];
  const started = room?.started === true;
  const isHost = room?.hostId === mySeat.id;
  const meIndex = seats.findIndex((s) => s.id === mySeat.id);

  const addBot = useCallback(
    () =>
      void casSeat((base) => {
        if (base.started || base.hostId !== mySeat.id || (base.seats?.length ?? 0) >= MAX_GIN_SEATS) return null;
        const bot: LobbySeat = { id: `bot-${base.version}`, name: "Bot", avatar: "🤖", isAI: true };
        return { ...base, seats: [...(base.seats ?? []), bot] };
      }),
    [casSeat, mySeat.id],
  );

  const start = useCallback(
    () =>
      void casSeat((base) => {
        if (base.started || base.hostId !== mySeat.id || (base.seats?.length ?? 0) < MIN_GIN_SEATS) return null;
        return { ...base, started: true, game: newGame(base.seats.map((s) => s.name), base.seats.map((s) => s.isAI ?? false)) };
      }),
    [casSeat, mySeat.id],
  );

  useEffect(() => {
    let active = true;
    const unsub = subscribeRoomData<GinRoom>(code, apply);
    setConnected(true);
    const pull = () =>
      void fetchRoomData<GinRoom>(code).then((d) => {
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

  return { room, game: room?.game ?? null, connected, seats, started, isHost, meIndex, write, start, addBot };
}
