import { generateBoard, saveBoard, type RandomMode, type SavedBoard } from '../board/generate';
import type { BoardSize } from '../board/layout';
import type { Dice } from './dice';
import { seatAngle, type PlayerColor } from './players';

export interface Roll {
  total: number;
  /** The two dice when the app rolled; null when the total was entered from physical dice. */
  dice: Dice | null;
}

export type ThiefStyle = 'onscreen' | 'physical';

export interface GameState {
  version: 2;
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
  thiefStyle: ThiefStyle;
  /** The tile the on-screen thief is on; always null with a physical thief, which the app can't see. */
  thiefTile: number | null;
}

export const HISTORY_LIMIT = 60;

export interface NewGameOptions {
  colors: PlayerColor[];
  firstSeat: number;
  size: BoardSize;
  mode: RandomMode;
  seed: number;
  thiefStyle: ThiefStyle;
}

export function createGame({ colors, firstSeat, size, mode, seed, thiefStyle }: NewGameOptions): GameState {
  const board = saveBoard(generateBoard({ size, mode, seed }));
  return {
    version: 2,
    board,
    colors: colors.slice(),
    firstSeat,
    current: firstSeat,
    turn: 1,
    lastRoll: null,
    history: [],
    thiefStyle,
    thiefTile: thiefStyle === 'onscreen' ? thiefStartTile(board) : null,
  };
}

/** The thief starts on the desert (the first one, on the 30-hex board). */
export function thiefStartTile(board: SavedBoard): number {
  return board.tiles.findIndex((t) => t.terrain === 'desert');
}

/** Moves the on-screen thief. Returns the state unchanged for a physical thief or the same tile. */
export function moveThief(state: GameState, tile: number): GameState {
  if (state.thiefStyle !== 'onscreen' || tile === state.thiefTile || tile < 0 || tile >= state.board.tiles.length) {
    return state;
  }
  return { ...state, thiefTile: tile };
}

/**
 * Which tiles produce on a roll. The on-screen thief's tile is blocked instead; with a physical
 * thief the app can't know where it is, so every matching tile lights up.
 */
export function production(state: GameState, total: number): { lit: Set<number>; blocked: Set<number> } {
  const lit = new Set<number>();
  const blocked = new Set<number>();
  state.board.tiles.forEach((t, id) => {
    if (t.number !== total) return;
    if (state.thiefStyle === 'onscreen' && id === state.thiefTile) blocked.add(id);
    else lit.add(id);
  });
  return { lit, blocked };
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
