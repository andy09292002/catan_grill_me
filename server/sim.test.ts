import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '../src/board/rng';
import { PLAYER_COLORS } from '../src/game/players';
import type { BoardView, ClientMessage, PhoneView, ServerMessage } from '../src/net/protocol';
import { geometryOf, hand, PIECES, piecesLeft, RESOURCES, type Action, type Hand } from '../src/rules/engine';
import { isSavedTable, Lobby, type Conn, type SavedTable } from './lobby';

// Bots play many games through the real server logic, mixing sensible moves with nonsense,
// and every state the server saves is checked against the rules.

// More games locally with SIM_GAMES=1000 npx vitest run server/sim
const GAMES = Number(process.env.SIM_GAMES) || 60;
const TURNS = 60;

interface Bot extends Conn {
  last?: PhoneView;
  board?: BoardView;
  errors: number;
}

function botConn(): Bot {
  const c: Bot = {
    role: null,
    seat: null,
    errors: 0,
    send(m: ServerMessage) {
      if (m.type === 'phone') c.last = m.view;
      if (m.type === 'board') c.board = m.view;
      if (m.type === 'error') c.errors++;
    },
  };
  return c;
}

const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

function randomHand(rng: Rng, max: Hand | null): Hand {
  const h = hand();
  const r = pick(rng, RESOURCES);
  h[r] = 1 + Math.floor(rng() * 2);
  if (max) h[r] = Math.min(h[r], max[r]);
  return h;
}

function assert(ok: boolean, what: string) {
  if (!ok) throw new Error(`Broken rule: ${what}`);
}

/** `n` random cards from `h`. */
function someOf(rng: Rng, h: Hand, n: number): Hand {
  const pool = RESOURCES.flatMap((r) => Array<(typeof RESOURCES)[number]>(h[r]).fill(r));
  const out = hand();
  for (let i = 0; i < n && pool.length; i++) out[pool.splice(Math.floor(rng() * pool.length), 1)[0]]++;
  return out;
}

/** Everything the rules promise about a saved table. Plain checks: there are thousands of them. */
function checkTable(t: SavedTable) {
  assert(isSavedTable(t), 'saved table is valid and no card was made or lost');
  const g = geometryOf(t.game);
  const r = t.rules;
  r.buildings.forEach((b, s) => {
    if (!b) return;
    for (const n of g.spots[s].neighbors) assert(r.buildings[n] === null, 'settlements two paths apart');
    // Once setup is done, every building touches one of its owner's roads.
    if (r.phase === 'main') assert(g.spots[s].paths.some((p) => r.roads[p] === b.seat), 'building on its own road');
  });
  t.game.colors.forEach((_, seat) => {
    const left = piecesLeft(r, seat);
    for (const k of ['road', 'settlement', 'city'] as const) assert(left[k] >= 0 && left[k] <= PIECES[k], `${k} pieces in range`);
  });
  r.roads.forEach((seat, p) => {
    if (seat === null) return;
    // Each road touches its owner's building or another of its roads.
    const linked = g.paths[p].ends.some((e) => r.buildings[e]?.seat === seat || g.spots[e].paths.some((q) => q !== p && r.roads[q] === seat));
    assert(linked, 'road joined to its network');
  });
}

