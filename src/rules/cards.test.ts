import { describe, expect, it } from 'vitest';
import { awardHolder, longestRoad } from './awards';
import {
  BANK_EACH,
  DEV_CARDS,
  DEV_COST,
  geometryOf,
  hand,
  handSize,
  isRulesState,
  legalPlaces,
  publicPoints,
  RESOURCES,
  totalPoints,
  type DevCard,
  type Table,
} from './engine';
import { act, buildAt, cardsInPlay, finishSetup, fresh, rejects, rolled, withCards } from './testing';

/** Gives a seat development cards bought on `bought`, taking them out of the deck. */
function withDev(t: Table, seat: number, cards: DevCard[], bought = 0): Table {
  const deck = t.rules.deck.slice();
  for (const c of cards) deck.splice(deck.lastIndexOf(c), 1);
  const devCards = t.rules.devCards.slice();
  devCards[seat] = [...devCards[seat], ...cards.map((card) => ({ card, bought }))];
  return { ...t, rules: { ...t.rules, deck, devCards } };
}

/** After setup, on turn 2 or later so cards from turn 0 can be played. */
const ready = () => {
  const t = finishSetup(fresh());
  return { ...t, game: { ...t.game, turn: 2 } };
};

/** A run of `n` connected paths from `start`, never doubling back. */
function chain(t: Table, start: number, n: number): number[] {
  const g = geometryOf(t.game);
  const paths: number[] = [];
  const seen = new Set([start]);
  let at = start;
  for (let i = 0; i < n; i++) {
    const next = g.spots[at].neighbors.find((s) => !seen.has(s) && g.spots[s].neighbors.some((x) => !seen.has(x) && x !== s))!;
    paths.push(g.spots[at].paths.find((p) => g.paths[p].ends.includes(next))!);
    seen.add(next);
    at = next;
  }
  return paths;
}

/** A clean board with only `roads` laid for `seat`. */
function onlyRoads(t: Table, seat: number, roads: number[]): Table {
  const r = t.rules.roads.map(() => null as number | null);
  for (const p of roads) r[p] = seat;
  return { ...t, rules: { ...t.rules, roads: r, buildings: t.rules.buildings.map(() => null) } };
}

