// Messages between the table server on the PC, the board page and the phones.
// The server is the only judge: devices send what they want to do, the server decides and
// sends each device back only what it may see.

import type { PlayerColor } from '../game/players';
import type { GameState, NewGameOptions, Roll } from '../game/state';
import type { Action, BuildKind, Building, Hand, LogEntry, Resource, Robber, RulesState, Steal, TradeOffer } from '../rules/engine';

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
  | { kind: 'thief' }
  | { kind: 'update' };

/** The rules state as everyone may see it: pieces and card counts, never which cards. */
export interface PublicRules {
  phase: RulesState['phase'];
  buildings: (Building | null)[];
  roads: (number | null)[];
  cards: number[];
  points: number[];
  rolled: boolean;
  /** A build waiting on the board: where it may go and the spot tapped so far. */
  pending: { seat: number; kind: BuildKind; legal: number[]; at: number | null } | null;
  robber: PublicRobber | null;
}

/** The thief's progress after a 7, without the order of the face-down cards. */
export interface PublicRobber {
  stage: Robber['stage'];
  owed: number[];
  tile: number | null;
  victims: number[];
  victim: number | null;
  /** How many face-down cards the roller is picking from. */
  count: number;
}

export interface BoardView {
  id: string;
  /** False while phones are still joining. */
  started: boolean;
  game: GameState;
  rules: PublicRules;
  seats: SeatView[];
  /** The address phones open, also shown as a QR code. */
  joinUrl: string;
}

/** What the phone's player can do right now; the server checks again when they do it. */
export interface PhoneCan {
  roll: boolean;
  build: Record<BuildKind, boolean>;
  cancel: boolean;
  undo: boolean;
  trade: boolean;
  endTurn: boolean;
}

export interface PhoneMe {
  hand: Hand;
  pieces: Record<BuildKind, number>;
  points: number;
  /** Cards needed per card from the bank, for each card given. */
  rates: Record<Resource, number>;
  /** What to place during setup, when it's this player's step. */
  setupNeed: 'settlement' | 'road' | null;
  /** The piece this player is placing on the board. */
  placing: BuildKind | null;
  can: PhoneCan;
}

export interface PhoneView {
  id: string;
  started: boolean;
  seats: SeatView[];
  current: number;
  /** This phone's seat, or null until it claims one. */
  you: number | null;
  phase: RulesState['phase'];
  lastRoll: Roll | null;
  players: { cards: number; points: number }[];
  me: PhoneMe | null;
  /** A trade offer this phone made or was sent. */
  offer: TradeOffer | null;
  robber: PublicRobber | null;
  /** Only for the victim: their own cards in the face-down order, so they see which one goes. */
  myOrder: Resource[] | null;
  /** The last card taken, if this phone took it or lost it. */
  stolen: Steal | null;
  log: LogEntry[];
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
  | { type: 'rejoinCode'; seat: number }
  // Either: a move in the game. The board acts for the current player.
  | { type: 'act'; action: Action };

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
