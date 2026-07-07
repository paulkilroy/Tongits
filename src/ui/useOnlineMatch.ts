import { useCallback, useEffect, useRef, useState } from "react";
import { newRound, type GameState } from "../engine/game";
import { takeAITurn } from "../engine/ai";
import { STANDARD_RULES } from "../engine/rules";
import { openMatch, settleHand, freshBet, type HandOutcome } from "../engine/betting";
import {
  type RoomData,
  fetchRoom,
  pushRoom,
  pushRoomDataVersioned,
  subscribeRoom,
} from "../online/supabase";
import { type LobbySeat } from "../online/Lobby";

export const MAX_TONGITS_SEATS = 3;
export const MIN_TONGITS_SEATS = 2;

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

/** Deal a fresh round from the lobby's seats (playerCount follows the seat count). */
function dealFromSeats(room: RoomData, dealer: number, seed = randomSeed()): GameState {
  const seats = room.seats ?? [];
  const rules = { ...(room.rules ?? STANDARD_RULES), playerCount: seats.length as 2 | 3 };
  return newRound(
    rules,
    seed,
    seats.map((s) => s.name),
    seats.map((s) => s.isAI ?? false),
    dealer,
    seats.map((s) => s.avatar ?? "🙂"),
  );
}

/**
 * Mirrors a match through a Supabase room. Before the deal it's a seat lobby:
 * guests CAS-claim the next open seat and the host starts. Once playing it's
 * turn-based — whoever's turn it is writes the move; the HOST additionally drives
 * AI seats, tallies wins, and controls Next game / New match.
 */
