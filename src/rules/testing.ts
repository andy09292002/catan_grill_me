import { expect } from 'vitest';
import { createGame, type NewGameOptions } from '../game/state';
import { apply, geometryOf, hand, legalPlaces, RESOURCES, startTable, type Action, type BuildKind, type Hand, type Table } from './engine';

// Shared helpers for the rules tests.

export const OPTIONS: NewGameOptions = { colors: ['red', 'blue', 'white'], firstSeat: 0, size: 19, mode: 'balanced', seed: 12345, thiefStyle: 'onscreen' };

/** A new table; the development deck is shuffled from a fixed seed so tests repeat. */
export const fresh = (o: Partial<NewGameOptions> = {}) => startTable(createGame({ ...OPTIONS, ...o }), seeded(1));

/** A small seeded generator, so a test's shuffles come out the same every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function act(t: Table, seat: number, a: Action, roll?: () => [number, number], random?: () => number): Table {
  const r = apply(t, seat, a, roll, random);
  if (!r.ok) throw new Error(`${a.type}: ${r.reason}`);
  return r.table;
}

export function rejects(t: Table, seat: number, a: Action): string {
  const r = apply(t, seat, a);
  expect(r.ok, `${a.type} should be refused`).toBe(false);
  return r.ok ? '' : r.reason;
}

export function buildAt(t: Table, seat: number, kind: BuildKind, at: number): Table {
  t = act(t, seat, { type: 'build', kind });
  t = act(t, seat, { type: 'pick', at });
  return act(t, seat, { type: 'confirm' });
}

/** Plays setup, putting settlements on the first legal spot of `prefer` (else inland) with the first legal road. */
export function finishSetup(t: Table, prefer: number[] = []): Table {
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
export function withCards(t: Table, seat: number, h: Partial<Hand>): Table {
  const next = hand(h);
  const hands = t.rules.hands.slice();
  const bank = { ...t.rules.bank };
  for (const r of RESOURCES) bank[r] -= next[r] - hands[seat][r];
  hands[seat] = next;
  return { ...t, rules: { ...t.rules, hands, bank } };
}

export const rolled = (t: Table, total = 2) => act(t, t.game.current, { type: 'enterRoll', total });
export const cardsInPlay = (t: Table) => RESOURCES.map((r) => t.rules.bank[r] + t.rules.hands.reduce((n, h) => n + h[r], 0));

