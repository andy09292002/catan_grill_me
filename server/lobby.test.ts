import { describe, expect, it } from 'vitest';
import type { NewGameOptions } from '../src/game/state';
import type { ClientMessage, ServerMessage } from '../src/net/protocol';
import { isSavedTable, Lobby, type Conn, type SavedTable } from './lobby';

const OPTIONS: NewGameOptions = { colors: ['red', 'blue', 'white'], firstSeat: 0, size: 19, mode: 'balanced', seed: 42, thiefStyle: 'onscreen' };

function setup(saved: SavedTable | null = null) {
  let n = 0;
  const saves: (SavedTable | null)[] = [];
  const lobby = new Lobby({ joinUrl: 'http://pc:5180/phone.html', save: (t) => saves.push(t && structuredClone(t)), newId: () => `id${++n}`, roll: () => [3, 4] }, saved);
  const conn = () => {
    const inbox: ServerMessage[] = [];
    const c: Conn & { inbox: ServerMessage[]; last: <T extends ServerMessage['type']>(t: T) => Extract<ServerMessage, { type: T }> | undefined } = {
      role: null,
      seat: null,
      send: (m) => inbox.push(m),
      inbox,
      last: (t) => [...inbox].reverse().find((m) => m.type === t) as never,
    };
    lobby.connect(c);
    return c;
  };
  const say = (c: Conn, m: ClientMessage) => lobby.receive(c, m);
  return { lobby, conn, say, saves };
}

/** A table with a board and every seat claimed by a phone. */
function fullTable() {
  const t = setup();
  const board = t.conn();
  t.say(board, { type: 'hello', role: 'board' });
  t.say(board, { type: 'create', options: OPTIONS });
  const phones = OPTIONS.colors.map((_, seat) => {
    const p = t.conn();
    t.say(p, { type: 'hello', role: 'phone' });
    t.say(p, { type: 'claim', seat });
    return p;
  });
  return { ...t, board, phones };
}

describe('joining', () => {
  it('tells devices there is no game until the board makes one', () => {
    const { conn, say } = setup();
    const board = conn();
    const phone = conn();
    say(board, { type: 'hello', role: 'board' });
    say(phone, { type: 'hello', role: 'phone' });
    expect(board.last('noTable')).toBeTruthy();
    expect(phone.last('noTable')).toBeTruthy();
  });

  it('lets each phone claim one free seat and gives it a key', () => {
    const { conn, say } = setup();
    const board = conn();
    say(board, { type: 'hello', role: 'board' });
    say(board, { type: 'create', options: OPTIONS });
    const a = conn();
    const b = conn();
    say(a, { type: 'hello', role: 'phone' });
    say(b, { type: 'hello', role: 'phone' });
    expect(a.last('phone')!.view.you).toBeNull();

    say(a, { type: 'claim', seat: 1 });
    expect(a.last('welcome')).toMatchObject({ tableId: 'id1' });
    expect(a.last('phone')!.view.you).toBe(1);

    say(b, { type: 'claim', seat: 1 });
    expect(b.last('error')).toBeTruthy();
    expect(b.seat).toBeNull();
    say(a, { type: 'claim', seat: 2 });
    expect(a.seat).toBe(1);

    const seats = board.last('board')!.view.seats;
    expect(seats.map((s) => s.claimed)).toEqual([false, true, false]);
    expect(seats[1].connected).toBe(true);
  });

  it('starts only once every seat has a phone', () => {
    const { conn, say } = setup();
    const board = conn();
    say(board, { type: 'hello', role: 'board' });
    say(board, { type: 'create', options: OPTIONS });
    const phones = [0, 1].map((seat) => {
      const p = conn();
      say(p, { type: 'hello', role: 'phone' });
      say(p, { type: 'claim', seat });
      return p;
    });
    say(board, { type: 'start' });
    expect(board.last('board')!.view.started).toBe(false);
    const last = conn();
    say(last, { type: 'hello', role: 'phone' });
    say(last, { type: 'claim', seat: 2 });
    say(board, { type: 'start' });
    expect(board.last('board')).toMatchObject({ view: { started: true }, event: { kind: 'start' } });
    expect(phones[0].last('phone')!.view.started).toBe(true);
  });

  it('refuses bad new-game options', () => {
    const { conn, say } = setup();
    const board = conn();
    say(board, { type: 'hello', role: 'board' });
    say(board, { type: 'create', options: { ...OPTIONS, colors: ['red', 'red'] } });
    say(board, { type: 'create', options: { ...OPTIONS, firstSeat: 7 } });
    expect(board.inbox.filter((m) => m.type === 'board')).toHaveLength(0);
  });
});

