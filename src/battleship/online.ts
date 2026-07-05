import { useCallback, useEffect, useRef, useState } from "react";
import { newGame, type BattleState } from "./game";
import {
  createRoomData,
  fetchRoomData,
  makeCode,
  pushRoomDataVersioned,
  subscribeRoomData,
} from "../online/supabase";
import { type LobbySeat } from "../online/Lobby";

export const MIN_BS_SEATS = 2;
export const MAX_BS_SEATS = 2;

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

export interface BattleRoom {
  kind: "battleship";
  version: number;
  hostId: string;
  seats: LobbySeat[];
  started: boolean;
  game: BattleState | null;
}

export async function hostBattleshipRoom(host: LobbySeat): Promise<string> {
  const code = makeCode(randSeed());
  const room: BattleRoom = { kind: "battleship", version: 1, hostId: host.id, seats: [host], started: false, game: null };
  await createRoomData(code, room);
  return code;
}

/**
 * Mirror a 2-player Battleship room. Placement happens simultaneously, so every
 * game mutation is a compare-and-swap merge (fetch latest → apply → retry) — that
 * way two players placing at once never clobber each other. Firing is turn-based
 * but uses the same safe path.
 */
export function useOnlineBattleship(code: string, mySeat: LobbySeat) {
  const [room, setRoom] = useState<BattleRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);
  const roomRef = useRef<BattleRoom | null>(null);
  const claimingRef = useRef(false);

  const apply = useCallback((d: BattleRoom) => {
    if (d.version < versionRef.current) return;
    versionRef.current = d.version;
    roomRef.current = d;
    setRoom(d);
  }, []);

  const casWrite = useCallback(
    async (patch: (base: BattleRoom) => BattleRoom | null) => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const base = roomRef.current;
        if (!base) return;
        const next = patch(base);
        if (!next) return;
        const data: BattleRoom = { ...next, version: base.version + 1 };
        if (await pushRoomDataVersioned(code, data, base.version).catch(() => false)) {
          apply(data);
          return;
        }
        const fresh = await fetchRoomData<BattleRoom>(code).catch(() => null);
        if (fresh) apply(fresh);
        else return;
      }
    },
    [code, apply],
  );

  /** Apply a game reducer through the compare-and-swap path. */
  const mutate = useCallback(
    (fn: (g: BattleState) => BattleState) =>
      void casWrite((base) => {
        if (!base.game) return null;
        const next = fn(base.game);
        return next === base.game ? null : { ...base, game: next };
      }),
    [casWrite],
  );

  // Guest: claim the second seat.
  useEffect(() => {
    if (!room || room.started || !room.seats) return;
    if (room.seats.some((s) => s.id === mySeat.id)) return;
    if (room.seats.length >= MAX_BS_SEATS || claimingRef.current) return;
    claimingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        for (let i = 0; i < 5 && !cancelled; i++) {
          const base = roomRef.current;
          if (!base || base.started || base.seats.some((s) => s.id === mySeat.id) || base.seats.length >= MAX_BS_SEATS)
            return;
          const next: BattleRoom = { ...base, seats: [...base.seats, mySeat], version: base.version + 1 };
          if (await pushRoomDataVersioned(code, next, base.version)) {
            apply(next);
            return;
          }
          const fresh = await fetchRoomData<BattleRoom>(code);
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
      void casWrite((base) => {
        if (base.started || base.hostId !== mySeat.id || (base.seats?.length ?? 0) >= MAX_BS_SEATS) return null;
        const bot: LobbySeat = { id: `bot-${base.version}`, name: "Bot", avatar: "🤖", isAI: true };
        return { ...base, seats: [...(base.seats ?? []), bot] };
      }),
    [casWrite, mySeat.id],
  );

  const start = useCallback(
    () =>
      void casWrite((base) => {
        if (base.started || base.hostId !== mySeat.id || (base.seats?.length ?? 0) < MIN_BS_SEATS) return null;
        const game = newGame(base.seats.map((s) => s.name), base.seats.map((s) => s.isAI ?? false));
        return { ...base, started: true, game };
      }),
    [casWrite, mySeat.id],
  );

  useEffect(() => {
    let active = true;
    const unsub = subscribeRoomData<BattleRoom>(code, apply);
    setConnected(true);
    const pull = () =>
      void fetchRoomData<BattleRoom>(code).then((d) => {
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

  return { room, game: room?.game ?? null, connected, seats, started, isHost, meIndex, mutate, start, addBot };
}