export function useOnlineMatch(code: string, mySeat: LobbySeat) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [connected, setConnected] = useState(false);
  const versionRef = useRef(0);
  const roomRef = useRef<RoomData | null>(null);
  const countedRef = useRef(false);
  const claimingRef = useRef(false);

  const apply = useCallback((d: RoomData) => {
    if (d.version < versionRef.current) return; // ignore stale echoes
    versionRef.current = d.version;
    roomRef.current = d;
    setRoom(d);
  }, []);

  // Optimistic full-room write (turn-based game actions — no seat contention).
  const writeRoom = useCallback(
    (patch: Partial<RoomData>) => {
      const base = roomRef.current;
      if (!base) return;
      const next: RoomData = { ...base, ...patch, version: versionRef.current + 1 };
      versionRef.current = next.version;
      roomRef.current = next;
      setRoom(next);
      void pushRoom(code, next).catch((e) => console.error("pushRoom failed", e));
    },
    [code],
  );

  useEffect(() => {
    let active = true;
    const unsub = subscribeRoom(code, apply);
    setConnected(true);
    const pull = () =>
      void fetchRoom(code).then((d) => {
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

  const game = room?.game ?? null;
  const wins = room?.wins ?? [];
  const gameId = room?.gameId ?? 1;
  const seats = room?.seats ?? [];
  const started = room?.started === true;
  const isHost = room?.hostId === mySeat.id;
  const meIndex = seats.findIndex((s) => s.id === mySeat.id);
  const target = game?.rules.gamesToWin ?? 5;
  const matchOver = wins.some((w) => w >= target);

  // Guest: claim the next open seat once, via CAS with retry.
  useEffect(() => {
    if (!room || room.started || !room.seats) return;
    if (room.seats.some((s) => s.id === mySeat.id)) return;
    if (room.seats.length >= MAX_TONGITS_SEATS || claimingRef.current) return;
    claimingRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        for (let i = 0; i < 5 && !cancelled; i++) {
          const base = roomRef.current;
          if (
            !base ||
            base.started ||
            !base.seats ||
            base.seats.some((s) => s.id === mySeat.id) ||
            base.seats.length >= MAX_TONGITS_SEATS
          )
            return;
          const next: RoomData = { ...base, seats: [...base.seats, mySeat], version: base.version + 1 };
          if (await pushRoomDataVersioned(code, next, base.version)) {
            apply(next);
            return;
          }
          const fresh = await fetchRoom(code);
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

  // Host: add a bot seat before starting.
  const addBot = useCallback(async () => {
    const base = roomRef.current;
    if (!base || base.started || base.hostId !== mySeat.id) return;
    const seatsNow = base.seats ?? [];
    if (seatsNow.length >= MAX_TONGITS_SEATS) return;
    const n = seatsNow.filter((s) => s.isAI).length + 1;
    const bot: LobbySeat = { id: `bot-${n}-${base.version}`, name: n > 1 ? `Bot ${n}` : "Bot", avatar: "🤖", isAI: true };
    const next: RoomData = { ...base, seats: [...seatsNow, bot], version: base.version + 1 };
    if (await pushRoomDataVersioned(code, next, base.version)) apply(next);
    else {
      const fresh = await fetchRoom(code);
      if (fresh) apply(fresh);
    }
  }, [code, mySeat.id, apply]);

  // Host: deal the first round from the seated players.
  const start = useCallback(async () => {
    const base = roomRef.current;
    if (!base || base.started || base.hostId !== mySeat.id) return;
    if ((base.seats?.length ?? 0) < MIN_TONGITS_SEATS) return;
    countedRef.current = false;
    // The pot/heater/ante betting is a 3-player house rule; heads-up uses the
    // simple per-hand stake (no ante, no pot).
    const opening = (base.seats ?? []).length === 3 ? openMatch(3) : null;
    const next: RoomData = {
      ...base,
      started: true,
      game: dealFromSeats(base, 0),
      wins: (base.seats ?? []).map(() => 0),
      gameId: 1,
      bet: opening?.bet,
      settleSeq: opening ? 1 : 0,
      settleDeltas: opening?.deltas,
      version: base.version + 1,
    };
    if (await pushRoomDataVersioned(code, next, base.version)) apply(next);
    else {
      const fresh = await fetchRoom(code);
      if (fresh) apply(fresh);
    }
  }, [code, mySeat.id, apply]);

  // The acting player writes their move.
  const dispatch = useCallback((next: GameState) => writeRoom({ game: next }), [writeRoom]);

  // Host: play out AI seats (but not while a Laban is awaiting fold/fight replies).
  useEffect(() => {
    if (!isHost || !started || !game || game.result || matchOver || game.pendingLaban) return;
    if (!game.players[game.current].isAI) return;
    const id = setTimeout(() => writeRoom({ game: takeAITurn(game) }), 800);
    return () => clearTimeout(id);
  }, [isHost, started, game, matchOver, writeRoom]);

  // Host: answer a pending Laban on behalf of any AI that still owes a reply.
  useEffect(() => {
    if (!isHost || !game || game.result || !game.pendingLaban) return;
    const owes = game.pendingLaban.responses.some((r, i) => r === null && game.players[i].isAI);
    if (!owes) return;
    const id = setTimeout(() => writeRoom({ game: takeAITurn(game) }), 700);
    return () => clearTimeout(id);
  }, [isHost, game, writeRoom]);

  // Host: on a finished round, tally the win AND settle wallets — once. 3-player
  // uses the pot/heater/ante betting; heads-up uses the simple per-hand stake.
  useEffect(() => {
    if (!isHost || !game || !game.result || countedRef.current) return;
    countedRef.current = true;
    const N = game.players.length;
    const winner = game.result.winner;
    const newWins = winner >= 0 ? wins.map((n, i) => (i === winner ? n + 1 : n)) : wins;
    const base = roomRef.current;
    let deltas: number[];
    let bet = base?.bet;
    if (N === 3) {
      const outcome: HandOutcome = { playerCount: N, winner, laban: game.result.laban };
      const settled = settleHand(base?.bet ?? freshBet(), outcome);
      deltas = settled.deltas;
      bet = settled.bet;
    } else {
      // heads-up: loser pays the winner the stake (a TONGITS! win pays double)
      const stake = (game.rules.stake ?? 10) * (game.result.reason === "tongits" ? 2 : 1);
      deltas = game.players.map((_, i) => (winner < 0 ? 0 : i === winner ? stake : -stake));
    }
    writeRoom({ wins: newWins, bet, settleSeq: (base?.settleSeq ?? 0) + 1, settleDeltas: deltas });
  }, [isHost, game, wins, writeRoom]);

  const deal = useCallback(
    (dealer: number, newWins: number[], nextGameId: number) => {
      const base = roomRef.current;
      if (!isHost || !base?.game) return;
      countedRef.current = false;
      writeRoom({ game: dealFromSeats(base, dealer), wins: newWins, gameId: nextGameId });
    },
    [isHost, writeRoom],
  );

  const nextGame = useCallback(() => {
    if (game) deal((game.dealer + 1) % game.players.length, wins, gameId + 1);
  }, [game, wins, gameId, deal]);

  const newMatch = useCallback(() => {
    const base = roomRef.current;
    if (!isHost || !base?.game) return;
    countedRef.current = false;
    const opening = base.game.players.length === 3 ? openMatch(3) : null; // fresh pot (3-player only)
    writeRoom({
      game: dealFromSeats(base, 0),
      wins: base.game.players.map(() => 0),
      gameId: gameId + 1,
      bet: opening?.bet,
      settleSeq: (base.settleSeq ?? 0) + 1,
      settleDeltas: opening ? opening.deltas : base.game.players.map(() => 0),
    });
  }, [isHost, gameId, writeRoom]);

  return {
    room,
    game,
    wins,
    gameId,
    target,
    matchOver,
    connected,
    seats,
    started,
    isHost,
    meIndex,
    dispatch,
    start,
    addBot,
    nextGame,
    newMatch,
  };
}
