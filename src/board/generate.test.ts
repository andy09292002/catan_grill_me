import { describe, expect, it } from 'vitest';
import { boardSizeForPlayers, CONTENTS, generateBoard, RED_NUMBERS, type RandomMode, type Terrain } from './generate';
import { buildLayout, type BoardSize, type Point } from './layout';

const SIZES: BoardSize[] = [19, 30];
const MODES: RandomMode[] = ['random', 'balanced', 'balancedPlus'];
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

const count = <T>(items: T[]) => items.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<T, number>());
const same = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;

describe('layout', () => {
  it.each(SIZES)('has %i tiles in the expected rows', (size) => {
    expect(buildLayout(size).centers).toHaveLength(size);
  });

  it.each(SIZES)('gives the %i-hex board symmetric neighbours with at most 6 each', (size) => {
    const { neighbors } = buildLayout(size);
    neighbors.forEach((ns, i) => {
      expect(ns.length).toBeLessThanOrEqual(6);
      ns.forEach((j) => expect(neighbors[j]).toContain(i));
    });
  });

  it.each(SIZES)('orders the %i-hex coast as one closed loop', (size) => {
    const { coast } = buildLayout(size);
    coast.forEach((e, i) => {
      const next = coast[(i + 1) % coast.length];
      const touches = [e.a, e.b].some((p) => same(p, next.a) || same(p, next.b));
      expect(touches).toBe(true);
    });
  });

  it('has the expected coast lengths', () => {
    expect(buildLayout(19).coast).toHaveLength(30);
    expect(buildLayout(30).coast).toHaveLength(38);
  });
});

describe.each(SIZES)('%i-hex board', (size) => {
  const contents = CONTENTS[size];

  it.each(MODES)('uses the full tile and number set in %s mode', (mode) => {
    for (const seed of SEEDS.slice(0, 50)) {
      const board = generateBoard({ size, mode, seed });
      const terrain = count(board.tiles.map((t) => t.terrain));
      for (const [t, n] of Object.entries(contents.terrain)) expect(terrain.get(t as Terrain) ?? 0).toBe(n);

      const numbers = board.tiles.flatMap((t) => (t.number === null ? [] : [t.number])).sort((a, b) => a - b);
      expect(numbers).toEqual([...contents.numbers].sort((a, b) => a - b));
      board.tiles.forEach((t) => expect(t.number === null).toBe(t.terrain === 'desert'));
    }
  });

  it.each(MODES)('places the right harbors on separate coastal edges in %s mode', (mode) => {
    for (const seed of SEEDS.slice(0, 50)) {
      const { harbors, layout } = generateBoard({ size, mode, seed });
      const kinds = count(harbors.map((h) => h.kind));
      for (const [k, n] of Object.entries(contents.harbors)) expect(kinds.get(k as never) ?? 0).toBe(n);

      harbors.forEach((h) => expect(layout.coast).toContain(h.edge));
      harbors.forEach((h, i) =>
        harbors.slice(i + 1).forEach((g) => {
          const shareCorner = [h.edge.a, h.edge.b].some((p) => same(p, g.edge.a) || same(p, g.edge.b));
          expect(shareCorner).toBe(false);
        }),
      );
    }
  });

  it('never puts red numbers next to each other in balanced modes', () => {
    for (const mode of ['balanced', 'balancedPlus'] as const) {
      for (const seed of SEEDS) {
        const { tiles, layout } = generateBoard({ size, mode, seed });
        tiles.forEach((t) => {
          if (!RED_NUMBERS.includes(t.number ?? 0)) return;
          layout.neighbors[t.id].forEach((n) => expect(RED_NUMBERS).not.toContain(tiles[n].number));
        });
      }
    }
  });

  it('keeps matching numbers apart and terrain groups to 2 or fewer in balanced+ mode', () => {
    for (const seed of SEEDS) {
      const { tiles, layout } = generateBoard({ size, mode: 'balancedPlus', seed });
      tiles.forEach((t) => {
        layout.neighbors[t.id].forEach((n) => {
          if (t.number !== null) expect(tiles[n].number).not.toBe(t.number);
          // A tile with 2+ same-terrain neighbours, or a same-terrain neighbour that has another, makes a group of 3.
          if (tiles[n].terrain === t.terrain) {
            const others = layout.neighbors[n].filter((m) => m !== t.id && tiles[m].terrain === t.terrain);
            expect(others).toHaveLength(0);
          }
        });
      });
    }
  });

  it('produces red neighbours sometimes in purely random mode', () => {
    const anyAdjacentReds = SEEDS.some((seed) => {
      const { tiles, layout } = generateBoard({ size, mode: 'random', seed });
      return tiles.some(
        (t) =>
          RED_NUMBERS.includes(t.number ?? 0) &&
          layout.neighbors[t.id].some((n) => RED_NUMBERS.includes(tiles[n].number ?? 0)),
      );
    });
    expect(anyAdjacentReds).toBe(true);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const a = generateBoard({ size, mode: 'balanced', seed: 42 });
    const b = generateBoard({ size, mode: 'balanced', seed: 42 });
    const c = generateBoard({ size, mode: 'balanced', seed: 43 });
    expect(b.tiles).toEqual(a.tiles);
    expect(b.harbors).toEqual(a.harbors);
    expect(c.tiles).not.toEqual(a.tiles);
  });
});

describe('boardSizeForPlayers', () => {
  it('uses 19 hexes for 2 to 4 players and 30 for 5 to 6', () => {
    expect([2, 3, 4, 5, 6].map(boardSizeForPlayers)).toEqual([19, 19, 19, 30, 30]);
  });
});
