import { rollDice } from '../src/game/dice';
import { isGameState } from '../src/game/storage';
import { createGame, moveThief, nextTurn, recordRoll, type GameState, type NewGameOptions } from '../src/game/state';
import type { BoardView, ClientMessage, PhoneView, SeatView, ServerMessage, TableEvent } from '../src/net/protocol';

/** One open connection: the board page or a phone. */
export interface Conn {
  role: 'board' | 'phone' | null;
  seat: number | null;
  send(msg: ServerMessage): void;
}

/** What the server keeps on disk, so a restarted PC carries on with the same game and phones. */
export interface SavedTable {
  version: 1;
  id: string;
  started: boolean;
  game: GameState;
  /** Each seat's phone key, or null until a phone claims it. */
  keys: (string | null)[];
}

export interface LobbyOptions {
  joinUrl: string;
  /** Called after every change. */
  save(table: SavedTable | null): void;
  newId?: () => string;
  roll?: () => [number, number];
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export function isSavedTable(t: unknown): t is SavedTable {
  if (typeof t !== 'object' || t === null) return false;
  const s = t as SavedTable;
  return (
    s.version === 1 &&
    typeof s.id === 'string' &&
    typeof s.started === 'boolean' &&
    isGameState(s.game) &&
    Array.isArray(s.keys) &&
    s.keys.length === s.game.colors.length &&
    s.keys.every((k) => k === null || typeof k === 'string')
  );
}

/**
 * The table: seats, the phones holding them, and the game. Every message from a device comes
 * through `receive`; every change is saved and sent out to all devices.
 */
export class Lobby {
  private conns = new Set<Conn>();
  /** One-time codes that move a seat to another phone. Not saved: a restart just needs a new code. */
  private rejoin = new Map<string, number>();
  private readonly newId: () => string;
  private readonly roll: () => [number, number];

  constructor(
    private readonly opts: LobbyOptions,
    private table: SavedTable | null = null,
  ) {
    this.newId = opts.newId ?? (() => crypto.randomUUID());
    this.roll = opts.roll ?? rollDice;
  }

  connect(conn: Conn) {
    this.conns.add(conn);
  }

  disconnect(conn: Conn) {
    this.conns.delete(conn);
    if (conn.role === 'phone' && conn.seat !== null) this.broadcast({ kind: 'seats' });
  }

  receive(conn: Conn, msg: ClientMessage) {
    if (msg.type === 'hello') {
      if (msg.role === 'board') {
        conn.role = 'board';
        this.sendTo(conn);
      } else if (msg.role === 'phone') {
        conn.role = 'phone';
        this.phoneHello(conn, msg.key, msg.rejoin);
      }
      return;
    }
    if (conn.role === 'phone') this.fromPhone(conn, msg);
    else if (conn.role === 'board') this.fromBoard(conn, msg);
  }

  private phoneHello(conn: Conn, key: unknown, rejoin: unknown) {
    const t = this.table;
    conn.seat = null;
    if (t && typeof rejoin === 'string' && this.rejoin.has(rejoin)) {
      const seat = this.rejoin.get(rejoin)!;
      this.rejoin.delete(rejoin);
      this.giveSeat(conn, seat);
      return;
    }
    if (t && typeof key === 'string') {
      const seat = t.keys.indexOf(key);
      if (seat >= 0) {
        this.takeOver(conn, seat);
        conn.seat = seat;
        this.broadcast({ kind: 'seats' });
        return;
      }
    }
    this.sendTo(conn);
  }

  private fromPhone(conn: Conn, msg: ClientMessage) {
    const t = this.table;
    if (msg.type !== 'claim' || !t || conn.seat !== null) return;
    if (!isInt(msg.seat, 0, t.keys.length - 1) || t.keys[msg.seat] !== null) {
      conn.send({ type: 'error', message: 'That seat is taken' });
      this.sendTo(conn);
      return;
    }
    this.giveSeat(conn, msg.seat);
  }

  /** Gives `conn` the seat with a fresh key, so any older key for it stops working. */
  private giveSeat(conn: Conn, seat: number) {
    const t = this.table!;
    const key = this.newId();
    t.keys[seat] = key;
    this.takeOver(conn, seat);
    conn.seat = seat;
    conn.send({ type: 'welcome', tableId: t.id, key });
    this.changed({ kind: 'seats' });
  }

