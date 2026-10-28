import { buildLayout, type BoardSize, type Edge, type Layout } from './layout';
import { createRng, shuffle, type Rng } from './rng';

export type Terrain = 'forest' | 'field' | 'hills' | 'pasture' | 'mountain' | 'desert';
export type ResourceTerrain = Exclude<Terrain, 'desert'>;
export type RandomMode = 'random' | 'balanced' | 'balancedPlus';
export type HarborKind = 'generic' | ResourceTerrain;

export const RESOURCE_TERRAINS: ResourceTerrain[] = ['forest', 'field', 'hills', 'pasture', 'mountain'];
export const RED_NUMBERS = [6, 8];

export interface Tile {
  id: number;
  terrain: Terrain;
  /** null for desert tiles. */
  number: number | null;
}

export interface Harbor {
  kind: HarborKind;
  edge: Edge;
}

export interface Board {
  size: BoardSize;
  mode: RandomMode;
  seed: number;
  layout: Layout;
  tiles: Tile[];
  harbors: Harbor[];
}

interface Contents {
  terrain: Record<Terrain, number>;
  numbers: number[];
  harbors: Record<HarborKind, number>;
}

const repeat = (values: number[], times: number) => values.flatMap((v) => Array<number>(times).fill(v));

export const CONTENTS: Record<BoardSize, Contents> = {
  19: {
    terrain: { forest: 4, field: 4, hills: 3, pasture: 4, mountain: 3, desert: 1 },
    numbers: [2, 12, ...repeat([3, 4, 5, 6, 8, 9, 10, 11], 2)],
    harbors: { generic: 4, forest: 1, field: 1, hills: 1, pasture: 1, mountain: 1 },
  },
  30: {
    terrain: { forest: 6, field: 6, hills: 5, pasture: 6, mountain: 5, desert: 2 },
    numbers: [...repeat([2, 12], 2), ...repeat([3, 4, 5, 6, 8, 9, 10, 11], 3)],
    harbors: { generic: 5, forest: 1, field: 1, hills: 1, pasture: 2, mountain: 1 },
  },
};

function expand<K extends string>(counts: Record<K, number>): K[] {
  return (Object.keys(counts) as K[]).flatMap((k) => Array<K>(counts[k]).fill(k));
}

const STEP_BUDGET = 2000;
const MAX_RESTARTS = 500;

/**
 * Fills `slots` in a random order with values from the multiset `pool`, backtracking when
 * `allowed` rejects a value. Backtracking search has heavy-tailed run times, so each attempt
 * gets a step budget and gives up for a freshly shuffled restart instead of thrashing.
 */
function assign<T>(
  slots: number[],
  pool: T[],
  rng: Rng,
  allowed: (slot: number, value: T, placed: Map<number, T>) => boolean,
): Map<number, T> | null {
  for (let attempt = 0; attempt < MAX_RESTARTS; attempt++) {
    const result = attemptAssign(shuffle(slots, rng), pool, rng, allowed);
    if (result) return result;
  }
  return null;
}

function attemptAssign<T>(
  slots: number[],
  pool: T[],
  rng: Rng,
  allowed: (slot: number, value: T, placed: Map<number, T>) => boolean,
): Map<number, T> | null {
  const remaining = new Map<T, number>();
  for (const v of pool) remaining.set(v, (remaining.get(v) ?? 0) + 1);
  const placed = new Map<number, T>();
  let budget = STEP_BUDGET;

  const step = (i: number): boolean => {
    if (i === slots.length) return true;
    if (--budget < 0) return false;
    const slot = slots[i];
    // Weight candidates by how many copies remain so unconstrained boards stay close to a plain shuffle.
    const candidates = shuffle(pool, rng).filter((v, idx, arr) => arr.indexOf(v) === idx && remaining.get(v)! > 0);
    for (const v of candidates) {
      if (!allowed(slot, v, placed)) continue;
      placed.set(slot, v);
      remaining.set(v, remaining.get(v)! - 1);
      if (step(i + 1)) return true;
      placed.delete(slot);
      remaining.set(v, remaining.get(v)! + 1);
    }
    return false;
  };

  return step(0) ? placed : null;
}

/** Size of the connected group of `terrain` that `slot` would join. */
function groupSize(slot: number, terrain: Terrain, placed: Map<number, Terrain>, neighbors: number[][]): number {
  const seen = new Set([slot]);
  const stack = [slot];
  while (stack.length) {
    for (const n of neighbors[stack.pop()!]) {
      if (!seen.has(n) && placed.get(n) === terrain) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size;
}

function placeHarbors(layout: Layout, kinds: HarborKind[], rng: Rng): Harbor[] {
  const coast = layout.coast;
  const step = coast.length / kinds.length;
  const offset = Math.floor(rng() * coast.length);
  return shuffle(kinds, rng).map((kind, i) => ({
    kind,
    edge: coast[(offset + Math.round(i * step)) % coast.length],
  }));
}

export interface GenerateOptions {
  size: BoardSize;
  mode: RandomMode;
  seed: number;
}

export function generateBoard({ size, mode, seed }: GenerateOptions): Board {
  const rng = createRng(seed);
  const layout = buildLayout(size);
  const contents = CONTENTS[size];
  const { neighbors } = layout;
  const ids = layout.centers.map((_, i) => i);

  const terrain = assign(ids, expand(contents.terrain), rng, (slot, t, placed) =>
    mode === 'balancedPlus' ? groupSize(slot, t, placed, neighbors) <= 2 : true,
  );
  if (!terrain) throw new Error(`No valid terrain layout for ${size} hexes in ${mode} mode`);

  const numbered = ids.filter((i) => terrain.get(i) !== 'desert');
  const numbers = assign(numbered, contents.numbers, rng, (slot, n, placed) => {
    if (mode === 'random') return true;
    return neighbors[slot].every((nb) => {
      const other = placed.get(nb);
      if (other === undefined) return true;
      if (RED_NUMBERS.includes(n) && RED_NUMBERS.includes(other)) return false;
      return mode !== 'balancedPlus' || other !== n;
    });
  });
  if (!numbers) throw new Error(`No valid number layout for ${size} hexes in ${mode} mode`);

  const tiles: Tile[] = layout.centers.map((_, id) => ({
    id,
    terrain: terrain.get(id)!,
    number: numbers.get(id) ?? null,
  }));

  return { size, mode, seed, layout, tiles, harbors: placeHarbors(layout, expand(contents.harbors), rng) };
}

/** The parts of a board that must be saved to redraw it exactly, even if the generator changes later. */
export interface SavedBoard {
  size: BoardSize;
  mode: RandomMode;
  seed: number;
  tiles: { terrain: Terrain; number: number | null }[];
  harbors: { kind: HarborKind; coast: number }[];
}

export function saveBoard(board: Board): SavedBoard {
  return {
    size: board.size,
    mode: board.mode,
    seed: board.seed,
    tiles: board.tiles.map(({ terrain, number }) => ({ terrain, number })),
    harbors: board.harbors.map((h) => ({ kind: h.kind, coast: board.layout.coast.indexOf(h.edge) })),
  };
}

export function restoreBoard(saved: SavedBoard): Board {
  const layout = buildLayout(saved.size);
  return {
    size: saved.size,
    mode: saved.mode,
    seed: saved.seed,
    layout,
    tiles: saved.tiles.map((t, id) => ({ id, ...t })),
    harbors: saved.harbors.map((h) => ({ kind: h.kind, edge: layout.coast[h.coast] })),
  };
}

export function boardSizeForPlayers(players: number): BoardSize {
  return players >= 5 ? 30 : 19;
}
