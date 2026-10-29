import { describe, expect, it } from 'vitest';
import { generateBoard, saveBoard } from '../board/generate';
import { boardGeometry, pathBetween } from './geometry';

describe('board geometry', () => {
  it.each([
    [19, 54, 72, 9],
    [30, 80, 109, 11],
  ] as const)('%i hexes have %i spots, %i paths and %i harbors', (size, spots, paths, harbors) => {
    const g = boardGeometry(saveBoard(generateBoard({ size, mode: 'balanced', seed: 7 })));
    expect(g.spots).toHaveLength(spots);
    expect(g.paths).toHaveLength(paths);
    // Every harbor serves exactly two spots.
    expect(g.spots.filter((s) => s.harbor).length).toBe(harbors * 2);
  });

  it('links spots, paths and tiles consistently', () => {
    const g = boardGeometry(saveBoard(generateBoard({ size: 19, mode: 'random', seed: 3 })));
    for (const s of g.spots) {
      expect(s.tiles.length).toBeGreaterThanOrEqual(1);
      expect(s.tiles.length).toBeLessThanOrEqual(3);
      expect(s.neighbors.length).toBe(s.paths.length);
      expect(s.neighbors.length).toBeGreaterThanOrEqual(2);
      for (const n of s.neighbors) {
        const p = pathBetween(g, s.id, n);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(g.paths[p].ends).toContain(s.id);
      }
    }
    expect(g.spots.filter((s) => s.tiles.length === 3)).toHaveLength(24);
  });
});
