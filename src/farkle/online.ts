import { type FarkleRules, CLASSIC } from "./rules";
import { newGame, type FarkleState } from "./game";
import { type LobbySeat } from "../online/Lobby";
import { hostSeatRoom, useSeatRoom, type SeatRoom } from "../online/useSeatRoom";

export const MIN_FARKLE_SEATS = 2;
export const MAX_FARKLE_SEATS = 6;

/** The room carries the chosen ruleset as its config, so Start deals with it. */
export type FarkleRoom = SeatRoom<FarkleState, FarkleRules>;

export const hostFarkleRoom = (host: LobbySeat, rules: FarkleRules) =>
  hostSeatRoom<FarkleRules>("pressyourluck", host, rules);

/** A live 2–6 player Press Your Luck room on the shared seat-lobby transport. */
export const useOnlineFarkle = (code: string, mySeat: LobbySeat) =>
  useSeatRoom<FarkleState, FarkleRules>(code, mySeat, {
    minSeats: MIN_FARKLE_SEATS,
    maxSeats: MAX_FARKLE_SEATS,
    buildGame: (seats, rules) => newGame(rules ?? CLASSIC, seats.map((s) => s.name), seats.map((s) => s.isAI ?? false)),
  });