  /** Any other phone on this seat loses it. */
  private takeOver(conn: Conn, seat: number) {
    for (const other of this.conns) {
      if (other !== conn && other.role === 'phone' && other.seat === seat) {
        other.seat = null;
        other.send({ type: 'kicked' });
      }
    }
  }

  private fromBoard(conn: Conn, msg: ClientMessage) {
    if (msg.type === 'create') {
      if (!isNewGameOptions(msg.options)) return;
      const game = createGame(msg.options);
      this.table = { version: 1, id: this.newId(), started: false, game, keys: game.colors.map(() => null) };
      this.rejoin.clear();
      for (const c of this.conns) if (c.role === 'phone') c.seat = null;
      this.changed({ kind: 'new' });
      return;
    }
    if (msg.type === 'close') {
      this.table = null;
      this.rejoin.clear();
      for (const c of this.conns) if (c.role === 'phone') c.seat = null;
      this.changed();
      return;
    }

    const t = this.table;
    if (!t) return;
    switch (msg.type) {
      case 'start':
        if (t.started || t.keys.some((k) => k === null)) return;
        t.started = true;
        this.changed({ kind: 'start' });
        return;
      case 'rejoinCode': {
        if (!isInt(msg.seat, 0, t.keys.length - 1)) return;
        const code = this.newId();
        this.rejoin.set(code, msg.seat);
        conn.send({ type: 'rejoinCode', seat: msg.seat, url: `${this.opts.joinUrl}?rejoin=${encodeURIComponent(code)}` });
        return;
      }
    }

    if (!t.started) return;
    switch (msg.type) {
      case 'roll': {
        const dice = this.roll();
        this.play(recordRoll(t.game, { total: dice[0] + dice[1], dice }), (game) => ({ kind: 'roll', roll: game.lastRoll! }));
        return;
      }
      case 'enterRoll':
        if (!isInt(msg.total, 2, 12)) return;
        this.play(recordRoll(t.game, { total: msg.total, dice: null }), (game) => ({ kind: 'roll', roll: game.lastRoll! }));
        return;
      case 'nextTurn':
        this.play(nextTurn(t.game), () => ({ kind: 'turn' }));
        return;
      case 'moveThief': {
        if (!isInt(msg.tile, 0, t.game.board.tiles.length - 1)) return;
        const game = moveThief(t.game, msg.tile);
        if (game !== t.game) this.play(game, () => ({ kind: 'thief' }));
        return;
      }
    }
  }

  private play(game: GameState, event: (game: GameState) => TableEvent) {
    this.table!.game = game;
    this.changed(event(game));
  }

  private changed(event?: TableEvent) {
    this.opts.save(this.table);
    this.broadcast(event);
  }

  private broadcast(event?: TableEvent) {
    for (const c of this.conns) this.sendTo(c, event);
  }

  private sendTo(conn: Conn, event?: TableEvent) {
    const t = this.table;
    if (conn.role === null) return;
    if (!t) {
      conn.send({ type: 'noTable' });
      return;
    }
    if (conn.role === 'board') conn.send({ type: 'board', view: this.boardView(), event });
    else conn.send({ type: 'phone', view: this.phoneView(conn) });
  }

  private seats(): SeatView[] {
    const t = this.table!;
    return t.game.colors.map((color, seat) => ({
      color,
      claimed: t.keys[seat] !== null,
      connected: [...this.conns].some((c) => c.role === 'phone' && c.seat === seat),
    }));
  }

  private boardView(): BoardView {
    const t = this.table!;
    return { id: t.id, started: t.started, game: t.game, seats: this.seats(), joinUrl: this.opts.joinUrl };
  }

  private phoneView(conn: Conn): PhoneView {
    const t = this.table!;
    return { id: t.id, started: t.started, seats: this.seats(), current: t.game.current, you: conn.seat };
  }
}

function isNewGameOptions(o: unknown): o is NewGameOptions {
  if (typeof o !== 'object' || o === null) return false;
  try {
    // createGame builds exactly what isGameState checks, so a bad option shows up there.
    return isGameState(createGame(o as NewGameOptions)) && Number.isInteger((o as NewGameOptions).seed);
  } catch {
    return false;
  }
}
