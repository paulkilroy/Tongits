import { newGame, type SFState } from "./game";
import { type LobbySeat } from "../online/Lobby";
import { hostSeatRoom, useSeatRoom, type SeatRoom } from "../online/useSeatRoom";

export const MIN_SF_SEATS = 2;
export const MAX_SF_SEATS = 6;

export type SFRoom = SeatRoom<SFState>;

export const hostSixtyFiveRoom = (host: LobbySeat) => hostSeatRoom("sixtyfive", host);

/** A live 2–6 player "65" room on the shared seat-lobby transport (turn-based). */
export const useOnlineSixtyFive = (code: string, mySeat: LobbySeat) =>
  useSeatRoom<SFState>(code, mySeat, {
    minSeats: MIN_SF_SEATS,
    maxSeats: MAX_SF_SEATS,
    buildGame: (seats) => newGame(seats.map((s) => s.name), seats.map((s) => s.isAI ?? false)),
  });
