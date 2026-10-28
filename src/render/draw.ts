import type { Board, Harbor, Tile } from '../board/generate';
import { RED_NUMBERS } from '../board/generate';
import { corner, type Point } from '../board/layout';
import { COLORS, drawIcon, harborLabel, TERRAIN_COLORS } from './art';
import { fitBoard, type Fit } from './fit';

type Ctx = CanvasRenderingContext2D;

/** Icon spots relative to the tile centre, in hex units, kept clear of corners, edges and the token. */
const ICON_SPOTS: Point[] = [
  { x: -0.34, y: -0.5 },
  { x: 0, y: -0.64 },
  { x: 0.34, y: -0.5 },
  { x: -0.42, y: 0.46 },
  { x: 0.42, y: 0.46 },
];
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

function drawTile(ctx: Ctx, board: Board, fit: Fit, tile: Tile) {
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

  // Icons are placed in screen space so they stay upright whichever way the board is turned.
  const iconScale = fit.scale / 125;
  for (const spot of ICON_SPOTS) {
    drawIcon(ctx, tile.terrain, s.x + spot.x * fit.scale, s.y + spot.y * fit.scale, iconScale);
  }
}

function drawToken(ctx: Ctx, board: Board, fit: Fit, tile: Tile) {
  if (tile.number === null) return;
  const s = fit.toScreen(board.layout.centers[tile.id]);
  const r = TOKEN_RADIUS * fit.scale;
  const red = RED_NUMBERS.includes(tile.number);
  const ink = red ? COLORS.tokenRed : COLORS.tokenText;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = r * 0.35;
  ctx.shadowOffsetY = r * 0.1;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.token;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = COLORS.tokenEdge;
  ctx.stroke();

  const label = String(tile.number);
  const size = r * 0.95;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const baseline = s.y + size * 0.3;
  ctx.fillText(label, s.x, baseline);

  // 6 and 9 read the same upside down, so they get an underline.
  if (tile.number === 6 || tile.number === 9) {
    const half = ctx.measureText(label).width / 2;
    ctx.fillRect(s.x - half, baseline + size * 0.08, half * 2, Math.max(1, size * 0.08));
  }

  const n = pips(tile.number);
  const gap = r * 0.2;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(s.x + (i - (n - 1) / 2) * gap, s.y + r * 0.62, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHarbor(ctx: Ctx, fit: Fit, harbor: Harbor) {
  const { edge, kind } = harbor;
  const at = fit.toScreen({
    x: edge.mid.x + edge.normal.x * HARBOR_DISTANCE,
    y: edge.mid.y + edge.normal.y * HARBOR_DISTANCE,
  });
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

  if (kind !== 'generic') drawIcon(ctx, kind, at.x, at.y - r * 0.32, r / 50);
  const size = r * (kind === 'generic' ? 0.66 : 0.56);
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = COLORS.tokenText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(harborLabel(kind), at.x, kind === 'generic' ? at.y : at.y + r * 0.45);
}

/** Draws the full board to fill a canvas of the given CSS-pixel size. */
export function drawBoard(ctx: Ctx, board: Board, width: number, height: number): Fit {
  const fit = fitBoard(board.layout, width, height);
  drawBackground(ctx, width, height);
  drawSea(ctx, board, fit);
  board.harbors.forEach((h) => drawHarbor(ctx, fit, h));
  board.tiles.forEach((t) => drawTile(ctx, board, fit, t));
  board.tiles.forEach((t) => drawToken(ctx, board, fit, t));
  return fit;
}
