import type { Point } from '../board/layout';
import type { Rng } from '../board/rng';

export type PlayerColor = 'red' | 'blue' | 'white' | 'orange' | 'green' | 'brown';

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'white', 'orange', 'green', 'brown'];

export const PLAYER_HEX: Record<PlayerColor, string> = {
  red: '#e2453c',
  blue: '#3b82e0',
  white: '#f2efe6',
  orange: '#f0962b',
  green: '#4fa83d',
  brown: '#8a5a2b',
};

export const PLAYER_NAMES: Record<PlayerColor, string> = {
  red: 'Red',
  blue: 'Blue',
  white: 'White',
  orange: 'Orange',
  green: 'Green',
  brown: 'Brown',
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/**
 * Seats are spread evenly around the screen, clockwise as seen from above, starting at the
 * bottom edge. Text facing seat `i` is rotated by this many degrees.
 */
export function seatAngle(seat: number, players: number): number {
  return (seat * 360) / players;
}

/** Unit vector from the screen centre towards the player sitting at `angle` degrees. */
export function seatDirection(angle: number): Point {
  const a = (angle * Math.PI) / 180;
  return { x: -Math.sin(a), y: Math.cos(a) };
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** Where a ray from the screen centre towards a seat leaves the screen. */
export function seatEdge(angle: number, width: number, height: number): { point: Point; side: Side } {
  const d = seatDirection(angle);
  const tx = Math.abs(d.x) > 1e-9 ? width / 2 / Math.abs(d.x) : Infinity;
  const ty = Math.abs(d.y) > 1e-9 ? height / 2 / Math.abs(d.y) : Infinity;
  const t = Math.min(tx, ty);
  const point = { x: width / 2 + d.x * t, y: height / 2 + d.y * t };
  const side: Side = tx < ty ? (d.x > 0 ? 'right' : 'left') : d.y > 0 ? 'bottom' : 'top';
  return { point, side };
}

export function defaultColors(players: number): PlayerColor[] {
  return PLAYER_COLORS.slice(0, players);
}

/** The next color not used by another seat, for tapping through a seat's color. */
export function nextFreeColor(colors: PlayerColor[], seat: number): PlayerColor {
  const start = PLAYER_COLORS.indexOf(colors[seat]);
  for (let i = 1; i <= PLAYER_COLORS.length; i++) {
    const candidate = PLAYER_COLORS[(start + i) % PLAYER_COLORS.length];
    if (!colors.some((c, s) => s !== seat && c === candidate)) return candidate;
  }
  return colors[seat];
}

export function randomSeat(players: number, rng: Rng): number {
  return Math.floor(rng() * players);
}
