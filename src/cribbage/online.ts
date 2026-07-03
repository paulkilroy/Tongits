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

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Create a fresh online cribbage room (host = seat 0) and return its code. */
export async function hostCribbageRoom(name: string): Promise<string> {
  const code = makeCode(randSeed());
  const game = newRound(STANDARD_CRIB_RULES, randSeed(), [name || "You", "Opponent"], [false, false], 0);
  await createRoomData(code, { kind: "cribbage", game, version: 1 } satisfies CribRoom);
  return code;
}

/** The whole cribbage game, mirrored to a room row (opaque jsonb). */
export interface CribRoom {
  /** Tags the room so cross-game challenges open the right board. */
  kind: "cribbage";
  game: CribState;
  /** Bumped on every write so clients ignore their own stale echoes. */
  version: number;
}

/**
 * Mirror a cribbage game through a Supabase room. Both players run this hook:
 * whoever should act writes the whole next state; realtime + a poll keep both
 * devices converged. The host additionally drives structural steps (counting the
 * show, dealing the next hand) — see OnlineCribbage.
 */
export function useOnlineCribbage(code: string, isHost: boolean) {
  const [room, setRoom] = useState<CribRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);
  const roomRef = useRef<CribRoom | null>(null);

  const apply = useCallback((d: CribRoom) => {
    if (d.version < versionRef.current) return;
    versionRef.current = d.version;
    roomRef.current = d;
    setRoom(d);
  }, []);

  const write = useCallback(
    (game: CribState) => {
      const data: CribRoom = { kind: "cribbage", game, version: versionRef.current + 1 };
      versionRef.current = data.version;
      roomRef.current = data;
      setRoom(data);
      void pushRoomData(code, data).catch((e) => console.error("cribbage pushRoom failed", e));
    },
    [code],
  );

  // Discards can happen SIMULTANEOUSLY, so they use a compare-and-swap write:
  // if the other player got in first, re-fetch and re-apply your lay-away on top
  // (so neither is clobbered), then retry.
  const discard = useCallback(
    async (seat: number, cards: Card[]) => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const cur = roomRef.current;
        if (!cur || cur.game.players[seat].discarded) return;
        const nextGame = discardToCrib(cur.game, seat, cards);
        if (nextGame === cur.game) return; // illegal / already applied
        const data: CribRoom = { kind: "cribbage", game: nextGame, version: cur.version + 1 };
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

  return { game: room?.game ?? null, connected, write, discard, isHost };
}
