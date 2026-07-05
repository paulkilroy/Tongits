import { useCallback, useEffect, useRef, useState } from "react";
import { newGame, type BgState } from "./game";
import {
  createRoomData,
  fetchRoomData,
  makeCode,
  pushRoomData,
  pushRoomDataVersioned,
  subscribeRoomData,
} from "../online/supabase";
import { type LobbySeat } from "../online/Lobby";

export const MIN_BG_SEATS = 2;
export const MAX_BG_SEATS = 2;

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

export interface BgRoom {
  kind: "backgammon";
  version: number;
  hostId: string;
  seats: LobbySeat[];
  started: boolean;
  game: BgState | null;
}

export async function hostBackgammonRoom(host: LobbySeat): Promise<string> {
  const code = makeCode(randSeed());
  const room: BgRoom = { kind: "backgammon", version: 1, hostId: host.id, seats: [host], started: false, game: null };
  await createRoomData(code, room);
  return code;
}

/** Mirror a 2-player Backgammon room: seat lobby, then strictly turn-based play
 *  (only the player to move writes, so plain optimistic pushes are safe). */
export function useOnlineBackgammon(code: string, mySeat: LobbySeat) {
  const [room, setRoom] = useState<BgRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);
  const roomRef = useRef<BgRoom | null>(null);
  const claimingRef = useRef(false);

  const apply = useCallback((d: BgRoom) => {
    if (d.version < versionRef.current) return;
    versionRef.current = d.version;
    roomRef.current = d;
    setRoom(d);
  }, []);

  const write = useCallback(
    (game: BgState) => {
      const base = roomRef.current;
      if (!base) return;
      const next: BgRoom = { ...base, game, version: versionRef.current + 1 };
      versionRef.current = next.version;
      roomRef.current = next;
      setRoom(next);
      void pushRoomData(code, next).catch((e) => console.error("backgammon push failed", e));
    },
    [code],
  );

  const casSeat = useCallback(
    async (patch: (base: BgRoom) => BgRoom | null) => {
      const base = roomRef.current;
      if (!base) return;
      const next = patch(base);
      if (!next) return;
      const data: BgRoom = { ...next, version: base.version + 1 };
      if (await pushRoomDataVersioned(code, data, base.version).catch(() => false)) apply(data);
      else {
        const fresh = await fetchRoomData<BgRoom>(code).catch(() => null);
        if (fresh) apply(fresh);
      }
    },
    [code, apply],
  );

  useEffect(() => {
    if (!room || room.started || !room.seats) return;
    if (room.seats.some((s) => s.id === mySeat.id)) return;
    if (room.seats.length >= MAX_BG_SEATS || claimingRef.current) return;
    claimingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        for (let i = 0; i < 5 && !cancelled; i++) {
          const base = roomRef.current;
          if (!base || base.started || base.seats.some((s) => s.id === mySeat.id) || base.seats.length >= MAX_BG_SEATS)
            return;
          const next: BgRoom = { ...base, seats: [...base.seats, mySeat], version: base.version + 1 };
          if (await pushRoomDataVersioned(code, next, base.version)) {
            apply(next);
            return;
          }
          const fresh = await fetchRoomData<BgRoom>(code);
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
        if (base.started || base.hostId !== mySeat.id || (base.seats?.length ?? 0) >= MAX_BG_SEATS) return null;
        const bot: LobbySeat = { id: `bot-${base.version}`, name: "Bot", avatar: "🤖", isAI: true };
        return { ...base, seats: [...(base.seats ?? []), bot] };
      }),
    [casSeat, mySeat.id],
  );

  const start = useCallback(
    () =>
      void casSeat((base) => {
        if (base.started || base.hostId !== mySeat.id || (base.seats?.length ?? 0) < MIN_BG_SEATS) return null;
        return { ...base, started: true, game: newGame(base.seats.map((s) => s.name), base.seats.map((s) => s.isAI ?? false)) };
      }),
    [casSeat, mySeat.id],
  );

  useEffect(() => {
    let active = true;
    const unsub = subscribeRoomData<BgRoom>(code, apply);
    setConnected(true);
    const pull = () =>
      void fetchRoomData<BgRoom>(code).then((d) => {
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
