import { useCallback } from "react";
import { type Card } from "../engine/cards";
import { type CribState, discardToCrib, newRound, STANDARD_CRIB_RULES } from "./game";
import { type LobbySeat } from "../online/Lobby";
import { hostSeatRoom, useSeatRoom, type SeatRoom } from "../online/useSeatRoom";

export const MIN_CRIB_SEATS = 2;
export const MAX_CRIB_SEATS = 3;

export type CribRoom = SeatRoom<CribState>;

const randSeed = () => Math.floor(Math.random() * 2 ** 31);

export const hostCribbageRoom = (host: LobbySeat) => hostSeatRoom("cribbage", host);

/** A live 2–3 player Cribbage room. Turn-based, but discards happen at once, so
 *  `discard` uses the shared compare-and-swap `mutate`. */
export function useOnlineCribbage(code: string, mySeat: LobbySeat) {
  const room = useSeatRoom<CribState>(code, mySeat, {
    minSeats: MIN_CRIB_SEATS,
    maxSeats: MAX_CRIB_SEATS,
    buildGame: (seats) =>
      newRound(STANDARD_CRIB_RULES, randSeed(), seats.map((s) => s.name), seats.map((s) => s.isAI ?? false), 0),
  });
  const { mutate } = room;
  const discard = useCallback((seat: number, cards: Card[]) => mutate((g) => discardToCrib(g, seat, cards)), [mutate]);
  return { ...room, discard };
}
