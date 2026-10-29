import { describe, expect, it } from 'vitest';
import {
  bankEach,
  DEV_COST,
  isRulesState,
  legalPlaces,
  RESOURCES,
  totalPoints,
  type Table,
} from './engine';
import { act, buildAt, finishSetup, fresh, rejects, rolled, withCards } from './testing';

// The 5–6 player extension: a bigger bank and deck, and the special build phase.

const five = () => finishSetup(fresh({ colors: ['red', 'blue', 'white', 'orange', 'green'], size: 30 }));
const six = () => finishSetup(fresh({ colors: ['red', 'blue', 'white', 'orange', 'green', 'brown'], size: 30 }));

describe('5–6 players', () => {
  it('start with 24 of each card in the bank and a 34-card deck', () => {
    for (const t of [five(), six()]) {
      const players = t.game.colors.length;
      for (const r of RESOURCES) expect(t.rules.bank[r] + t.rules.hands.reduce((n, h) => n + h[r], 0)).toBe(24);
      expect(t.rules.deck).toHaveLength(34);
      expect(t.rules.deck.filter((c) => c === 'knight')).toHaveLength(20);
      expect(t.rules.deck.filter((c) => c === 'point')).toHaveLength(5);
      expect(bankEach(players)).toBe(24);
    }
    expect(bankEach(4)).toBe(19);
    expect(fresh().rules.deck).toHaveLength(25);
  });

  it('after a turn, each other player builds in order, then the next turn starts', () => {
    let t = rolled(five());
    t = act(t, 0, { type: 'endTurn' });
    const builders: number[] = [];
    while (t.rules.special) {
      builders.push(t.game.current);
      expect(t.rules.rolled).toBe(true);
      t = act(t, t.game.current, { type: 'endTurn' });
    }
    expect(builders).toEqual([1, 2, 3, 4]);
    expect(t.game.current).toBe(1);
    expect(t.game.turn).toBe(2);
    expect(t.rules.rolled).toBe(false);
  });

  it('lets the builder build and buy cards, paying as usual, but not trade, play cards or roll', () => {
    let t = act(rolled(five()), 0, { type: 'endTurn' });
    expect(t.game.current).toBe(1);
    // A road (wood and brick) and a card (wool, grain and ore), with 5 wood to spare.
    t = withCards(t, 1, { wood: 6, brick: 1, wool: 1, grain: 1, ore: 1 });
    expect(rejects(t, 1, { type: 'roll' })).toMatch(/Only building/);
    expect(rejects(t, 1, { type: 'bankTrade', give: 'wood', get: 'ore' })).toMatch(/Only building/);
    expect(rejects(t, 1, { type: 'offer', to: 2, give: { wood: 1, brick: 0, wool: 0, grain: 0, ore: 0 }, get: { wood: 0, brick: 0, wool: 0, grain: 0, ore: 1 } })).toMatch(
      /Only building/,
    );
    expect(rejects(t, 1, { type: 'playCard', card: 'knight' })).toMatch(/Only building/);
    expect(rejects(t, 0, { type: 'build', kind: 'road' })).toBe('Not your turn');
    t = buildAt(t, 1, 'road', legalPlaces(t, 1, 'road')[0]);
    t = act(t, 1, { type: 'buyCard' });
    expect(t.rules.hands[1]).toEqual({ wood: 5, brick: 0, wool: 0, grain: 0, ore: 0 });
    expect(t.rules.devCards[1]).toHaveLength(1);
    expect(isRulesState(t.rules, t.game)).toBe(true);
  });

  it('has no special build phase with 4 or fewer players', () => {
    const t = act(rolled(finishSetup(fresh({ colors: ['red', 'blue', 'white', 'orange'] }))), 0, { type: 'endTurn' });
    expect(t.rules.special).toBeNull();
    expect(t.game.current).toBe(1);
    expect(t.rules.rolled).toBe(false);
  });

  it('only wins on the player’s own turn, not while building in someone else’s', () => {
    let t: Table = act(rolled(five()), 0, { type: 'endTurn' });
    // Seat 1, building now, holds 10 points' worth.
    const devCards = t.rules.devCards.map((h, s) => (s === 1 ? Array.from({ length: 8 }, () => ({ card: 'point' as const, bought: 0 })) : h));
    t = { ...t, rules: { ...t.rules, devCards } };
    expect(totalPoints(t.rules, 1)).toBe(10);
    t = withCards(t, 1, DEV_COST);
    t = act(t, 1, { type: 'buyCard' });
    expect(t.rules.winner).toBeNull();
    // The others finish building; seat 1's own turn comes next, and they win.
    while (t.rules.special) t = act(t, t.game.current, { type: 'endTurn' });
    expect(t.game.current).toBe(1);
    expect(t.rules.winner).toBe(1);
  });

  it('keeps 6-player saves valid through a special build phase', () => {
    let t = act(rolled(six()), 0, { type: 'endTurn' });
    expect(t.rules.special).toEqual({ turnOf: 0, queue: [2, 3, 4, 5] });
    expect(isRulesState(t.rules, t.game)).toBe(true);
  });
});
