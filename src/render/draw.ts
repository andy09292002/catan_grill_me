import type { Board, Harbor, Tile } from '../board/generate';
import { RED_NUMBERS } from '../board/generate';
import { corner, type Point } from '../board/layout';
import type { AnimationLevel } from '../game/prefs';
import { seatEdge } from '../game/players';
import { drawTerrainIcon, ICON_SPOTS, ICON_UNITS } from './animate';
import { COLORS, drawIcon, harborLabel, TERRAIN_COLORS } from './art';
import { fitBoard, type Fit } from './fit';

type Ctx = CanvasRenderingContext2D;

const TOKEN_RADIUS = 0.3;
const HARBOR_DISTANCE = 0.66;
const HARBOR_RADIUS = 0.31;
const FONT = 'system-ui, "Segoe UI", Helvetica, Arial, sans-serif';

function hexPath(ctx: Ctx, fit: Fit, c: Point, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const p = fit.toScreen(corner(c, k, r));
    if (k) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.closePath();
}

/** Ways to roll a number with two dice: the dots under a number token. */
export function pips(n: number): number {
  return 6 - Math.abs(7 - n);
}

function drawBackground(ctx: Ctx, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, COLORS.backgroundInner);
  g.addColorStop(1, COLORS.backgroundOuter);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawSea(ctx: Ctx, board: Board, fit: Fit) {
  const { centers } = board.layout;
  ctx.lineJoin = 'round';
  for (const [r, fill] of [
    [1.75, COLORS.seaDeep],
    [1.45, COLORS.sea],
  ] as const) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    ctx.lineWidth = fit.scale * 0.3;
    centers.forEach((c) => {
      hexPath(ctx, fit, c, r);
      ctx.fill();
      ctx.stroke();
    });
  }
  ctx.fillStyle = COLORS.beach;
  centers.forEach((c) => {
    hexPath(ctx, fit, c, 1.07);
    ctx.fill();
  });
}

function drawTileBase(ctx: Ctx, board: Board, fit: Fit, tile: Tile) {
  const c = board.layout.centers[tile.id];
  const s = fit.toScreen(c);
  const [light, dark] = TERRAIN_COLORS[tile.terrain];
  const g = ctx.createRadialGradient(
    s.x - 0.15 * fit.scale,
    s.y - 0.2 * fit.scale,
    0,
    s.x,
    s.y,
    fit.scale,
  );
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  hexPath(ctx, fit, c, 0.975);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, fit.scale * 0.025);
  ctx.strokeStyle = COLORS.tileEdge;
  ctx.stroke();
}

function drawTileIcons(ctx: Ctx, board: Board, fit: Fit, tile: Tile, view: View) {
  const s = fit.toScreen(board.layout.centers[tile.id]);
  // Icons are placed in screen space so they stay upright whichever way the board is turned.
  const f = fit.scale / ICON_UNITS;
  ICON_SPOTS.forEach((spot, i) => {
    const x = s.x + spot.x * fit.scale;
    const y = s.y + spot.y * fit.scale;
    drawTerrainIcon(ctx, tile.terrain, tile.id, i, x, y, f, view.animation.t, view.animation.level);
  });
}

