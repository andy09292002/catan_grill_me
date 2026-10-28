import { generateBoard, saveBoard, type RandomMode, type SavedBoard } from '../board/generate';
import type { BoardSize } from '../board/layout';
import type { Dice } from './dice';
import { seatAngle, type PlayerColor } from './players';

export interface Roll {
  total: number;
  /** The two dice when the app rolled; null when the total was entered from physical dice. */
  dice: Dice | null;
}

export interface GameState {
  version: 1;
  board: SavedBoard;
  /** One color per seat, in seat order (seat 0 is the bottom edge, then clockwise). */
  colors: PlayerColor[];
  firstSeat: number;
  current: number;
  /** Turns taken so far, starting at 1. */
  turn: number;
  lastRoll: Roll | null;
  /** Most recent first. */
  history: Roll[];
}

export const HISTORY_LIMIT = 60;

export interface NewGameOptions {
  colors: PlayerColor[];
  firstSeat: number;
  size: BoardSize;
  mode: RandomMode;
  seed: number;
}

export function createGame({ colors, firstSeat, size, mode, seed }: NewGameOptions): GameState {
  return {
    version: 1,
    board: saveBoard(generateBoard({ size, mode, seed })),
    colors: colors.slice(),
    firstSeat,
    current: firstSeat,
    turn: 1,
    lastRoll: null,
    history: [],
  };
}

export function nextTurn(state: GameState): GameState {
  return { ...state, current: (state.current + 1) % state.colors.length, turn: state.turn + 1 };
}

export function recordRoll(state: GameState, roll: Roll): GameState {
  return { ...state, lastRoll: roll, history: [roll, ...state.history].slice(0, HISTORY_LIMIT) };
}

/** Degrees the board's text turns to face the current player. */
export function currentAngle(state: GameState): number {
  return seatAngle(state.current, state.colors.length);
}

/** How often each total from 2 to 12 has been rolled this game. */
export function rollCounts(state: GameState): Map<number, number> {
  const counts = new Map<number, number>();
  for (let n = 2; n <= 12; n++) counts.set(n, 0);
  for (const r of state.history) counts.set(r.total, (counts.get(r.total) ?? 0) + 1);
  return counts;
}
