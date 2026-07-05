import { useCallback, useEffect, useRef, useState } from "react";
import { type Card } from "../engine/cards";
import { type CribState, discardToCrib, newRound, STANDARD_CRIB_RULES } from "./game";
import {
  createRoomData,
  fetchRoomData,
  makeCode,
  pushRoomData,
  pushRoomDataVersioned,
  subscribeRoomData,
} from "../online/supabase";
import { type LobbySeat } from "../online/Lobby";

export const MIN_CRIB_SEATS = 2;
export const MAX_CRIB_SEATS = 3;

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

/** The whole cribbage room: a seat lobby, then the mirrored game. */
export interface CribRoom {
  kind: "cribbage";
  version: number;
  hostId: string;
  seats: LobbySeat[];
  started: boolean;
  game: CribState | null;
}

/** Create an online cribbage lobby (host takes seat 0) and return its code. */
export async function hostCribbageRoom(host: LobbySeat): Promise<string> {
  const code = makeCode(randSeed());
  const room: CribRoom = { kind: "cribbage", version: 1, hostId: host.id, seats: [host], started: false, game: null };
  await createRoomData(code, room);
  return code;
}

const buildGame = (seats: LobbySeat[], dealer = 0, scores?: number[]): CribState =>
  newRound(
    STANDARD_CRIB_RULES,
    randSeed(),
    seats.map((s) => s.name),
    seats.map((s) => s.isAI ?? false),
    dealer,
    scores,
  );

/**
 * Mirror a 2–3 player cribbage room. Before the deal it's a seat lobby; the host
 * starts, dealing a round sized to the seats. In play everyone writes their own
 * move; discards use compare-and-swap so simultaneous lay-aways never clobber.
 * The host drives the show count and the next deal.
 */
export function useOnlineCribbage(code: string, mySeat: LobbySeat) {
  const [room, setRoom] = useState<CribRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);
  const roomRef = useRef<CribRoom | null>(null);
  const claimingRef = useRef(false);

  const apply = useCallback((d: CribRoom) => {
    if (d.version < versionRef.current) return;
    versionRef.current = d.version;
    roomRef.current = d;
    setRoom(d);
  }, []);

  const writeRoom = useCallback(
    (patch: Partial<CribRoom>) => {
      const base = roomRef.current;
      if (!base) return;
      const data: CribRoom = { ...base, ...patch, version: versionRef.current + 1 };
      versionRef.current = data.version;
      roomRef.current = data;
      setRoom(data);
      void pushRoomData(code, data).catch((e) => console.error("cribbage pushRoom failed", e));
    },
    [code],
  );

  const write = useCallback((game: CribState) => writeRoom({ game }), [writeRoom]);

  // Discards can happen SIMULTANEOUSLY → compare-and-swap: if someone got in
  // first, re-fetch and re-apply your lay-away on top, then retry.
  const discard = useCallback(
    async (seat: number, cards: Card[]) => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const cur = roomRef.current;
        if (!cur?.game || cur.game.players[seat].discarded) return;
        const nextGame = discardToCrib(cur.game, seat, cards);
        if (nextGame === cur.game) return; // illegal / already applied
        const data: CribRoom = { ...cur, game: nextGame, version: cur.version + 1 };
        const ok = await pushRoomDataVersioned(code, data, cur.version).catch(() => false);
        if (ok) {
          apply(data);
          return;
        }
        const fresh = await fetchRoomData<CribRoom>(code).catch(() => null);
        if (fresh) apply(fresh);
        else return;
      }
    },
    [code, apply],
  );

  // Guest: claim the next open seat once, via CAS with retry.
  useEffect(() => {
    if (!room || room.started || !room.seats) return;
    if (room.seats.some((s) => s.id === mySeat.id)) return;
    if (room.seats.length >= MAX_CRIB_SEATS || claimingRef.current) return;
    claimingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        for (let i = 0; i < 5 && !cancelled; i++) {
          const base = roomRef.current;
          if (
            !base ||
            base.started ||
            base.seats.some((s) => s.id === mySeat.id) ||
            base.seats.length >= MAX_CRIB_SEATS
          )
            return;
          const next: CribRoom = { ...base, seats: [...base.seats, mySeat], version: base.version + 1 };
          if (await pushRoomDataVersioned(code, next, base.version)) {
            apply(next);
            return;
          }
          const fresh = await fetchRoomData<CribRoom>(code);
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

  const addBot = useCallback(async () => {
    const base = roomRef.current;
    if (!base || base.started || base.hostId !== mySeat.id) return;
    const seatsNow = base.seats ?? [];
    if (seatsNow.length >= MAX_CRIB_SEATS) return;
    const n = seatsNow.filter((s) => s.isAI).length + 1;
    const bot: LobbySeat = { id: `bot-${n}-${base.version}`, name: n > 1 ? `Bot ${n}` : "Bot", avatar: "🤖", isAI: true };
    const next: CribRoom = { ...base, seats: [...seatsNow, bot], version: base.version + 1 };
    if (await pushRoomDataVersioned(code, next, base.version)) apply(next);
    else {
      const fresh = await fetchRoomData<CribRoom>(code);
      if (fresh) apply(fresh);
    }
  }, [code, mySeat.id, apply]);

  const start = useCallback(async () => {
    const base = roomRef.current;
    if (!base || base.started || base.hostId !== mySeat.id || (base.seats?.length ?? 0) < MIN_CRIB_SEATS) return;
    const next: CribRoom = { ...base, started: true, game: buildGame(base.seats, 0), version: base.version + 1 };
    if (await pushRoomDataVersioned(code, next, base.version)) apply(next);
    else {
      const fresh = await fetchRoomData<CribRoom>(code);
      if (fresh) apply(fresh);
    }
  }, [code, mySeat.id, apply]);

  useEffect(() => {
    let active = true;
    const unsub = subscribeRoomData<CribRoom>(code, apply);
    setConnected(true);
    const pull = () =>
      void fetchRoomData<CribRoom>(code).then((d) => {
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

  return { room, game: room?.game ?? null, connected, seats, started, isHost, meIndex, write, discard, start, addBot };
}
