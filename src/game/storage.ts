import { CONTENTS, type SavedBoard } from '../board/generate';
import { buildLayout } from '../board/layout';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from './players';
import type { GameState, Roll } from './state';

export const STORAGE_KEY = 'hex-board/game';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage can be missing or throw (private windows, blocked storage); the game still runs without it. */
function defaultStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Out of space or blocked: keep playing unsaved.
  }
}

export function loadGame(store: KeyValueStore | null = defaultStore()): GameState | null {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state: unknown = JSON.parse(raw);
    return isGameState(state) ? state : null;
  } catch {
    return null;
  }
}

export function clearGame(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function isRoll(r: unknown): r is Roll {
  if (typeof r !== 'object' || r === null) return false;
  const { total, dice } = r as Roll;
  if (!isInt(total, 2, 12)) return false;
  if (dice === null) return true;
  return Array.isArray(dice) && dice.length === 2 && dice.every((d) => isInt(d, 1, 6)) && dice[0] + dice[1] === total;
}

function isSavedBoard(b: unknown): b is SavedBoard {
  if (typeof b !== 'object' || b === null) return false;
  const board = b as SavedBoard;
  if (board.size !== 19 && board.size !== 30) return false;
  if (!['random', 'balanced', 'balancedPlus'].includes(board.mode)) return false;
  const contents = CONTENTS[board.size];
  const coast = buildLayout(board.size).coast.length;
  return (
    Array.isArray(board.tiles) &&
    board.tiles.length === board.size &&
    board.tiles.every(
      (t) => t.terrain in contents.terrain && (t.terrain === 'desert' ? t.number === null : isInt(t.number, 2, 12)),
    ) &&
    Array.isArray(board.harbors) &&
    board.harbors.every((h) => h.kind in contents.harbors && isInt(h.coast, 0, coast - 1))
  );
}

function isGameState(s: unknown): s is GameState {
  if (typeof s !== 'object' || s === null) return false;
  const g = s as GameState;
  const players = Array.isArray(g.colors) ? g.colors.length : 0;
  return (
    g.version === 1 &&
    isSavedBoard(g.board) &&
    players >= MIN_PLAYERS &&
    players <= MAX_PLAYERS &&
    g.colors.every((c) => PLAYER_COLORS.includes(c)) &&
    new Set(g.colors).size === players &&
    isInt(g.firstSeat, 0, players - 1) &&
    isInt(g.current, 0, players - 1) &&
    isInt(g.turn, 1, Number.MAX_SAFE_INTEGER) &&
    (g.lastRoll === null || isRoll(g.lastRoll)) &&
    Array.isArray(g.history) &&
    g.history.every(isRoll)
  );
}
