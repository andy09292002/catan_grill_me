import { describe, expect, it } from 'vitest';
import { createGame, type NewGameOptions } from '../game/state';
import {
  apply,
  BANK_EACH,
  bankRate,
  COSTS,
  geometryOf,
  hand,
  handSize,
  isRulesState,
  legalPlaces,
  piecesLeft,
  publicPoints,
  RESOURCES,
  startTable,
  TERRAIN_RESOURCE,
  type Action,
  type BuildKind,
  type Hand,
  type Table,
} from './engine';

const OPTIONS: NewGameOptions = { colors: ['red', 'blue', 'white'], firstSeat: 0, size: 19, mode: 'balanced', seed: 12345, thiefStyle: 'onscreen' };

const fresh = (o: Partial<NewGameOptions> = {}) => startTable(createGame({ ...OPTIONS, ...o }));

function act(t: Table, seat: number, a: Action, roll?: () => [number, number]): Table {
  const r = apply(t, seat, a, roll);
  if (!r.ok) throw new Error(`${a.type}: ${r.reason}`);
  return r.table;
}

function rejects(t: Table, seat: number, a: Action): string {
  const r = apply(t, seat, a);
  expect(r.ok, `${a.type} should be refused`).toBe(false);
  return r.ok ? '' : r.reason;
}

function buildAt(t: Table, seat: number, kind: BuildKind, at: number): Table {
  t = act(t, seat, { type: 'build', kind });
  t = act(t, seat, { type: 'pick', at });
  return act(t, seat, { type: 'confirm' });
}

/** Plays setup, putting settlements on the first legal spot of `prefer` (else inland) with the first legal road. */
function finishSetup(t: Table, prefer: number[] = []): Table {
  while (t.rules.phase === 'setup') {
    const seat = t.game.current;
    const spots = legalPlaces(t, seat, 'settlement');
    // Inland spots by default, so nobody starts on a harbor.
    const inland = spots.find((p) => geometryOf(t.game).spots[p].tiles.length === 3);
    t = buildAt(t, seat, 'settlement', prefer.find((p) => spots.includes(p)) ?? inland ?? spots[0]);
    t = buildAt(t, seat, 'road', legalPlaces(t, seat, 'road')[0]);
  }
  return t;
}

/** Sets a seat's hand, taking the difference from (or giving it back to) the bank so no card is made. */
function withCards(t: Table, seat: number, h: Partial<Hand>): Table {
  const next = hand(h);
  const hands = t.rules.hands.slice();
  const bank = { ...t.rules.bank };
  for (const r of RESOURCES) bank[r] -= next[r] - hands[seat][r];
  hands[seat] = next;
  return { ...t, rules: { ...t.rules, hands, bank } };
}

const rolled = (t: Table, total = 2) => act(t, t.game.current, { type: 'enterRoll', total });
const cardsInPlay = (t: Table) => RESOURCES.map((r) => t.rules.bank[r] + t.rules.hands.reduce((n, h) => n + h[r], 0));

