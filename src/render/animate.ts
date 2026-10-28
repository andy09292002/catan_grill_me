import type { Terrain } from '../board/generate';
import type { Point } from '../board/layout';
import type { AnimationLevel } from '../game/prefs';
import { drawIcon } from './art';

// Terrain art that moves. Icon coordinates are in "icon pixels": at f = 1 a hex has a circumradius
// of 125, so one hex unit is 125 icon pixels.

export const ICON_UNITS = 125;

/** Where icons sit, relative to the tile centre in hex units: clear of corners, edges and the token. */
export const ICON_SPOTS: Point[] = [
  { x: -0.34, y: -0.5 },
  { x: 0, y: -0.64 },
  { x: 0.34, y: -0.5 },
  { x: -0.42, y: 0.46 },
  { x: 0.42, y: 0.46 },
];

/** A spot turned about the tile centre by `deg` degrees, clockwise on screen. */
export function turnSpot(spot: Point, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: spot.x * Math.cos(a) - spot.y * Math.sin(a), y: spot.x * Math.sin(a) + spot.y * Math.cos(a) };
}

/** The spot where hills and mountains show a worker digging instead of their usual icon. */
export const WORKER_SPOT = 3;

/** How far each icon's drawing reaches from its centre, in icon pixels, including any sway. */
export const ICON_RADIUS: Record<Terrain | 'worker', number> = {
  forest: 25,
  field: 22,
  hills: 17,
  pasture: 22,
  mountain: 28,
  desert: 26,
  worker: 28,
};

/** A hex's inscribed circle: everything inside it is away from the corners and edges where pieces go. */
export const SAFE_RADIUS = Math.sqrt(3) / 2;
/** Number tokens fill this radius; with a small gap, icons stay outside it. */
export const TOKEN_CLEARANCE = 0.34;

const TAU = Math.PI * 2;
const frac = (v: number) => v - Math.floor(v);

/** Stable pseudo-random phase in [0, 1) so neighbouring icons don't move in lockstep. */
export function phaseFor(tile: number, spot: number): number {
  return frac(Math.sin(tile * 12.9898 + spot * 78.233) * 43758.5453);
}

/** Degrees a tree or wheat bunch leans in the wind. */
export function sway(t: number, phase: number, level: AnimationLevel, maxDeg: number): number {
  if (level === 'off') return 0;
  const amp = level === 'full' ? maxDeg : maxDeg / 2;
  const speed = level === 'full' ? 0.55 : 0.3;
  // A slow gust envelope on top of the sway keeps it from looking mechanical.
  const gust = 0.75 + 0.25 * Math.sin(TAU * (t * 0.07 + phase));
  return amp * gust * Math.sin(TAU * (t * speed + phase));
}

export const TREE_SWAY_DEG = 5;
export const WHEAT_SWAY_DEG = 9;

/** Room a moving icon has at a spot before it would leave the safe circle, in icon pixels. */
export function roomAt(spot: Point, radius: number): number {
  return Math.max(0, (SAFE_RADIUS - Math.hypot(spot.x, spot.y)) * ICON_UNITS - radius);
}

/** A sheep's wander around its spot: a slow figure-of-eight that never leaves `room`. */
export function sheepWander(t: number, phase: number, level: AnimationLevel, room: number) {
  if (level !== 'full') return { x: 0, y: 0, facing: 1, step: 0 };
  const w = TAU / 13;
  const a = w * t + phase * TAU;
  // Keeps the whole offset, not just each axis, within `room`: 0.95² + 0.3² < 1.
  const rx = Math.min(10, room * 0.95);
  const ry = Math.min(3, room * 0.3);
  return {
    x: rx * Math.sin(a),
    y: ry * Math.sin(2 * a),
    facing: Math.cos(a) >= 0 ? 1 : -1,
    step: Math.sin(t * 9 + phase * TAU),
  };
}

/** Pickaxe angle in radians (0 = horizontal, negative = raised) and whether chips are flying. */
export function pickSwing(t: number, phase: number, level: AnimationLevel) {
  if (level !== 'full') return { angle: -0.5, chips: 0 };
  const u = frac(t / 1.2 + phase);
  if (u < 0.72) {
    // Slow lift...
    const k = u / 0.72;
    return { angle: 0.45 - 1.7 * (1 - (1 - k) * (1 - k)), chips: u < 0.18 ? 1 - u / 0.18 : 0 };
  }
  // ...then a quick strike.
  const k = (u - 0.72) / 0.28;
  return { angle: -1.25 + 1.7 * k * k, chips: 0 };
}

type Ctx = CanvasRenderingContext2D;