describe('getting back in', () => {
  it('puts a phone back in its seat with its key after a drop', () => {
    const { lobby, conn, say, board, phones } = fullTable();
    const key = (phones[0].inbox.find((m) => m.type === 'welcome') as { key: string }).key;
    lobby.disconnect(phones[0]);
    expect(board.last('board')!.view.seats[0]).toMatchObject({ claimed: true, connected: false });

    const again = conn();
    say(again, { type: 'hello', role: 'phone', key });
    expect(again.seat).toBe(0);
    expect(again.last('phone')!.view.you).toBe(0);
    expect(board.last('board')!.view.seats[0].connected).toBe(true);
  });

  it('ignores unknown keys', () => {
    const { conn, say } = fullTable();
    const stranger = conn();
    say(stranger, { type: 'hello', role: 'phone', key: 'guess' });
    expect(stranger.seat).toBeNull();
  });

  it('moves a seat to a new phone with a one-time code, and the old phone loses it', () => {
    const { conn, say, board, phones } = fullTable();
    const oldKey = (phones[1].inbox.find((m) => m.type === 'welcome') as { key: string }).key;
    say(board, { type: 'rejoinCode', seat: 1 });
    const url = board.last('rejoinCode')!.url;
    expect(url.startsWith('http://pc:5180/phone.html?rejoin=')).toBe(true);
    const code = new URL(url).searchParams.get('rejoin')!;

    const fresh = conn();
    say(fresh, { type: 'hello', role: 'phone', rejoin: code });
    expect(fresh.seat).toBe(1);
    expect(phones[1].last('kicked')).toBeTruthy();
    expect(phones[1].seat).toBeNull();

    // The old key and the code are both used up.
    const old = conn();
    say(old, { type: 'hello', role: 'phone', key: oldKey });
    expect(old.seat).toBeNull();
    const again = conn();
    say(again, { type: 'hello', role: 'phone', rejoin: code });
    expect(again.seat).toBeNull();
  });

  it('only the board can ask for a rejoin code or run the game', () => {
    const { say, board, phones } = fullTable();
    say(phones[0], { type: 'rejoinCode', seat: 1 });
    say(phones[0], { type: 'start' });
    expect(phones[0].last('rejoinCode')).toBeUndefined();
    expect(board.last('board')!.view.started).toBe(false);
  });
});

describe('playing', () => {
  it('rolls on the server and sends the roll to every device', () => {
    const { say, board, phones } = fullTable();
    say(board, { type: 'start' });
    say(board, { type: 'roll' });
    expect(board.last('board')).toMatchObject({ event: { kind: 'roll', roll: { total: 7, dice: [3, 4] } } });
    say(board, { type: 'enterRoll', total: 11 });
    expect(board.last('board')!.view.game.lastRoll).toEqual({ total: 11, dice: null });
    say(board, { type: 'enterRoll', total: 13 });
    expect(board.last('board')!.view.game.history).toHaveLength(2);
    say(board, { type: 'nextTurn' });
    expect(phones[1].last('phone')!.view.current).toBe(1);
  });

  it('does nothing in the game before it starts', () => {
    const { say, board } = fullTable();
    say(board, { type: 'roll' });
    expect(board.last('board')!.view.game.history).toHaveLength(0);
  });

  it('moves the thief to another tile only', () => {
    const { say, board } = fullTable();
    say(board, { type: 'start' });
    const from = board.last('board')!.view.game.thiefTile!;
    say(board, { type: 'moveThief', tile: from });
    expect(board.last('board')!.event).toEqual({ kind: 'start' });
    say(board, { type: 'moveThief', tile: (from + 1) % 19 });
    expect(board.last('board')).toMatchObject({ event: { kind: 'thief' }, view: { game: { thiefTile: (from + 1) % 19 } } });
  });

  it('never sends phones the whole game', () => {
    const { say, board, phones } = fullTable();
    say(board, { type: 'start' });
    for (const p of phones) for (const m of p.inbox) expect(JSON.stringify(m)).not.toContain('"game"');
  });
});

describe('saving', () => {
  it('saves after every change and carries on from the save', () => {
    const { say, board, saves } = fullTable();
    say(board, { type: 'start' });
    say(board, { type: 'roll' });
    const saved = saves.at(-1)!;
    expect(isSavedTable(saved)).toBe(true);
    expect(saved.started).toBe(true);

    const next = setup(saved);
    const b = next.conn();
    next.say(b, { type: 'hello', role: 'board' });
    expect(b.last('board')!.view.game.lastRoll!.total).toBe(7);
    const p = next.conn();
    next.say(p, { type: 'hello', role: 'phone', key: saved.keys[2]! });
    expect(p.seat).toBe(2);
  });

  it('closing the table forgets the game and lets the phones go', () => {
    const { say, board, phones, saves } = fullTable();
    say(board, { type: 'close' });
    expect(saves.at(-1)).toBeNull();
    expect(phones[0].last('noTable')).toBeTruthy();
    expect(phones[0].seat).toBeNull();
  });

  it('rejects damaged saves', () => {
    const { saves, board, say } = fullTable();
    say(board, { type: 'start' });
    const good = saves.at(-1)!;
    expect(isSavedTable({ ...good, keys: good.keys.slice(1) })).toBe(false);
    expect(isSavedTable({ ...good, version: 2 })).toBe(false);
    expect(isSavedTable({ ...good, game: { ...good.game, current: 9 } })).toBe(false);
  });
});