describe('setup', () => {
  it('goes round once from the first player, then back the other way, then the first player rolls', () => {
    let t = fresh({ firstSeat: 1 });
    expect(t.rules.setupOrder).toEqual([1, 2, 0, 0, 2, 1]);
    const order: number[] = [];
    while (t.rules.phase === 'setup') {
      order.push(t.game.current);
      t = finishOneStep(t);
    }
    expect(order).toEqual([1, 2, 0, 0, 2, 1]);
    expect(t.game.current).toBe(1);
    expect(t.rules.rolled).toBe(false);
  });

  it('places a settlement first, then a road touching it', () => {
    let t = fresh();
    expect(rejects(t, 0, { type: 'build', kind: 'road' })).toMatch(/settlement/);
    expect(rejects(t, 0, { type: 'roll' })).toMatch(/setup/);
    expect(rejects(t, 1, { type: 'build', kind: 'settlement' })).toBe('Not your turn');
    const spot = legalPlaces(t, 0, 'settlement')[0];
    t = buildAt(t, 0, 'settlement', spot);
    const roads = legalPlaces(t, 0, 'road');
    expect(roads.length).toBeGreaterThan(0);
    expect(roads.every((p) => geometryOf(t.game).paths[p].ends.includes(spot))).toBe(true);
    expect(rejects(t, 0, { type: 'build', kind: 'settlement' })).toMatch(/road/);
  });

  it('keeps settlements at least two paths apart', () => {
    let t = fresh();
    const g = geometryOf(t.game);
    const spot = 20;
    t = buildAt(t, 0, 'settlement', spot);
    t = buildAt(t, 0, 'road', legalPlaces(t, 0, 'road')[0]);
    const legal = legalPlaces(t, 1, 'settlement');
    expect(legal).not.toContain(spot);
    for (const n of g.spots[spot].neighbors) expect(legal).not.toContain(n);
  });

  it('gives cards for the second settlement only, one per neighbouring tile', () => {
    let t = fresh();
    const g = geometryOf(t.game);
    for (let i = 0; i < 3; i++) t = finishOneStep(t);
    expect(t.rules.hands.every((h) => handSize(h) === 0)).toBe(true);
    // Seat 2's second settlement, on a spot touching three tiles.
    const spot = legalPlaces(t, 2, 'settlement').find((s) => g.spots[s].tiles.length === 3)!;
    t = finishOneStep(t, spot);
    const expected = hand();
    for (const tile of g.spots[spot].tiles) {
      const terrain = t.game.board.tiles[tile].terrain;
      if (terrain !== 'desert') expected[TERRAIN_RESOURCE[terrain]]++;
    }
    expect(t.rules.hands[2]).toEqual(expected);
    expect(cardsInPlay(t)).toEqual(RESOURCES.map(() => BANK_EACH));
  });
});

/** One setup step for the current seat: a settlement (at `spot` if given) and its road. */
function finishOneStep(t: Table, spot?: number): Table {
  const seat = t.game.current;
  t = buildAt(t, seat, 'settlement', spot ?? legalPlaces(t, seat, 'settlement')[0]);
  return buildAt(t, seat, 'road', legalPlaces(t, seat, 'road')[0]);
}

