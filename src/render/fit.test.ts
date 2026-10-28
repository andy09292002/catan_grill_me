import { describe, expect, it } from 'vitest';
import { buildLayout, corner } from '../board/layout';
import { BOARD_MARGIN, fitBoard } from './fit';

const SCREENS = [
  [1920, 1080],
  [1366, 768],
  [2560, 1440],
  [1024, 768],
  [768, 1024],
] as const;

describe('fitBoard', () => {
  it.each([19, 30] as const)('keeps the whole %i-hex board and its sea on screen', (size) => {
    const layout = buildLayout(size);
    for (const [w, h] of SCREENS) {
      const fit = fitBoard(layout, w, h);
      const pad = BOARD_MARGIN * fit.scale - 0.5;
      layout.centers.forEach((c) => {
        for (let k = 0; k < 6; k++) {
          const p = fit.toScreen(corner(c, k));
          expect(p.x).toBeGreaterThanOrEqual(pad);
          expect(p.x).toBeLessThanOrEqual(w - pad);
          expect(p.y).toBeGreaterThanOrEqual(pad);
          expect(p.y).toBeLessThanOrEqual(h - pad);
        }
      });
    }
  });

  it('fills the limiting dimension of the screen', () => {
    const layout = buildLayout(19);
    const fit = fitBoard(layout, 1920, 1080);
    const ys = layout.centers.flatMap((c) => [0, 3].map((k) => fit.toScreen(corner(c, k)).y));
    const span = Math.max(...ys) - Math.min(...ys) + 2 * BOARD_MARGIN * fit.scale;
    expect(span).toBeCloseTo(1080, 0);
  });

  it('turns the 30-hex board sideways on landscape screens and upright on portrait', () => {
    const layout = buildLayout(30);
    expect(fitBoard(layout, 1920, 1080).rotation).toBe(90);
    expect(fitBoard(layout, 768, 1024).rotation).toBe(0);
  });

  it('keeps the 19-hex board pointy-top on landscape screens', () => {
    expect(fitBoard(buildLayout(19), 1920, 1080).rotation).toBe(0);
  });
});