describe('development cards', () => {
  it('has 25 cards, shuffled: 14 knights, 5 points, 2 each of the rest', () => {
    const deck = fresh().rules.deck;
    expect(deck).toHaveLength(25);
    for (const [card, n] of Object.entries(DEV_CARDS)) expect(deck.filter((c) => c === card)).toHaveLength(n);
  });

  it('buys the top card for wool, grain and ore, after rolling', () => {
    let t = withCards(ready(), 0, { ...DEV_COST, wood: 1 });
    expect(rejects(t, 0, { type: 'buyCard' })).toBe('Roll first');
    t = rolled(t);
    expect(rejects(t, 1, { type: 'buyCard' })).toBe('Not your turn');
    const top = t.rules.deck.at(-1);
    t = act(t, 0, { type: 'buyCard' });
    expect(t.rules.devCards[0]).toEqual([{ card: top, bought: 2 }]);
    expect(t.rules.deck).toHaveLength(24);
    expect(t.rules.hands[0]).toEqual(hand({ wood: 1 }));
    expect(rejects(t, 0, { type: 'buyCard' })).toBe('Not enough cards');
    const empty = withCards({ ...t, rules: { ...t.rules, deck: [] } }, 0, DEV_COST);
    expect(rejects(empty, 0, { type: 'buyCard' })).toMatch(/No development/);
  });

  it('can’t play a card the turn it’s bought, only from the next turn', () => {
    const t = withDev(rolled(ready()), 0, ['monopoly'], 2);
    expect(rejects(t, 0, { type: 'playCard', card: 'monopoly', resource: 'wood' })).toMatch(/turn they’re bought/);
    const later = { ...t, game: { ...t.game, turn: 3 } };
    expect(act(later, 0, { type: 'playCard', card: 'monopoly', resource: 'wood' }).rules.devCards[0]).toEqual([]);
  });

  it('plays one card a turn, and only the player’s own', () => {
    let t = withDev(rolled(ready()), 0, ['plenty', 'monopoly']);
    expect(rejects(t, 0, { type: 'playCard', card: 'roads' })).toMatch(/don’t have/);
    expect(rejects(t, 1, { type: 'playCard', card: 'plenty', take: ['ore', 'ore'] })).toBe('Not your turn');
    t = act(t, 0, { type: 'playCard', card: 'plenty', take: ['ore', 'ore'] });
    expect(rejects(t, 0, { type: 'playCard', card: 'monopoly', resource: 'ore' })).toMatch(/One development card a turn/);
    t = act(t, 0, { type: 'endTurn' });
    expect(t.rules.playedDev).toBe(false);
  });

  it('never plays victory point cards; they count only in the total', () => {
    const t = withDev(ready(), 0, ['point', 'point']);
    expect(rejects(t, 0, { type: 'playCard', card: 'point' as never })).toMatch(/isn’t played/);
    expect(publicPoints(t.rules, 0)).toBe(2);
    expect(totalPoints(t.rules, 0)).toBe(4);
  });

  it('a knight moves the thief with no discards, and may come before the roll', () => {
    let t = withDev(withCards(ready(), 0, { wood: 9 }), 0, ['knight']);
    t = act(t, 0, { type: 'playCard', card: 'knight' });
    expect(t.rules.robber).toMatchObject({ stage: 'move', owed: [0, 0, 0] });
    expect(t.rules.knights).toEqual([1, 0, 0]);
    expect(rejects(t, 0, { type: 'roll' })).toBe('Move the thief first');
    const tile = (t.game.thiefTile! + 1) % 19;
    t = act(act(t, 0, { type: 'moveThief', tile }), 0, { type: 'confirm' });
    if (t.rules.robber?.stage === 'choose') t = act(t, 0, { type: 'chooseVictim', seat: t.rules.robber.victims[0] });
    if (t.rules.robber?.stage === 'steal') t = act(t, 0, { type: 'steal', index: 0 });
    expect(t.rules.robber).toBeNull();
    // Still before the roll: the turn goes on as usual.
    expect(t.rules.rolled).toBe(false);
    expect(act(t, 0, { type: 'roll' }, () => [2, 3]).game.lastRoll!.total).toBe(5);
  });

  it('road building lays two free roads, even before rolling, and undo gives one back', () => {
    let t = withDev(ready(), 0, ['roads']);
    t = act(t, 0, { type: 'playCard', card: 'roads' });
    expect(t.rules.freeRoads).toBe(2);
    t = buildAt(t, 0, 'road', legalPlaces(t, 0, 'road')[0]);
    expect(t.rules.freeRoads).toBe(1);
    t = act(t, 0, { type: 'undo' });
    expect(t.rules.freeRoads).toBe(2);
    t = buildAt(t, 0, 'road', legalPlaces(t, 0, 'road')[0]);
    t = buildAt(t, 0, 'road', legalPlaces(t, 0, 'road')[0]);
    expect(t.rules.freeRoads).toBe(0);
    expect(handSize(t.rules.hands[0])).toBe(handSize(ready().rules.hands[0]));
    // The free roads are spent: a third road needs a roll and its cost.
    expect(rejects(t, 0, { type: 'build', kind: 'road' })).toBe('Roll first');
  });

  it('unused free roads are lost at the end of the turn', () => {
    let t = rolled(withDev(ready(), 0, ['roads']));
    t = act(t, 0, { type: 'playCard', card: 'roads' });
    expect(act(t, 0, { type: 'endTurn' }).rules.freeRoads).toBe(0);
  });

  it('year of plenty takes any two cards from the bank, if it has them', () => {
    let t = withDev(ready(), 0, ['plenty']);
    expect(rejects(t, 0, { type: 'playCard', card: 'plenty', take: ['ore'] })).toMatch(/two/);
    const short = withCards(t, 1, { wool: BANK_EACH - t.rules.hands[0].wool - t.rules.hands[2].wool - 1 });
    expect(rejects(short, 0, { type: 'playCard', card: 'plenty', take: ['wool', 'wool'] })).toMatch(/bank/);
    const before = t.rules.hands[0];
    t = act(t, 0, { type: 'playCard', card: 'plenty', take: ['brick', 'brick'] });
    expect(t.rules.hands[0].brick).toBe(before.brick + 2);
    expect(cardsInPlay(t)).toEqual(RESOURCES.map(() => BANK_EACH));
  });

  it('monopoly takes every card of one kind from everyone else', () => {
    let t = withDev(ready(), 0, ['monopoly']);
    t = withCards(withCards(withCards(t, 0, { ore: 1 }), 1, { ore: 3, wood: 2 }), 2, { ore: 2 });
    t = act(t, 0, { type: 'playCard', card: 'monopoly', resource: 'ore' });
    expect(t.rules.hands.map((h) => h.ore)).toEqual([6, 0, 0]);
    expect(t.rules.hands[1].wood).toBe(2);
    expect(cardsInPlay(t)).toEqual(RESOURCES.map(() => BANK_EACH));
  });
});

describe('Largest Army', () => {
  it('goes to the first with 3 knights, and only moves when someone has more', () => {
    expect(awardHolder(null, [2, 0, 0], 3)).toBeNull();
    expect(awardHolder(null, [3, 0, 0], 3)).toBe(0);
    expect(awardHolder(0, [3, 3, 0], 3)).toBe(0);
    expect(awardHolder(0, [3, 4, 0], 3)).toBe(1);
  });

  it('is worth 2 points once a third knight is played', () => {
    let t = withDev(ready(), 0, ['knight']);
    t = { ...t, rules: { ...t.rules, knights: [2, 0, 0] } };
    t = act(t, 0, { type: 'playCard', card: 'knight' });
    expect(t.rules.largestArmy).toBe(0);
    expect(publicPoints(t.rules, 0)).toBe(4);
  });
});

