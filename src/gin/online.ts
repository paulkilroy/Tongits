import { newGame, type GinState } from "./game";
import { type LobbySeat } from "../online/Lobby";
import { hostSeatRoom, useSeatRoom, type SeatRoom } from "../online/useSeatRoom";

export const MIN_GIN_SEATS = 2;
export const MAX_GIN_SEATS = 2;

export type GinRoom = SeatRoom<GinState>;

export const hostGinRoom = (host: LobbySeat) => hostSeatRoom("gin", host);

/** A live 2-player Gin room on the shared seat-lobby transport (turn-based). */
export const useOnlineGin = (code: string, mySeat: LobbySeat) =>
  useSeatRoom<GinState>(code, mySeat, {
    minSeats: MIN_GIN_SEATS,
    maxSeats: MAX_GIN_SEATS,
    buildGame: (seats) => newGame(seats.map((s) => s.name), seats.map((s) => s.isAI ?? false)),
  });
