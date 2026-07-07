import { newGame, type BgState } from "./game";
import { type LobbySeat } from "../online/Lobby";
import { hostSeatRoom, useSeatRoom, type SeatRoom } from "../online/useSeatRoom";

export const MIN_BG_SEATS = 2;
export const MAX_BG_SEATS = 2;

export type BgRoom = SeatRoom<BgState>;

export const hostBackgammonRoom = (host: LobbySeat) => hostSeatRoom("backgammon", host);

/** A live 2-player Backgammon room on the shared seat-lobby transport (turn-based). */
export const useOnlineBackgammon = (code: string, mySeat: LobbySeat) =>
  useSeatRoom<BgState>(code, mySeat, {
    minSeats: MIN_BG_SEATS,
    maxSeats: MAX_BG_SEATS,
    buildGame: (seats) => newGame(seats.map((s) => s.name), seats.map((s) => s.isAI ?? false)),
  });
