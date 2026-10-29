import type { Geometry } from './geometry';

// Longest Road and Largest Army: who holds them, from road lengths and knights played.

interface RoadState {
  buildings: ({ seat: number } | null)[];
  roads: (number | null)[];
}

/**
 * The seat's longest run of connected roads, never using a road twice. A run may end at
 * another player's building but can't pass through it.
 */
export function longestRoad(r: RoadState, g: Geometry, seat: number): number {
  let best = 0;
  const used = new Set<number>();
  const walk = (spot: number, length: number) => {
    best = Math.max(best, length);
    const b = r.buildings[spot];
    if (length > 0 && b && b.seat !== seat) return;
    for (const p of g.spots[spot].paths) {
      if (r.roads[p] !== seat || used.has(p)) continue;
      used.add(p);
      const [a, z] = g.paths[p].ends;
      walk(a === spot ? z : a, length + 1);
      used.delete(p);
    }
  };
  r.roads.forEach((owner, p) => {
    if (owner === seat) for (const end of g.paths[p].ends) walk(end, 0);
  });
  return best;
}

/**
 * Who holds an award after a change, given each seat's count and the least that qualifies.
 * The holder keeps it while still level with the best; otherwise it goes to a single clear
 * leader, or to nobody when the best is shared.
 */
export function awardHolder(holder: number | null, values: number[], min: number): number | null {
  const max = Math.max(...values);
  if (max < min) return null;
  if (holder !== null && values[holder] === max) return holder;
  const leaders = values.flatMap((v, s) => (v === max ? [s] : []));
  return leaders.length === 1 ? leaders[0] : null;
}

export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;
export const AWARD_POINTS = 2;
