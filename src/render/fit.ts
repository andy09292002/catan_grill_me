import { corner, type Layout, type Point } from '../board/layout';

/** Sea and harbors reach this far past the outermost hex corners, in hex units. */
export const BOARD_MARGIN = 1.15;

export interface Fit {
  /** 0 keeps hexes pointy-top; 90 turns the board so hexes are flat-top. */
  rotation: 0 | 90;
  /** Screen pixels per hex unit. */
  scale: number;
  toScreen(p: Point): Point;
}

function rotate(p: Point, rotation: 0 | 90): Point {
  return rotation === 0 ? p : { x: -p.y, y: p.x };
}

/** Picks the orientation that lets the board fill the most of a width x height area. */
export function fitBoard(layout: Layout, width: number, height: number): Fit {
  const corners = layout.centers.flatMap((c) => [0, 1, 2, 3, 4, 5].map((k) => corner(c, k)));

  const candidates = ([0, 90] as const).map((rotation) => {
    const pts = corners.map((p) => rotate(p, rotation));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - BOARD_MARGIN;
    const maxX = Math.max(...xs) + BOARD_MARGIN;
    const minY = Math.min(...ys) - BOARD_MARGIN;
    const maxY = Math.max(...ys) + BOARD_MARGIN;
    const scale = Math.min(width / (maxX - minX), height / (maxY - minY));
    const ox = width / 2 - ((minX + maxX) / 2) * scale;
    const oy = height / 2 - ((minY + maxY) / 2) * scale;
    return { rotation, scale, ox, oy };
  });

  const best = candidates[0].scale >= candidates[1].scale ? candidates[0] : candidates[1];
  return {
    rotation: best.rotation,
    scale: best.scale,
    toScreen: (p) => {
      const r = rotate(p, best.rotation);
      return { x: best.ox + r.x * best.scale, y: best.oy + r.y * best.scale };
    },
  };
}
