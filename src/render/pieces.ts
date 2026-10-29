import type { Point } from '../board/layout';
import type { Building, BuildKind } from '../rules/engine';
import type { Geometry } from '../rules/geometry';
import type { Fit } from './fit';

// Roads, settlements and cities in Board + phones games, plus the spots a build may go to.

type Ctx = CanvasRenderingContext2D;

export interface PiecesView {
  geometry: Geometry;
  buildings: (Building | null)[];
  roads: (number | null)[];
  /** Seat colors as CSS colors. */
  colors: string[];
  pending: { kind: BuildKind; legal: number[]; at: number | null; color: string } | null;
  /** 0..1, for the pulsing hints. */
  pulse: number;
}

const OUTLINE = '#1a1406';
/** How close a tap must land to a spot or path, in hex units. */
export const PICK_REACH = 0.42;

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Where a spot or path is on screen. */
export function placeAt(fit: Fit, g: Geometry, kind: BuildKind, at: number): Point {
  return kind === 'road' ? fit.toScreen(mid(g.paths[at].a, g.paths[at].b)) : fit.toScreen(g.spots[at].at);
}

/** The legal place nearest a tap, or null if the tap is too far from all of them. */
export function pickPlace(fit: Fit, g: Geometry, kind: BuildKind, legal: number[], p: Point): number | null {
  let best: number | null = null;
  let bestDist = PICK_REACH * fit.scale;
  for (const at of legal) {
    const s = placeAt(fit, g, kind, at);
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < bestDist) {
      best = at;
      bestDist = d;
    }
  }
  return best;
}

function drawRoad(ctx: Ctx, fit: Fit, a: Point, b: Point, color: string, alpha = 1) {
  const s = fit.toScreen(a);
  const e = fit.toScreen(b);
  // Stop short of the corners, where settlements sit.
  const k = 0.17;
  const from = { x: s.x + (e.x - s.x) * k, y: s.y + (e.y - s.y) * k };
  const to = { x: e.x + (s.x - e.x) * k, y: e.y + (s.y - e.y) * k };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = fit.scale * 0.17;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = fit.scale * 0.11;
  ctx.stroke();
  ctx.restore();
}

function drawBuilding(ctx: Ctx, fit: Fit, at: Point, kind: 'settlement' | 'city', color: string, angle: number, alpha = 1) {
  const p = fit.toScreen(at);
  const u = fit.scale * 0.032;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.beginPath();
  if (kind === 'settlement') {
    // A small house with a pitched roof.
    ctx.moveTo(-7 * u, 6 * u);
    ctx.lineTo(-7 * u, -2 * u);
    ctx.lineTo(0, -9 * u);
    ctx.lineTo(7 * u, -2 * u);
    ctx.lineTo(7 * u, 6 * u);
  } else {
    // A hall with a taller tower on the left.
    ctx.moveTo(-11 * u, 7 * u);
    ctx.lineTo(-11 * u, -6 * u);
    ctx.lineTo(-5.5 * u, -12 * u);
    ctx.lineTo(0, -6 * u);
    ctx.lineTo(0, -1 * u);
    ctx.lineTo(11 * u, -1 * u);
    ctx.lineTo(11 * u, 7 * u);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.2 * u;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
}

function drawHints(ctx: Ctx, fit: Fit, v: PiecesView, pending: NonNullable<PiecesView['pending']>) {
  const g = v.geometry;
  const grow = 0.75 + 0.25 * Math.sin(v.pulse * Math.PI * 2);
  ctx.save();
  for (const at of pending.legal) {
    if (at === pending.at) continue;
    if (pending.kind === 'road') {
      drawRoad(ctx, fit, g.paths[at].a, g.paths[at].b, pending.color, 0.3 + 0.25 * grow);
      continue;
    }
    const p = fit.toScreen(g.spots[at].at);
    ctx.beginPath();
    ctx.arc(p.x, p.y, fit.scale * 0.13 * grow, 0, Math.PI * 2);
    ctx.fillStyle = pending.color;
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2, fit.scale * 0.025);
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPieces(ctx: Ctx, fit: Fit, v: PiecesView, angle: number) {
  const g = v.geometry;
  v.roads.forEach((seat, p) => seat !== null && drawRoad(ctx, fit, g.paths[p].a, g.paths[p].b, v.colors[seat]));
  if (v.pending) drawHints(ctx, fit, v, v.pending);
  v.buildings.forEach((b, s) => b && drawBuilding(ctx, fit, g.spots[s].at, b.kind, v.colors[b.seat], angle));

  // The piece waiting for ✓, drawn see-through where it would go.
  const p = v.pending;
  if (p && p.at !== null) {
    if (p.kind === 'road') drawRoad(ctx, fit, g.paths[p.at].a, g.paths[p.at].b, p.color, 0.85);
    else drawBuilding(ctx, fit, g.spots[p.at].at, p.kind, p.color, angle, 0.85);
    const at = placeAt(fit, g, p.kind, p.at);
    ctx.save();
    ctx.setLineDash([fit.scale * 0.05, fit.scale * 0.04]);
    ctx.lineWidth = Math.max(2, fit.scale * 0.02);
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(at.x, at.y, fit.scale * 0.26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
