import { newGame, type BattleState } from "./game";
import { type LobbySeat } from "../online/Lobby";
import { hostSeatRoom, useSeatRoom, type SeatRoom } from "../online/useSeatRoom";

export const MIN_BS_SEATS = 2;
export const MAX_BS_SEATS = 2;

export type BattleRoom = SeatRoom<BattleState>;

export const hostBattleshipRoom = (host: LobbySeat) => hostSeatRoom("battleship", host);

/** A live 2-player Battleship room. Placement is simultaneous, so callers use
 *  `mutate` (compare-and-swap) rather than the optimistic `write`. */
export const useOnlineBattleship = (code: string, mySeat: LobbySeat) =>
  useSeatRoom<BattleState>(code, mySeat, {
    minSeats: MIN_BS_SEATS,
    maxSeats: MAX_BS_SEATS,
    buildGame: (seats) => newGame(seats.map((s) => s.name), seats.map((s) => s.isAI ?? false)),
  });