describe('rolling and production', () => {
  it('only the current player rolls, once a turn', () => {
    const t = finishSetup(fresh());
    expect(rejects(t, 1, { type: 'roll' })).toBe('Not your turn');
    const after = act(t, 0, { type: 'roll' }, () => [2, 3]);
    expect(after.game.lastRoll).toEqual({ total: 5, dice: [2, 3] });
    expect(rejects(after, 0, { type: 'roll' })).toMatch(/Already/);
    expect(rejects(after, 0, { type: 'enterRoll', total: 9 })).toMatch(/Already/);
    expect(rejects(t, 0, { type: 'enterRoll', total: 13 })).toMatch(/2 to 12/);
  });

  it('gives 1 card per settlement and 2 per city on each tile with the rolled number', () => {
    let t = finishSetup(fresh());
    const g = geometryOf(t.game);
    // Turn one of seat 0's settlements into a city by hand, then roll each of its tiles' numbers.
    const spot = t.rules.buildings.findIndex((b) => b?.seat === 0);
    const buildings = t.rules.buildings.slice();
    buildings[spot] = { seat: 0, kind: 'city' };
    t = { ...t, rules: { ...t.rules, buildings } };
    const tile = g.spots[spot].tiles.find((id) => t.game.board.tiles[id].number !== null && id !== t.game.thiefTile)!;
    const { number, terrain } = t.game.board.tiles[tile];
    const before = t.rules.hands.map((h) => ({ ...h }));
    t = rolled(t, number!);
    const res = TERRAIN_RESOURCE[terrain as keyof typeof TERRAIN_RESOURCE];
    // Every building on a tile with that number gets paid.
    const expected = before.map((h) => ({ ...h }));
    t.game.board.tiles.forEach((tl, id) => {
      if (tl.number !== number || id === t.game.thiefTile || tl.terrain === 'desert') return;
      for (const s of g.spots) {
        const b = t.rules.buildings[s.id];
        if (b && s.tiles.includes(id)) expected[b.seat][TERRAIN_RESOURCE[tl.terrain]] += b.kind === 'city' ? 2 : 1;
      }
    });
    expect(t.rules.hands).toEqual(expected);
    expect(t.rules.hands[0][res]).toBeGreaterThanOrEqual(before[0][res] + 2);
  });

  it('pays nothing from the thief’s tile or on a 7', () => {
    let t = finishSetup(fresh());
    const g = geometryOf(t.game);
    const spot = t.rules.buildings.findIndex((b) => b?.seat === 0);
    const tile = g.spots[spot].tiles.find((id) => t.game.board.tiles[id].number !== null)!;
    const number = t.game.board.tiles[tile].number!;
    t = { ...t, game: { ...t.game, thiefTile: tile } };
    // Clear every other tile with that number, so the thief's tile is the only one rolling.
    const tiles = t.game.board.tiles.map((tl, id) => (id !== tile && tl.number === number ? { ...tl, number: 2 === number ? 12 : 2 } : tl));
    t = { ...t, game: { ...t.game, board: { ...t.game.board, tiles } } };
    const before = t.rules.hands;
    expect(rolled(t, number).rules.hands).toEqual(before);
    expect(rolled(t, 7).rules.hands).toEqual(before);
  });

  it('when the bank runs short, a lone claimant gets what is left and several get nothing', () => {
    let t = finishSetup(fresh());
    const g = geometryOf(t.game);
    const spot = t.rules.buildings.findIndex((b) => b?.seat === 0);
    const tile = g.spots[spot].tiles.find((id) => t.game.board.tiles[id].number !== null && id !== t.game.thiefTile)!;
    const { number, terrain } = t.game.board.tiles[tile];
    const res = TERRAIN_RESOURCE[terrain as keyof typeof TERRAIN_RESOURCE];
    // Only seat 0's settlement on this tile, now a city wanting 2, with 1 left in the bank.
    const buildings = t.rules.buildings.map((b, s) => (b && g.spots[s].tiles.some((id) => t.game.board.tiles[id].number === number) ? null : b));
    buildings[spot] = { seat: 0, kind: 'city' };
    t = { ...t, rules: { ...t.rules, buildings } };
    t = withCards(withCards(withCards(t, 0, {}), 2, {}), 1, { [res]: BANK_EACH - 1 });
    expect(rolled(t, number!).rules.hands[0][res]).toBe(t.rules.hands[0][res] + 1);

    // Now another player also claims it: nobody is paid.
    const other = g.spots.find((s) => s.tiles.includes(tile) && s.id !== spot && !g.spots[spot].neighbors.includes(s.id))!;
    const both = t.rules.buildings.slice();
    both[other.id] = { seat: 2, kind: 'settlement' };
    t = { ...t, rules: { ...t.rules, buildings: both } };
    const after = rolled(t, number!);
    expect(after.rules.hands[0][res]).toBe(t.rules.hands[0][res]);
    expect(after.rules.hands[2][res]).toBe(t.rules.hands[2][res]);
  });
});

