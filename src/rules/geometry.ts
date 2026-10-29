import type { HarborKind } from '../board/generate';
import { buildLayout, corner, type BoardSize, type Point } from '../board/layout';
import { restoreBoard, type SavedBoard } from '../board/generate';

// Where pieces go: settlements and cities on tile corners ("spots"), roads on tile sides ("paths").
// Ids are stable for a board size, so saved games and messages can refer to them by number.

export interface Spot {
  id: number;
  at: Point;
  /** Tiles this corner touches (1 to 3). */
  tiles: number[];
  /** Spots one path away. */
  neighbors: number[];
  paths: number[];
  /** The harbor this spot can trade through, if any. */
  harbor: HarborKind | null;
}

export interface Path {
  id: number;
  /** Its two end spots. */
  ends: [number, number];
  a: Point;
  b: Point;
}

export interface Geometry {
  spots: Spot[];
  paths: Path[];
}

const cache = new Map<BoardSize, Omit<Geometry, 'spots'> & { spots: Omit<Spot, 'harbor'>[] }>();

function shape(size: BoardSize) {
  const known = cache.get(size);
  if (known) return known;
  const layout = buildLayout(size);
  const spots: Omit<Spot, 'harbor'>[] = [];
  const paths: Path[] = [];
  const spotAt = (p: Point) => {
    // Corners shared by neighbouring tiles land on the same point, give or take rounding.
    let s = spots.find((q) => Math.hypot(q.at.x - p.x, q.at.y - p.y) < 0.01);
    if (!s) {
      s = { id: spots.length, at: p, tiles: [], neighbors: [], paths: [] };
      spots.push(s);
    }
    return s;
  };
  layout.centers.forEach((c, tile) => {
    const ring = Array.from({ length: 6 }, (_, k) => spotAt(corner(c, k)));
    ring.forEach((s, k) => {
      if (!s.tiles.includes(tile)) s.tiles.push(tile);
      const t = ring[(k + 1) % 6];
      if (s.neighbors.includes(t.id)) return;
      const path: Path = { id: paths.length, ends: [s.id, t.id], a: s.at, b: t.at };
      paths.push(path);
      s.neighbors.push(t.id);
      t.neighbors.push(s.id);
      s.paths.push(path.id);
      t.paths.push(path.id);
    });
  });
  const result = { spots, paths };
  cache.set(size, result);
  return result;
}

/** The spots and paths of a board, with each harbor attached to the two spots on its coast side. */
export function boardGeometry(board: SavedBoard): Geometry {
  const { spots, paths } = shape(board.size);
  const harborAt = new Map<number, HarborKind>();
  for (const h of restoreBoard(board).harbors) {
    for (const p of [h.edge.a, h.edge.b]) {
      const s = spots.find((q) => Math.hypot(q.at.x - p.x, q.at.y - p.y) < 0.01);
      if (s) harborAt.set(s.id, h.kind);
    }
  }
  return { spots: spots.map((s) => ({ ...s, harbor: harborAt.get(s.id) ?? null })), paths };
}

/** The path joining two neighbouring spots, or -1. */
export function pathBetween(g: Geometry, a: number, b: number): number {
  return g.spots[a].paths.find((p) => g.paths[p].ends.includes(b)) ?? -1;
}
