// Messages between the table server on the PC, the board page and the phones.
// The server is the only judge: devices send what they want to do, the server decides and
// sends each device back only what it may see.

import type { PlayerColor } from '../game/players';
import type { GameState, NewGameOptions, Roll } from '../game/state';

export const TABLE_PORT = 5180;
export const SOCKET_PATH = '/ws';

export interface SeatView {
  color: PlayerColor;
  /** A phone has claimed this seat. */
  claimed: boolean;
  /** That phone is connected right now. */
  connected: boolean;
}

/** What just happened, so the board can play the matching animation. */
export type TableEvent =
  | { kind: 'new' }
  | { kind: 'start' }
  | { kind: 'seats' }
  | { kind: 'roll'; roll: Roll }
  | { kind: 'turn' }
  | { kind: 'thief' };

export interface BoardView {
  id: string;
  /** False while phones are still joining. */
  started: boolean;
  game: GameState;
  seats: SeatView[];
  /** The address phones open, also shown as a QR code. */
  joinUrl: string;
}

export interface PhoneView {
  id: string;
  started: boolean;
  seats: SeatView[];
  current: number;
  /** This phone's seat, or null until it claims one. */
  you: number | null;
}

export type ClientMessage =
  | { type: 'hello'; role: 'board' }
  | { type: 'hello'; role: 'phone'; key?: string; rejoin?: string }
  // Phone
  | { type: 'claim'; seat: number }
  // Board
  | { type: 'create'; options: NewGameOptions }
  | { type: 'close' }
  | { type: 'start' }
  | { type: 'roll' }
  | { type: 'enterRoll'; total: number }
  | { type: 'nextTurn' }
  | { type: 'moveThief'; tile: number }
  | { type: 'rejoinCode'; seat: number };

export type ServerMessage =
  | { type: 'noTable' }
  | { type: 'board'; view: BoardView; event?: TableEvent }
  | { type: 'phone'; view: PhoneView }
  /** Sent when a phone takes a seat: it keeps the key to get back in after a reconnect. */
  | { type: 'welcome'; tableId: string; key: string }
  | { type: 'rejoinCode'; seat: number; url: string }
  /** This phone's seat moved to another phone. */
  | { type: 'kicked' }
  | { type: 'error'; message: string };