describe('building', () => {
  it('needs the current player, a roll, the cards and a piece', () => {
    let t = finishSetup(fresh());
    expect(rejects(t, 0, { type: 'build', kind: 'road' })).toBe('Roll first');
    t = rolled(t);
    t = withCards(t, 0, {});
    expect(rejects(t, 0, { type: 'build', kind: 'road' })).toBe('Not enough cards');
    t = withCards(t, 0, COSTS.road);
    expect(rejects(t, 1, { type: 'build', kind: 'road' })).toBe('Not your turn');
    const roads = t.rules.roads.slice();
    let used = roads.filter((s) => s === 0).length;
    for (let p = 0; p < roads.length && used < 15; p++) if (roads[p] === null) ((roads[p] = 0), used++);
    expect(rejects({ ...t, rules: { ...t.rules, roads } }, 0, { type: 'build', kind: 'road' })).toMatch(/No roads left/);
  });

  it('places only on a legal spot tapped on the board, after ✓, and pays for it', () => {
    let t = rolled(finishSetup(fresh()));
    t = withCards(t, 0, COSTS.road);
    t = act(t, 0, { type: 'build', kind: 'road' });
    expect(rejects(t, 0, { type: 'confirm' })).toMatch(/Pick/);
    const taken = t.rules.roads.findIndex((s) => s !== null);
    expect(rejects(t, 0, { type: 'pick', at: taken })).toMatch(/legal/);
    const at = legalPlaces(t, 0, 'road')[0];
    t = act(t, 0, { type: 'pick', at });
    expect(t.rules.roads[at]).toBeNull();
    t = act(t, 0, { type: 'confirm' });
    expect(t.rules.roads[at]).toBe(0);
    expect(handSize(t.rules.hands[0])).toBe(0);
    expect(cardsInPlay(t)).toEqual(RESOURCES.map(() => BANK_EACH));
  });

  it('cancels a build without paying', () => {
    let t = withCards(rolled(finishSetup(fresh())), 0, COSTS.road);
    t = act(t, 0, { type: 'build', kind: 'road' });
    t = act(t, 0, { type: 'pick', at: legalPlaces(t, 0, 'road')[0] });
    t = act(t, 0, { type: 'cancel' });
    expect(t.rules.pending).toBeNull();
    expect(t.rules.hands[0]).toEqual(COSTS.road);
  });

  it('joins roads to your own roads and buildings, but not through another player’s building', () => {
    const t = rolled(finishSetup(fresh()));
    const g = geometryOf(t.game);
    for (const p of legalPlaces(t, 0, 'road')) {
      const ok = g.paths[p].ends.some((end) => {
        const b = t.rules.buildings[end];
        return b?.seat === 0 || (b === null && g.spots[end].paths.some((q) => q !== p && t.rules.roads[q] === 0));
      });
      expect(ok).toBe(true);
    }
    // Put another player's settlement at the far end of one of seat 0's roads: the road can't continue through it.
    const road = t.rules.roads.findIndex((s) => s === 0);
    const far = g.paths[road].ends.find((e) => t.rules.buildings[e] === null)!;
    const buildings = t.rules.buildings.slice();
    buildings[far] = { seat: 1, kind: 'settlement' };
    const blocked = { ...t, rules: { ...t.rules, buildings } };
    const beyond = g.spots[far].paths.filter((p) => p !== road);
    for (const p of beyond) {
      const otherEnd = g.paths[p].ends.find((e) => e !== far)!;
      const reachable = t.rules.buildings[otherEnd]?.seat === 0 || g.spots[otherEnd].paths.some((q) => q !== p && t.rules.roads[q] === 0);
      if (!reachable) expect(legalPlaces(blocked, 0, 'road')).not.toContain(p);
    }
  });

  it('puts settlements on your own road, two paths from any building', () => {
    const t = rolled(finishSetup(fresh()));
    const g = geometryOf(t.game);
    for (const s of legalPlaces(t, 0, 'settlement')) {
      expect(t.rules.buildings[s]).toBeNull();
      expect(g.spots[s].neighbors.every((n) => t.rules.buildings[n] === null)).toBe(true);
      expect(g.spots[s].paths.some((p) => t.rules.roads[p] === 0)).toBe(true);
    }
  });

  it('upgrades only your own settlement to a city, for 2 grain and 3 ore', () => {
    let t = withCards(rolled(finishSetup(fresh())), 0, COSTS.city);
    const mine = legalPlaces(t, 0, 'city');
    expect(mine.length).toBe(2);
    expect(mine.every((s) => t.rules.buildings[s]?.seat === 0)).toBe(true);
    t = buildAt(t, 0, 'city', mine[0]);
    expect(t.rules.buildings[mine[0]]).toEqual({ seat: 0, kind: 'city' });
    expect(piecesLeft(t.rules, 0)).toMatchObject({ settlement: 4, city: 3 });
    expect(publicPoints(t.rules, 0)).toBe(3);
  });
});

