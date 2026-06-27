import { useCallback, useEffect, useRef, useState } from "react";
import { newRound, type GameState } from "../engine/game";
import { takeAITurn } from "../engine/ai";
import {
  type RoomData,
  fetchRoom,
  pushRoom,
  subscribeRoom,
} from "../online/supabase";

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

/**
 * Mirrors a match through a Supabase room. Both players run this hook:
 *  - Whoever's turn it is calls `dispatch(next)` to write their move.
 *  - The HOST additionally drives any AI seats, tallies game wins, and controls
 *    Next game / New match (the guest waits for the host on those).
 * Incoming realtime updates are authoritative.
 */
export function useOnlineMatch(code: string, isHost: boolean) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);
  const countedRef = useRef(false);

  const applyIncoming = useCallback((d: RoomData) => {
    if (d.version < versionRef.current) return; // ignore stale echoes
    versionRef.current = d.version;
    setRoom(d);
  }, []);

  const write = useCallback(
    (game: GameState, wins: number[]) => {
      const data: RoomData = { game, wins, version: versionRef.current + 1 };
      versionRef.current = data.version;
      setRoom(data);
      void pushRoom(code, data).catch((e) => console.error("pushRoom failed", e));
    },
    [code],
  );

  useEffect(() => {
    let active = true;
    const unsub = subscribeRoom(code, applyIncoming);
    setConnected(true);
    void fetchRoom(code).then((d) => {
      if (active && d) applyIncoming(d);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [code, applyIncoming]);

  const game = room?.game ?? null;
  const wins = room?.wins ?? [];
  const target = game?.rules.gamesToWin ?? 5;
  const matchOver = wins.some((w) => w >= target);

  // The acting player writes their move.
  const dispatch = useCallback(
    (next: GameState) => {
      if (room) write(next, room.wins);
    },
    [room, write],
  );

  // Host: play out AI seats.
  useEffect(() => {
    if (!isHost || !game || game.result || matchOver) return;
    if (!game.players[game.current].isAI) return;
    const id = setTimeout(() => write(takeAITurn(game), wins), 800);
    return () => clearTimeout(id);
  }, [isHost, game, wins, matchOver, write]);

  // Host: tally a game win exactly once when a round ends.
  useEffect(() => {
    if (!isHost || !game || !game.result || countedRef.current) return;
    countedRef.current = true;
    if (game.result.winner >= 0) {
      write(game, wins.map((n, i) => (i === game.result!.winner ? n + 1 : n)));
    }
  }, [isHost, game, wins, write]);

  const nextGame = useCallback(() => {
    if (!isHost || !game) return;
    countedRef.current = false;
    const next = newRound(
      game.rules,
      randomSeed(),
      game.players.map((p) => p.name),
      game.players.map((p) => p.isAI),
      (game.dealer + 1) % game.players.length,
      game.players.map((p) => p.avatar),
    );
    write(next, wins);
  }, [isHost, game, wins, write]);

  const newMatch = useCallback(() => {
    if (!isHost || !game) return;
    countedRef.current = false;
    const next = newRound(
      game.rules,
      randomSeed(),
      game.players.map((p) => p.name),
      game.players.map((p) => p.isAI),
      0,
      game.players.map((p) => p.avatar),
    );
    write(next, game.players.map(() => 0));
  }, [isHost, game, write]);

  return { game, wins, target, matchOver, connected, isHost, dispatch, nextGame, newMatch };
}