function drawSwaying(ctx: Ctx, terrain: 'forest' | 'field', x: number, y: number, f: number, deg: number) {
  const base = terrain === 'forest' ? 17 : 16;
  ctx.save();
  ctx.translate(x, y + base * f);
  ctx.rotate((deg * Math.PI) / 180);
  drawIcon(ctx, terrain, 0, -base * f, f);
  ctx.restore();
}

function drawSheep(ctx: Ctx, x: number, y: number, f: number, facing: number, step: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f * facing, f);
  ctx.fillStyle = '#333';
  const lift = 2 * step;
  ctx.fillRect(-8.5, 6 - Math.max(0, lift), 3, 10);
  ctx.fillRect(5.5, 6 - Math.max(0, -lift), 3, 10);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 10, 0, 0, TAU);
  ctx.moveTo(0, -6);
  ctx.arc(-6, -6, 6, 0, TAU);
  ctx.moveTo(12, -6);
  ctx.arc(6, -6, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.ellipse(15, -3 + Math.abs(step), 6, 5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Drawn larger than the other icons so the digging reads from across the table. */
const WORKER_SCALE = 1.3;

/** A small figure swinging a pickaxe at a rock, with chips flying on each strike. */
function drawWorker(ctx: Ctx, terrain: 'hills' | 'mountain', x: number, y: number, f: number, swing: ReturnType<typeof pickSwing>) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f * WORKER_SCALE, f * WORKER_SCALE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The rock or clay being dug, to the worker's right.
  ctx.fillStyle = terrain === 'hills' ? '#b8492a' : '#5f6473';
  ctx.strokeStyle = terrain === 'hills' ? '#6e2412' : '#3a3d48';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(6, 17);
  ctx.lineTo(9, 9);
  ctx.lineTo(16, 7);
  ctx.lineTo(21, 12);
  ctx.lineTo(20, 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Legs, body and head.
  ctx.strokeStyle = '#3b2a1a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-9, 17);
  ctx.lineTo(-6, 7);
  ctx.lineTo(-2, 17);
  ctx.stroke();
  ctx.fillStyle = '#2f6fb3';
  ctx.beginPath();
  ctx.roundRect(-10, -6, 9, 14, 3);
  ctx.fill();
  ctx.fillStyle = '#f0c9a0';
  ctx.beginPath();
  ctx.arc(-5.5, -10, 4.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e0a800';
  ctx.beginPath();
  ctx.arc(-5.5, -12, 5, Math.PI, TAU);
  ctx.fill();

  // Arm and pickaxe, pivoting at the shoulder.
  ctx.save();
  ctx.translate(-4, -3);
  ctx.rotate(swing.angle);
  ctx.strokeStyle = '#f0c9a0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();
  ctx.strokeStyle = '#7a5530';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(17, 0);
  ctx.stroke();
  ctx.strokeStyle = '#9aa0ad';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(15, -5);
  ctx.quadraticCurveTo(19, 0, 15, 5);
  ctx.stroke();
  ctx.restore();

  if (swing.chips > 0) {
    ctx.fillStyle = terrain === 'hills' ? '#d8743c' : '#c9ccd6';
    const k = 1 - swing.chips;
    for (const [dx, dy] of [
      [1, -1.4],
      [1.6, -0.6],
      [0.4, -1.8],
    ]) {
      ctx.beginPath();
      ctx.arc(12 + dx * 8 * k, 9 + dy * 8 * k + 6 * k * k, 1.6, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Draws the icon at one spot of a tile, moving as `level` allows. `f` scales icon pixels to
 * screen pixels. `windX` is the spot's position across the screen, so wheat waves travel
 * across the board however each tile's art is turned.
 */
export function drawTerrainIcon(
  ctx: Ctx,
  terrain: Terrain,
  tile: number,
  spot: number,
  x: number,
  y: number,
  f: number,
  t: number,
  level: AnimationLevel,
  windX = x,
) {
  const phase = phaseFor(tile, spot);
  if ((terrain === 'hills' || terrain === 'mountain') && spot === WORKER_SPOT) {
    drawWorker(ctx, terrain, x, y, f, pickSwing(t, phase, level));
    return;
  }
  switch (terrain) {
    case 'forest':
      drawSwaying(ctx, 'forest', x, y, f, sway(t, phase, level, TREE_SWAY_DEG));
      return;
    case 'field':
      // Wheat waves follow the wind across the board, so phase follows position.
      drawSwaying(ctx, 'field', x, y, f, sway(t, windX * 0.0012 + phase * 0.25, level, WHEAT_SWAY_DEG));
      return;
    case 'pasture': {
      const m = sheepWander(t, phase, level, roomAt(ICON_SPOTS[spot], ICON_RADIUS.pasture));
      drawSheep(ctx, x + m.x * f, y + m.y * f, f, m.facing, m.step);
      return;
    }
    default:
      drawIcon(ctx, terrain, x, y, f);
  }
}
