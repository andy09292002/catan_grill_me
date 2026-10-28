// Board geometry in "hex units": every hex has circumradius 1 and is pointy-top.
// The renderer scales (and may rotate) these coordinates to fit the screen.

export type BoardSize = 19 | 30;

export interface Point {
  x: number;
  y: number;
}

export interface Edge {
  tile: number;
  /** Corner indices k and k+1 (mod 6) of the tile. */
  side: number;
  a: Point;
  b: Point;
  mid: Point;
  /** Unit vector pointing away from the tile through this edge. */
  normal: Point;
}

export interface Layout {
  size: BoardSize;
  centers: Point[];
  neighbors: number[][];
  /** Edges with sea on the far side, ordered around the coast. */
  coast: Edge[];
}

const SQRT3 = Math.sqrt(3);

export const ROWS: Record<BoardSize, number[]> = {
  19: [3, 4, 5, 4, 3],
  30: [3, 4, 5, 6, 5, 4, 3],
};

export function corner(c: Point, k: number, r = 1): Point {
  const a = (Math.PI / 180) * (-90 + 60 * k);
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
}

export function buildLayout(size: BoardSize): Layout {
  const rows = ROWS[size];
  const mid = (rows.length - 1) / 2;
  const centers: Point[] = [];
  rows.forEach((len, row) => {
    for (let i = 0; i < len; i++) {
      centers.push({ x: (i - (len - 1) / 2) * SQRT3, y: (row - mid) * 1.5 });
    }
  });

  // Neighbouring centres are exactly sqrt(3) apart.
  const neighbors = centers.map((c, i) =>
    centers.flatMap((d, j) => (i !== j && Math.hypot(c.x - d.x, c.y - d.y) < SQRT3 + 0.01 ? [j] : [])),
  );

  const isLand = (p: Point) => centers.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 0.01);
  const coast: Edge[] = [];
  centers.forEach((c, tile) => {
    for (let side = 0; side < 6; side++) {
      const a = corner(c, side);
      const b = corner(c, side + 1);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const len = Math.hypot(m.x - c.x, m.y - c.y);
      const normal = { x: (m.x - c.x) / len, y: (m.y - c.y) / len };
      const across = { x: c.x + normal.x * SQRT3, y: c.y + normal.y * SQRT3 };
      if (!isLand(across)) coast.push({ tile, side, a, b, mid: m, normal });
    }
  });
  coast.sort((e, f) => Math.atan2(e.mid.y, e.mid.x) - Math.atan2(f.mid.y, f.mid.x));

  return { size, centers, neighbors, coast };
}
