import { describe, expect, it } from 'vitest';
import type { NewGameOptions } from '../src/game/state';
import type { ClientMessage, ServerMessage } from '../src/net/protocol';
import { geometryOf } from '../src/rules/engine';
import { isSavedTable, Lobby, type Conn, type SavedTable } from './lobby';

const OPTIONS: NewGameOptions = { colors: ['red', 'blue', 'white'], firstSeat: 0, size: 19, mode: 'balanced', seed: 42, thiefStyle: 'onscreen' };

function setup(saved: SavedTable | null = null) {
  let n = 0;
  const saves: (SavedTable | null)[] = [];
  const lobby = new Lobby({ joinUrl: 'http://pc:5180/phone.html', save: (t) => saves.push(t && structuredClone(t)), newId: () => `id${++n}`, roll: () => [2, 4] }, saved);
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

/** Plays setup through the lobby: each phone starts its piece, the board picks a spot and confirms. */
function playSetup(t: ReturnType<typeof fullTable>) {
  const view = () => t.board.last('board')!.view;
  t.say(t.board, { type: 'start' });
  while (view().rules.phase === 'setup') {
    const seat = view().game.current;
    const kind = view().rules.buildings.filter((b) => b?.seat === seat).length > view().rules.roads.filter((r) => r === seat).length ? 'road' : 'settlement';
    t.say(t.phones[seat], { type: 'act', action: { type: 'build', kind } });
    t.say(t.board, { type: 'act', action: { type: 'pick', at: view().rules.pending!.legal[0] } });
    t.say(t.board, { type: 'act', action: { type: 'confirm' } });
  }
}

describe('playing', () => {
  it('plays setup with pieces started on the phone and placed on the board', () => {
    const t = fullTable();
    playSetup(t);
    const view = t.board.last('board')!.view;
    expect(view.rules.phase).toBe('main');
    expect(view.rules.points).toEqual([2, 2, 2]);
    expect(view.game.current).toBe(0);
    expect(t.phones[0].last('phone')!.view.me!.can.roll).toBe(true);
    expect(t.phones[1].last('phone')!.view.me!.can.roll).toBe(false);
  });

  it('rolls on the server, from the board or the current phone', () => {
    const t = fullTable();
    playSetup(t);
    t.say(t.board, { type: 'act', action: { type: 'roll' } });
    expect(t.board.last('board')).toMatchObject({ event: { kind: 'roll', roll: { total: 6, dice: [2, 4] } } });
    t.say(t.phones[0], { type: 'act', action: { type: 'endTurn' } });
    expect(t.phones[1].last('phone')!.view.current).toBe(1);
    t.say(t.phones[1], { type: 'act', action: { type: 'enterRoll', total: 11 } });
    expect(t.board.last('board')!.view.game.lastRoll).toEqual({ total: 11, dice: null });
  });

  it('tells a phone why a move was refused', () => {
    const t = fullTable();
    playSetup(t);
    t.say(t.phones[1], { type: 'act', action: { type: 'roll' } });
    expect(t.phones[1].last('error')!.message).toBe('Not your turn');
  });

  it('keeps each device to its own moves', () => {
    const t = fullTable();
    t.say(t.board, { type: 'start' });
    // Only phones start builds; only the board picks spots.
    t.say(t.board, { type: 'act', action: { type: 'build', kind: 'settlement' } });
    expect(t.board.last('board')!.view.rules.pending).toBeNull();
    t.say(t.phones[0], { type: 'act', action: { type: 'build', kind: 'settlement' } });
    const legal = t.board.last('board')!.view.rules.pending!.legal;
    t.say(t.phones[0], { type: 'act', action: { type: 'pick', at: legal[0] } });
    expect(t.board.last('board')!.view.rules.pending!.at).toBeNull();
  });

  it('does nothing in the game before it starts', () => {
    const { say, board, phones } = fullTable();
    say(phones[0], { type: 'act', action: { type: 'build', kind: 'settlement' } });
    expect(board.last('board')!.view.rules.pending).toBeNull();
  });

  it('moves the thief after a 7, tapped and confirmed on the board', () => {
    const t = fullTable();
    playSetup(t);
    const from = t.board.last('board')!.view.game.thiefTile!;
    t.say(t.board, { type: 'act', action: { type: 'moveThief', tile: (from + 1) % 19 } });
    expect(t.board.last('error')!.message).toMatch(/after a 7/);
    t.say(t.phones[0], { type: 'act', action: { type: 'enterRoll', total: 7 } });
    expect(t.board.last('board')!.view.rules.robber!.stage).toBe('move');
    // Phones can't move the thief; the board can.
    t.say(t.phones[0], { type: 'act', action: { type: 'moveThief', tile: (from + 1) % 19 } });
    expect(t.board.last('board')!.view.rules.robber!.tile).toBeNull();
    t.say(t.board, { type: 'act', action: { type: 'moveThief', tile: (from + 1) % 19 } });
    expect(t.board.last('board')!.view.rules.robber!.tile).toBe((from + 1) % 19);
    t.say(t.board, { type: 'act', action: { type: 'confirm' } });
    expect(t.board.last('board')).toMatchObject({ event: { kind: 'thief' }, view: { game: { thiefTile: (from + 1) % 19 } } });
  });

  it('shows the face-down order to the victim only', () => {
    const t = fullTable();
    playSetup(t);
    t.say(t.phones[0], { type: 'act', action: { type: 'enterRoll', total: 7 } });
    const view = () => t.board.last('board')!.view;
    // Find a tile next to one of seat 1's settlements and none of seat 0's.
    const g = geometryOf(view().game);
    const tile = view().game.board.tiles.findIndex((_, id) => {
      const owners = g.spots.filter((s) => s.tiles.includes(id)).map((s) => view().rules.buildings[s.id]?.seat);
      return id !== view().game.thiefTile && owners.includes(1) && !owners.includes(0) && !owners.includes(2);
    });
    expect(tile).toBeGreaterThanOrEqual(0);
    expect(view().rules.cards[1]).toBeGreaterThan(0);
    t.say(t.board, { type: 'act', action: { type: 'moveThief', tile } });
    t.say(t.board, { type: 'act', action: { type: 'confirm' } });
    expect(view().rules.robber).toMatchObject({ stage: 'steal', victim: 1, count: view().rules.cards[1] });
    expect(JSON.stringify(t.board.last('board'))).not.toContain('"order"');
    expect(t.phones[0].last('phone')!.view.myOrder).toBeNull();
    expect(t.phones[2].last('phone')!.view.myOrder).toBeNull();
    const order = t.phones[1].last('phone')!.view.myOrder!;
    expect(order).toHaveLength(view().rules.cards[1]);

    t.say(t.phones[0], { type: 'act', action: { type: 'steal', index: 0 } });
    expect(t.phones[0].last('phone')!.view.stolen).toEqual({ from: 1, to: 0, card: order[0], index: 0 });
    expect(t.phones[1].last('phone')!.view.stolen).toEqual({ from: 1, to: 0, card: order[0], index: 0 });
    expect(t.phones[2].last('phone')!.view.stolen).toBeNull();
    // The board, in everyone's view, never says which card it was.
    expect(JSON.stringify(t.board.last('board'))).not.toMatch(/"card"|"stolen"|"lastSteal"/);
  });

  it('never sends anyone another player’s cards', () => {
    const t = fullTable();
    playSetup(t);
    const hands = t.board.last('board')!.view.rules.cards;
    expect(hands.some((n) => n > 0)).toBe(true);
    for (const m of t.board.inbox) expect(JSON.stringify(m)).not.toMatch(/"hands"|"hand"|"bank"/);
    t.phones.forEach((p, seat) => {
      for (const m of p.inbox) {
        const text = JSON.stringify(m);
        expect(text).not.toMatch(/"game"|"hands"|"bank"/);
        if (m.type === 'phone' && m.view.me) expect(m.view.you).toBe(seat);
      }
    });
  });
});

describe('development cards and the end', () => {
  it('never sends the deck, and shows card types only to their owner', () => {
    const t = fullTable();
    playSetup(t);
    const board = JSON.stringify(t.board.last('board'));
    expect(board).not.toMatch(/"deck"|"knight"|"point"|"monopoly"/);
    expect(t.board.last('board')!.view.rules.deckLeft).toBe(25);
    for (const p of t.phones) expect(JSON.stringify(p.last('phone'))).not.toMatch(/"deck"/);
  });

  it('a rematch keeps every phone in its seat and starts setup at once', () => {
    const t = fullTable();
    playSetup(t);
    const id = t.board.last('board')!.view.id;
    t.say(t.board, { type: 'create', options: { ...OPTIONS, seed: 7 }, rematch: true });
    const view = t.board.last('board')!.view;
    expect(view.id).toBe(id);
    expect(view.started).toBe(true);
    expect(view.rules.phase).toBe('setup');
    expect(t.phones.map((p) => p.seat)).toEqual([0, 1, 2]);
    expect(t.phones[0].last('phone')!.view.me).not.toBeNull();
  });

  it('a rematch with different players goes back to joining', () => {
    const t = fullTable();
    playSetup(t);
    t.say(t.board, { type: 'create', options: { ...OPTIONS, colors: ['red', 'blue'] }, rematch: true });
    expect(t.board.last('board')!.view.started).toBe(false);
    expect(t.phones[0].seat).toBeNull();
  });
});

describe('saving', () => {
  it('saves after every change and carries on from the save', () => {
    const t = fullTable();
    playSetup(t);
    t.say(t.board, { type: 'act', action: { type: 'roll' } });
    const saved = t.saves.at(-1)!;
    expect(isSavedTable(saved)).toBe(true);
    expect(saved.started).toBe(true);

    const next = setup(saved);
    const b = next.conn();
    next.say(b, { type: 'hello', role: 'board' });
    expect(b.last('board')!.view.game.lastRoll!.total).toBe(6);
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
    expect(isSavedTable({ ...good, version: 1 })).toBe(false);
    expect(isSavedTable({ ...good, rules: { ...good.rules, bank: { ...good.rules.bank, ore: 0 } } })).toBe(false);
    expect(isSavedTable({ ...good, game: { ...good.game, current: 9 } })).toBe(false);
  });
});