describe('undo', () => {
  it('takes back your last build and refunds it, until anything else happens', () => {
    let t = withCards(rolled(finishSetup(fresh())), 0, { ...COSTS.road, ore: 4 });
    const at = legalPlaces(t, 0, 'road')[0];
    t = buildAt(t, 0, 'road', at);
    expect(rejects(t, 1, { type: 'undo' })).toMatch(/Nothing/);
    const back = act(t, 0, { type: 'undo' });
    expect(back.rules.roads[at]).toBeNull();
    expect(back.rules.hands[0]).toEqual(hand({ ...COSTS.road, ore: 4 }));
    expect(rejects(back, 0, { type: 'undo' })).toMatch(/Nothing/);

    // A trade in between makes it final.
    const traded = act(t, 0, { type: 'bankTrade', give: 'ore', get: 'wool' });
    expect(rejects(traded, 0, { type: 'undo' })).toMatch(/Nothing/);
  });

  it('turns a city back into a settlement', () => {
    let t = withCards(rolled(finishSetup(fresh())), 0, COSTS.city);
    const spot = legalPlaces(t, 0, 'city')[0];
    t = act(buildAt(t, 0, 'city', spot), 0, { type: 'undo' });
    expect(t.rules.buildings[spot]).toEqual({ seat: 0, kind: 'settlement' });
    expect(t.rules.hands[0]).toEqual(COSTS.city);
  });

  it('takes back a setup settlement and the cards it brought, but not after the road', () => {
    let t = fresh();
    for (let i = 0; i < 3; i++) t = finishOneStep(t);
    const spot = legalPlaces(t, 2, 'settlement')[0];
    t = buildAt(t, 2, 'settlement', spot);
    t = act(t, 2, { type: 'build', kind: 'road' });
    const back = act(t, 2, { type: 'undo' });
    expect(back.rules.buildings[spot]).toBeNull();
    expect(handSize(back.rules.hands[2])).toBe(0);
    expect(back.rules.setupSettlement).toBeNull();
    expect(back.rules.pending).toBeNull();
    const roaded = act(act(t, 2, { type: 'pick', at: legalPlaces(t, 2, 'road')[0] }), 2, { type: 'confirm' });
    expect(rejects(roaded, 2, { type: 'undo' })).toMatch(/Nothing/);
  });
});

describe('trading with the bank', () => {
  it('trades 4 for 1, or 3 for 1 at a generic harbor, or 2 for 1 at a matching one', () => {
    let t = rolled(finishSetup(fresh()));
    const g = geometryOf(t.game);
    expect(bankRate(t, 0, 'wood')).toBe(4);
    const generic = g.spots.find((s) => s.harbor === 'generic')!;
    const special = g.spots.find((s) => s.harbor && s.harbor !== 'generic')!;
    const buildings = t.rules.buildings.slice();
    buildings[generic.id] = { seat: 0, kind: 'settlement' };
    t = { ...t, rules: { ...t.rules, buildings } };
    expect(bankRate(t, 0, 'wood')).toBe(3);
    buildings[special.id] = { seat: 0, kind: 'settlement' };
    t = { ...t, rules: { ...t.rules, buildings } };
    const res = TERRAIN_RESOURCE[special.harbor as keyof typeof TERRAIN_RESOURCE];
    expect(bankRate(t, 0, res)).toBe(2);
    expect(bankRate(t, 1, res)).toBe(4);

    t = withCards(t, 0, { [res]: 2 });
    const other = RESOURCES.find((r) => r !== res)!;
    const after = act(t, 0, { type: 'bankTrade', give: res, get: other });
    expect(after.rules.hands[0]).toEqual(hand({ [other]: 1 }));
  });

  it('refuses without enough cards, when the bank is out, or the same card both ways', () => {
    let t = withCards(rolled(finishSetup(fresh())), 0, { wood: 3 });
    expect(rejects(t, 0, { type: 'bankTrade', give: 'wood', get: 'ore' })).toMatch(/need 4/);
    t = withCards(t, 0, { wood: 4 });
    expect(rejects(t, 0, { type: 'bankTrade', give: 'wood', get: 'wood' })).toMatch(/different/);
    t = withCards(t, 1, { ore: t.rules.bank.ore + t.rules.hands[1].ore });
    expect(rejects(t, 0, { type: 'bankTrade', give: 'wood', get: 'ore' })).toMatch(/no Ore/);
    expect(rejects(withCards(finishSetup(fresh()), 0, { wood: 4 }), 0, { type: 'bankTrade', give: 'wood', get: 'ore' })).toBe('Roll first');
  });
});