function playGame(seed: number) {
  const rng = createRng(seed);
  const players = 2 + Math.floor(rng() * 3);
  const saves: (SavedTable | null)[] = [];
  const lobby = new Lobby({
    joinUrl: 'http://pc/phone.html',
    save: (t) => saves.push(t && structuredClone(t)),
    roll: () => [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)],
    random: rng,
  });
  const board = botConn();
  lobby.connect(board);
  const say = (c: Conn, m: ClientMessage) => lobby.receive(c, m);
  say(board, { type: 'hello', role: 'board' });
  say(board, {
    type: 'create',
    options: { colors: PLAYER_COLORS.slice(0, players), firstSeat: Math.floor(rng() * players), size: 19, mode: 'balanced', seed, thiefStyle: 'onscreen' },
  });
  const phones = Array.from({ length: players }, (_, seat) => {
    const p = botConn();
    lobby.connect(p);
    say(p, { type: 'hello', role: 'phone' });
    say(p, { type: 'claim', seat });
    return p;
  });
  say(board, { type: 'start' });

  /** Sends an action and checks: a refused one changes nothing, an accepted one leaves a valid table. */
  const send = (who: Bot, action: Action) => {
    const before = saves.length;
    const errors = who.errors;
    say(who, { type: 'act', action });
    if (who.errors > errors) {
      assert(saves.length === before, `refused ${action.type} changed nothing`);
    } else if (saves.length > before) {
      checkTable(saves.at(-1)!);
    }
  };

  let turns = 0;
  let steps = 0;
  let sevens = 0;
  while (turns < TURNS && steps < TURNS * 60) {
    steps++;
    const view = board.board!;
    const seat = view.game.current;
    const phone = phones[seat];
    const me = phone.last!.me!;
    const offer = phones.find((p) => p.last?.offer && p.last.offer.to === p.seat);

    if (offer && rng() < 0.9) {
      send(offer, { type: 'respond', accept: rng() < 0.6 });
      continue;
    }
    const rb = view.rules.robber;
    if (rb && rng() > 0.08) {
      if (rb.stage === 'discard') {
        const who = pick(rng, rb.owed.flatMap((n, s) => (n > 0 ? [s] : [])));
        // Now and then a wrong count, which must be refused.
        const n = rng() < 0.1 ? rb.owed[who] + 1 : rb.owed[who];
        send(phones[who], { type: 'discard', cards: someOf(rng, phones[who].last!.me!.hand, n) });
      } else if (rb.stage === 'move') {
        if (rb.tile === null || rng() < 0.2) send(board, { type: 'moveThief', tile: Math.floor(rng() * view.game.board.tiles.length) });
        else send(board, rng() < 0.85 ? { type: 'confirm' } : { type: 'cancel' });
      } else if (rb.stage === 'choose') {
        send(phone, { type: 'chooseVictim', seat: pick(rng, rb.victims) });
      } else {
        sevens++;
        send(phone, { type: 'steal', index: Math.floor(rng() * rb.count) });
      }
      continue;
    }
    if (view.rules.pending) {
      const p = view.rules.pending;
      if (p.at === null || rng() < 0.2) send(board, { type: 'pick', at: pick(rng, p.legal) });
      else send(board, rng() < 0.85 ? { type: 'confirm' } : { type: 'cancel' });
      continue;
    }
    if (rng() < 0.08) {
      // Nonsense from anyone: out-of-turn moves, bad spots, impossible trades.
      const anyone = pick(rng, [board, ...phones]);
      const junk: Action = pick(rng, [
        { type: 'roll' },
        { type: 'endTurn' },
        { type: 'build', kind: pick(rng, ['road', 'settlement', 'city'] as const) },
        { type: 'pick', at: Math.floor(rng() * 80) - 5 },
        { type: 'confirm' },
        { type: 'undo' },
        { type: 'enterRoll', total: Math.floor(rng() * 16) },
        { type: 'bankTrade', give: pick(rng, RESOURCES), get: pick(rng, RESOURCES) },
        { type: 'offer', to: Math.floor(rng() * 7) - 1, give: randomHand(rng, null), get: randomHand(rng, null) },
        { type: 'respond', accept: true },
        { type: 'moveThief', tile: Math.floor(rng() * 22) - 1 },
      ] as Action[]);
      send(anyone, junk);
      continue;
    }
    if (view.rules.phase === 'setup') {
      if (me.setupNeed) send(phone, { type: 'build', kind: me.setupNeed });
      continue;
    }
    if (me.can.roll) {
      send(rng() < 0.5 ? phone : board, rng() < 0.8 ? { type: 'roll' } : { type: 'enterRoll', total: 2 + Math.floor(rng() * 11) });
      continue;
    }
    const kinds = (['city', 'settlement', 'road'] as const).filter((k) => me.can.build[k]);
    const r = rng();
    if (kinds.length && r < 0.5) send(phone, { type: 'build', kind: pick(rng, kinds) });
    else if (me.can.undo && r < 0.55) send(phone, { type: 'undo' });
    else if (me.can.trade && r < 0.7) {
      const give = pick(rng, RESOURCES);
      send(phone, { type: 'bankTrade', give, get: pick(rng, RESOURCES) });
    } else if (me.can.trade && r < 0.8 && players > 1) {
      const to = (seat + 1 + Math.floor(rng() * (players - 1))) % players;
      send(phone, { type: 'offer', to, give: randomHand(rng, me.hand), get: randomHand(rng, null) });
    } else {
      send(rng() < 0.5 ? phone : board, { type: 'endTurn' });
      if (board.board!.game.current !== seat) turns++;
    }
  }
  const last = saves.at(-1)!;
  expect(last.rules.phase, 'setup finished').toBe('main');
  expect(turns, 'the game kept moving').toBe(TURNS);
  return { last, steals: sevens };
}

describe('simulated games', () => {
  it(`${GAMES} bot games of ${TURNS} turns keep to the rules`, { timeout: GAMES * 1000 }, () => {
    let built = 0;
    let traded = 0;
    let steals = 0;
    for (let g = 1; g <= GAMES; g++) {
      const { last: t, steals: s } = playGame(g * 7919);
      steals += s;
      built += t.rules.buildings.filter(Boolean).length;
      traded += t.rules.log.filter((l) => l.text.includes('traded')).length;
    }
    // The bots really played: plenty built and traded, not just setup.
    expect(built).toBeGreaterThan(GAMES * 5);
    expect(traded).toBeGreaterThan(0);
    expect(steals).toBeGreaterThan(GAMES);
  });
});