function drawToken(ctx: Ctx, board: Board, fit: Fit, tile: Tile, view: View) {
  if (tile.number === null) return;
  const s = fit.toScreen(board.layout.centers[tile.id]);
  const r = TOKEN_RADIUS * fit.scale;
  const red = RED_NUMBERS.includes(tile.number);
  const lit = isLit(tile, view);
  const ink = red ? COLORS.tokenRed : COLORS.tokenText;

  ctx.save();
  ctx.shadowColor = lit ? COLORS.litGlow : 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = lit ? r * 0.9 : r * 0.35;
  ctx.shadowOffsetY = lit ? 0 : r * 0.1;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fillStyle = lit ? COLORS.tokenLit : COLORS.token;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = Math.max(1, r * (lit ? 0.12 : 0.07));
  ctx.strokeStyle = lit ? COLORS.tokenLitEdge : COLORS.tokenEdge;
  ctx.stroke();

  // Number and pips turn to face the current player; the token itself is round, so only its contents move.
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate((view.textAngle * Math.PI) / 180);
  const label = String(tile.number);
  const size = r * 0.95;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const baseline = size * 0.3;
  ctx.fillText(label, 0, baseline);

  // 6 and 9 read the same upside down, so they get an underline.
  if (tile.number === 6 || tile.number === 9) {
    const half = ctx.measureText(label).width / 2;
    ctx.fillRect(-half, baseline + size * 0.08, half * 2, Math.max(1, size * 0.08));
  }

  const n = pips(tile.number);
  const gap = r * 0.2;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc((i - (n - 1) / 2) * gap, r * 0.62, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function isLit(tile: Tile, view: View): boolean {
  return !!view.highlight?.lit.has(tile.id);
}

/** Darkens tiles that didn't produce and rings the ones that did. */
function drawHighlight(ctx: Ctx, board: Board, fit: Fit, view: View) {
  if (!view.highlight) return;
  const { centers } = board.layout;
  ctx.fillStyle = COLORS.dim;
  board.tiles.forEach((t) => {
    if (isLit(t, view)) return;
    hexPath(ctx, fit, centers[t.id], 0.975);
    ctx.fill();
  });
  if (!view.flashOn) return;
  board.tiles.forEach((t) => {
    if (!isLit(t, view)) return;
    ctx.save();
    ctx.shadowColor = COLORS.litGlow;
    ctx.shadowBlur = fit.scale * 0.35;
    ctx.strokeStyle = COLORS.litRing;
    ctx.lineWidth = fit.scale * 0.08;
    ctx.lineJoin = 'round';
    hexPath(ctx, fit, centers[t.id], 0.93);
    ctx.stroke();
    ctx.restore();
  });
}

/** A soft band of the current player's color along their side of the screen. */
function drawGlow(ctx: Ctx, width: number, height: number, glow: NonNullable<View['glow']>) {
  const { point, side } = seatEdge(glow.angle, width, height);
  const horizontal = side === 'top' || side === 'bottom';
  const edgeLength = horizontal ? width : height;
  const length = edgeLength * 0.5;
  const thick = Math.min(width, height) * 0.05;
  const along = horizontal ? point.x : point.y;
  const start = Math.max(0, Math.min(edgeLength - length, along - length / 2));

  let x = 0;
  let y = 0;
  let w = thick;
  let h = thick;
  let g: CanvasGradient;
  if (horizontal) {
    x = start;
    w = length;
    y = side === 'top' ? 0 : height - thick;
    g = side === 'top' ? ctx.createLinearGradient(0, 0, 0, thick) : ctx.createLinearGradient(0, height, 0, height - thick);
  } else {
    y = start;
    h = length;
    x = side === 'left' ? 0 : width - thick;
    g = side === 'left' ? ctx.createLinearGradient(0, 0, thick, 0) : ctx.createLinearGradient(width, 0, width - thick, 0);
  }
  g.addColorStop(0, glow.color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, thick / 2);
  ctx.fill();
  ctx.restore();
}

function harborAt(fit: Fit, harbor: Harbor): Point {
  const { edge } = harbor;
  return fit.toScreen({
    x: edge.mid.x + edge.normal.x * HARBOR_DISTANCE,
    y: edge.mid.y + edge.normal.y * HARBOR_DISTANCE,
  });
}

function drawHarborBase(ctx: Ctx, fit: Fit, harbor: Harbor) {
  const { edge, kind } = harbor;
  const at = harborAt(fit, harbor);
  const r = HARBOR_RADIUS * fit.scale;

  // Two piers run from the edge's corners out to the harbor marker.
  ctx.strokeStyle = COLORS.pier;
  ctx.lineWidth = Math.max(2, fit.scale * 0.06);
  ctx.lineCap = 'round';
  for (const end of [edge.a, edge.b]) {
    const from = fit.toScreen({ x: end.x * 0.85 + edge.mid.x * 0.15, y: end.y * 0.85 + edge.mid.y * 0.15 });
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(at.x, at.y);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.fillStyle = kind === 'generic' ? '#fdfaf2' : TERRAIN_COLORS[kind][0];
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.strokeStyle = COLORS.tokenEdge;
  ctx.stroke();
}

/** The label turns with the other text; the marker and piers stay put. */
function drawHarborLabel(ctx: Ctx, fit: Fit, harbor: Harbor, view: View) {
  const { kind } = harbor;
  const at = harborAt(fit, harbor);
  const r = HARBOR_RADIUS * fit.scale;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate((view.textAngle * Math.PI) / 180);
  if (kind !== 'generic') drawIcon(ctx, kind, 0, -r * 0.32, r / 50);
  const size = r * (kind === 'generic' ? 0.66 : 0.56);
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = COLORS.tokenText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(harborLabel(kind), 0, kind === 'generic' ? 0 : r * 0.45);
  ctx.restore();
}

/** A red "no entry" sign over the token of a tile the thief is blocking. */
function drawBlocked(ctx: Ctx, board: Board, fit: Fit, tile: number) {
  const s = fit.toScreen(board.layout.centers[tile]);
  const r = TOKEN_RADIUS * fit.scale * 1.3;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = r * 0.3;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.blockedFill;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = COLORS.blocked;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 0.9, 0, Math.PI * 2);
  ctx.moveTo(s.x - r * 0.64, s.y - r * 0.64);
  ctx.lineTo(s.x + r * 0.64, s.y + r * 0.64);
  ctx.stroke();
}

/** A hooded figure below the tile's token, so the number stays readable. */
function drawThief(ctx: Ctx, board: Board, fit: Fit, thief: NonNullable<View['thief']>) {
  const c = fit.toScreen(board.layout.centers[thief.tile]);
  const u = fit.scale * 1.4 * (1 + 0.12 * Math.sin(thief.pulse * Math.PI * 2));
  const x = c.x;
  const y = c.y + fit.scale * 0.58;

  if (thief.choosing) {
    ctx.save();
    ctx.setLineDash([fit.scale * 0.12, fit.scale * 0.08]);
    ctx.lineDashOffset = -thief.pulse * fit.scale;
    ctx.strokeStyle = COLORS.litRing;
    ctx.lineWidth = fit.scale * 0.05;
    hexPath(ctx, fit, board.layout.centers[thief.tile], 0.9);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = u * 0.08;
  ctx.shadowOffsetY = u * 0.02;
  ctx.fillStyle = COLORS.thief;
  ctx.strokeStyle = COLORS.thiefEdge;
  ctx.lineWidth = Math.max(1, u * 0.018);
  // Cloak
  ctx.beginPath();
  ctx.moveTo(x - u * 0.12, y + u * 0.17);
  ctx.quadraticCurveTo(x - u * 0.13, y - u * 0.02, x - u * 0.06, y - u * 0.06);
  ctx.lineTo(x + u * 0.06, y - u * 0.06);
  ctx.quadraticCurveTo(x + u * 0.13, y - u * 0.02, x + u * 0.12, y + u * 0.17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Hooded head
  ctx.beginPath();
  ctx.arc(x, y - u * 0.11, u * 0.075, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export interface View {
  /** Degrees the board's text is turned, towards the current player. */
  textAngle: number;
  /** Tiles that produced on the last roll, and the one the thief blocked; null for none (including after a 7). */
  highlight: { lit: Set<number>; blocked: Set<number> } | null;
  /** Whether the highlight ring shows; it blinks for a few seconds after a roll, then stays on. */
  flashOn: boolean;
  /** The current player's edge glow. */
  glow: { color: string; angle: number } | null;
  /** The on-screen thief; `pulse` runs 0 to 1 while players choose where to move it. */
  thief: { tile: number; choosing: boolean; pulse: number } | null;
  /** Seconds on the animation clock, and how much the terrain art may move. */
  animation: { t: number; level: AnimationLevel };
}

export const PLAIN_VIEW: View = {
  textAngle: 0,
  highlight: null,
  flashOn: false,
  glow: null,
  thief: null,
  animation: { t: 0, level: 'off' },
};

/**
 * The parts of the board that never change during a game: background, sea, harbor markers
 * and tile colors. Callers can draw this once into an offscreen canvas and reuse it.
 */
export function drawBase(ctx: Ctx, board: Board, width: number, height: number): Fit {
  const fit = fitBoard(board.layout, width, height);
  drawBackground(ctx, width, height);
  drawSea(ctx, board, fit);
  board.harbors.forEach((h) => drawHarborBase(ctx, fit, h));
  board.tiles.forEach((t) => drawTileBase(ctx, board, fit, t));
  return fit;
}

/** Everything drawn on top of the base each frame: moving art, highlights, text, the thief and the glow. */
export function drawLive(ctx: Ctx, board: Board, fit: Fit, width: number, height: number, view: View) {
  board.tiles.forEach((t) => drawTileIcons(ctx, board, fit, t, view));
  board.harbors.forEach((h) => drawHarborLabel(ctx, fit, h, view));
  drawHighlight(ctx, board, fit, view);
  board.tiles.forEach((t) => drawToken(ctx, board, fit, t, view));
  view.highlight?.blocked.forEach((tile) => drawBlocked(ctx, board, fit, tile));
  if (view.thief) drawThief(ctx, board, fit, view.thief);
  if (view.glow) drawGlow(ctx, width, height, view.glow);
}

/** Draws the full board to fill a canvas of the given CSS-pixel size. */
export function drawBoard(ctx: Ctx, board: Board, width: number, height: number, view: View = PLAIN_VIEW): Fit {
  const fit = drawBase(ctx, board, width, height);
  drawLive(ctx, board, fit, width, height, view);
  return fit;
}