describe('trading between players', () => {
  const setupTrade = () => {
    let t = rolled(finishSetup(fresh()));
    t = withCards(withCards(t, 0, { wood: 2 }), 1, { ore: 1 });
    return t;
  };

  it('moves the cards when the other player accepts', () => {
    let t = setupTrade();
    t = act(t, 0, { type: 'offer', to: 1, give: hand({ wood: 2 }), get: hand({ ore: 1 }) });
    expect(rejects(t, 2, { type: 'respond', accept: true })).toMatch(/No offer/);
    t = act(t, 1, { type: 'respond', accept: true });
    expect(t.rules.hands[0]).toEqual(hand({ ore: 1 }));
    expect(t.rules.hands[1]).toEqual(hand({ wood: 2 }));
    expect(t.rules.offer).toBeNull();
  });

  it('can be declined or withdrawn', () => {
    const t = act(setupTrade(), 0, { type: 'offer', to: 1, give: hand({ wood: 2 }), get: hand({ ore: 1 }) });
    expect(act(t, 1, { type: 'respond', accept: false }).rules.hands).toEqual(t.rules.hands);
    expect(rejects(t, 1, { type: 'withdraw' })).toMatch(/No offer/);
    expect(act(t, 0, { type: 'withdraw' }).rules.offer).toBeNull();
  });

  it('checks both sides have the cards, and refuses gifts and odd offers', () => {
    const t = setupTrade();
    expect(rejects(t, 0, { type: 'offer', to: 1, give: hand({ wood: 3 }), get: hand({ ore: 1 }) })).toMatch(/don’t have/);
    expect(rejects(t, 0, { type: 'offer', to: 1, give: hand({ wood: 1 }), get: hand() })).toMatch(/Both/);
    expect(rejects(t, 0, { type: 'offer', to: 0, give: hand({ wood: 1 }), get: hand({ ore: 1 }) })).toMatch(/another/);
    expect(rejects(t, 0, { type: 'offer', to: 1, give: hand({ wood: 1 }), get: hand({ wood: 1 }) })).toMatch(/same/);
    expect(rejects(t, 1, { type: 'offer', to: 0, give: hand({ ore: 1 }), get: hand({ wood: 1 }) })).toBe('Not your turn');
    const asks = act(t, 0, { type: 'offer', to: 1, give: hand({ wood: 1 }), get: hand({ ore: 1, wool: 1 }) });
    expect(rejects(asks, 1, { type: 'respond', accept: true })).toMatch(/don’t have/);
  });
});

describe('turns and points', () => {
  it('ends a turn only after rolling and with nothing half-built, and passes clockwise', () => {
    let t = finishSetup(fresh());
    expect(rejects(t, 0, { type: 'endTurn' })).toBe('Roll first');
    t = withCards(rolled(t), 0, COSTS.road);
    t = act(t, 0, { type: 'build', kind: 'road' });
    expect(rejects(t, 0, { type: 'endTurn' })).toMatch(/building/);
    t = act(t, 0, { type: 'cancel' });
    t = act(t, 0, { type: 'endTurn' });
    expect(t.game.current).toBe(1);
    expect(t.rules.rolled).toBe(false);
  });

  it('counts 1 point per settlement and 2 per city', () => {
    const t = finishSetup(fresh());
    expect([0, 1, 2].map((s) => publicPoints(t.rules, s))).toEqual([2, 2, 2]);
  });
});

describe('saved rules', () => {
  it('accepts real states and rejects any that make or lose cards', () => {
    const t = rolled(finishSetup(fresh()));
    expect(isRulesState(t.rules, t.game)).toBe(true);
    const hands = t.rules.hands.slice();
    hands[0] = { ...hands[0], ore: hands[0].ore + 1 };
    expect(isRulesState({ ...t.rules, hands }, t.game)).toBe(false);
    expect(isRulesState({ ...t.rules, roads: t.rules.roads.slice(1) }, t.game)).toBe(false);
  });
});