describe('Longest Road', () => {
  it('counts the longest run of connected roads, taking the longer branch', () => {
    const t = ready();
    const g = geometryOf(t.game);
    const run = chain(t, 0, 6);
    expect(longestRoad(onlyRoads(t, 0, run).rules, g, 0)).toBe(6);
    // A side branch of 2 off the middle doesn't make it longer than the long way round.
    const mid = g.paths[run[2]].ends[1];
    const side = g.spots[mid].paths.find((p) => !run.includes(p))!;
    expect(longestRoad(onlyRoads(t, 0, [...run, side]).rules, g, 0)).toBe(6);
    expect(longestRoad(onlyRoads(t, 0, run.slice(0, 3)).rules, g, 0)).toBe(3);
  });

  it('is broken by another player’s building in the middle', () => {
    let t = ready();
    const g = geometryOf(t.game);
    const run = chain(t, 0, 6);
    t = onlyRoads(t, 0, run);
    const buildings = t.rules.buildings.slice();
    buildings[g.paths[run[1]].ends.find((e) => g.paths[run[2]].ends.includes(e))!] = { seat: 1, kind: 'settlement' };
    expect(longestRoad({ ...t.rules, buildings }, g, 0)).toBe(4);
  });

  it('is worth 2 points from 5 roads, and the holder keeps it on a tie', () => {
    expect(awardHolder(null, [4, 0], 5)).toBeNull();
    expect(awardHolder(null, [5, 0], 5)).toBe(0);
    expect(awardHolder(0, [5, 5], 5)).toBe(0);
    expect(awardHolder(0, [5, 6], 5)).toBe(1);
    // A broken holder loses it to a single leader, or to nobody when the lead is shared.
    expect(awardHolder(0, [3, 6, 5], 5)).toBe(1);
    expect(awardHolder(0, [3, 6, 6], 5)).toBeNull();
    expect(awardHolder(0, [3, 4, 4], 5)).toBeNull();
  });

  it('changes hands as roads are built', () => {
    let t = rolled(ready());
    const g = geometryOf(t.game);
    // Seat 0's own roads, plus a fresh run of 4 free for it to extend.
    const start = t.rules.buildings.findIndex((b) => b?.seat === 0);
    const run = chain(t, start, 5);
    const roads = t.rules.roads.slice();
    for (const p of run.slice(0, 4)) roads[p] ??= 0;
    t = { ...t, rules: { ...t.rules, roads } };
    expect(legalPlaces(t, 0, 'road')).toContain(run[4]);
    t = withCards(t, 0, { wood: 1, brick: 1 });
    t = buildAt(t, 0, 'road', run[4]);
    expect(longestRoad(t.rules, g, 0)).toBeGreaterThanOrEqual(5);
    expect(t.rules.longestRoad).toBe(0);
    expect(publicPoints(t.rules, 0)).toBe(4);
  });
});

describe('winning', () => {
  const nearlyWon = () => {
    // 2 settlements, plus 7 victory point cards: 9 points, one short.
    let t = withDev(rolled(ready()), 0, ['point', 'point', 'point', 'point', 'point']);
    t = { ...t, rules: { ...t.rules, devCards: t.rules.devCards.map((h, s) => (s === 0 ? [...h, { card: 'point' as const, bought: 0 }, { card: 'point' as const, bought: 0 }] : h)) } };
    return t;
  };

  it('ends the game the moment the current player reaches 10, counting hidden points', () => {
    let t = withCards(nearlyWon(), 0, { ...DEV_COST });
    expect(totalPoints(t.rules, 0)).toBe(9);
    // One more point: a settlement upgraded to a city.
    t = withCards(t, 0, { grain: 2, ore: 3 });
    t = buildAt(t, 0, 'city', legalPlaces(t, 0, 'city')[0]);
    expect(t.rules.winner).toBe(0);
    expect(rejects(t, 0, { type: 'endTurn' })).toBe('The game is over');
    expect(rejects(t, 1, { type: 'roll' })).toBe('The game is over');
  });

  it('only wins on the player’s own turn', () => {
    // Seat 1 holds 10 points' worth while it's seat 0's turn.
    let t = rolled(ready());
    const devCards = t.rules.devCards.map((h, s) => (s === 1 ? Array.from({ length: 8 }, () => ({ card: 'point' as const, bought: 0 })) : h));
    t = { ...t, rules: { ...t.rules, devCards } };
    t = withCards(t, 0, { wood: 4 });
    t = act(t, 0, { type: 'bankTrade', give: 'wood', get: 'ore' });
    expect(t.rules.winner).toBeNull();
    // As soon as the turn passes to them, they win.
    expect(act(t, 0, { type: 'endTurn' }).rules.winner).toBe(1);
  });

  it('keeps saved states valid through buying and playing', () => {
    let t = withDev(rolled(ready()), 0, ['knight']);
    t = withCards(t, 0, DEV_COST);
    t = act(t, 0, { type: 'buyCard' });
    expect(isRulesState(t.rules, t.game)).toBe(true);
    t = act(t, 0, { type: 'playCard', card: 'knight' });
    expect(isRulesState(t.rules, t.game)).toBe(true);
  });
});
