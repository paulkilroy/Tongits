import { useCallback, useEffect, useRef, useState } from "react";
import { type CribState } from "./game";
import { fetchRoomData, pushRoomData, subscribeRoomData } from "../online/supabase";

/** The whole cribbage game, mirrored to a room row (opaque jsonb). */
export interface CribRoom {
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

  const apply = useCallback((d: CribRoom) => {
    if (d.version < versionRef.current) return;
    versionRef.current = d.version;
    setRoom(d);
  }, []);

  const write = useCallback(
    (game: CribState) => {
      const data: CribRoom = { game, version: versionRef.current + 1 };
      versionRef.current = data.version;
      setRoom(data);
      void pushRoomData(code, data).catch((e) => console.error("cribbage pushRoom failed", e));
    },
    [code],
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

  return { game: room?.game ?? null, connected, write, isHost };
}
