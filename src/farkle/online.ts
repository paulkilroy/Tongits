import { useCallback, useEffect, useRef, useState } from "react";
import { type FarkleRules } from "./rules";
import { newGame, type FarkleState } from "./game";
import { createRoomData, fetchRoomData, makeCode, pushRoomData, subscribeRoomData } from "../online/supabase";

/** The whole Press Your Luck game, mirrored to a room row (opaque jsonb). */
export interface FarkleRoom {
  kind: "pressyourluck";
  game: FarkleState;
  version: number;
}

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Create an online Press Your Luck room (host = seat 0) and return its code. */
export async function hostFarkleRoom(name: string, rules: FarkleRules): Promise<string> {
  const code = makeCode(randSeed());
  const game = newGame(rules, [name || "You", "Opponent"], [false, false]);
  await createRoomData(code, { kind: "pressyourluck", game, version: 1 } satisfies FarkleRoom);
  return code;
}

/**
 * Mirror a Press Your Luck game through a Supabase room. It's fully turn-based —
 * only the active player writes — so there's no host-special logic; whoever's
 * turn it is rolls/sets aside/banks and the write syncs to the other device.
 */
export function useOnlineFarkle(code: string, isHost: boolean) {
  const [room, setRoom] = useState<FarkleRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);

  const apply = useCallback((d: FarkleRoom) => {
    if (d.version < versionRef.current) return;
    versionRef.current = d.version;
    setRoom(d);
  }, []);

  const write = useCallback(
    (game: FarkleState) => {
      const data: FarkleRoom = { kind: "pressyourluck", game, version: versionRef.current + 1 };
      versionRef.current = data.version;
      setRoom(data);
      void pushRoomData(code, data).catch((e) => console.error("farkle pushRoom failed", e));
    },
    [code],
  );

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

  return { game: room?.game ?? null, connected, write, isHost };
}
