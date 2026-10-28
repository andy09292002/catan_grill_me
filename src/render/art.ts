import type { HarborKind, Terrain } from '../board/generate';

export const TERRAIN_NAMES: Record<Terrain, string> = {
  forest: 'Forest',
  field: 'Field',
  hills: 'Hills',
  pasture: 'Pasture',
  mountain: 'Mountain',
  desert: 'Desert',
};

/** Light and dark stops of each terrain's radial gradient. */
export const TERRAIN_COLORS: Record<Terrain, [string, string]> = {
  forest: ['#3f8f3a', '#1f5a22'],
  field: ['#f2d15a', '#c89b1f'],
  hills: ['#d8743c', '#9c4320'],
  pasture: ['#9fdc6a', '#5ea33a'],
  mountain: ['#a3a7b5', '#5f6473'],
  desert: ['#ecd9a6', '#c9ad6e'],
};

export const COLORS = {
  backgroundInner: '#1d3b5c',
  backgroundOuter: '#0a1626',
  sea: '#2a7fb8',
  seaDeep: '#1b5f93',
  beach: '#e9d8a6',
  tileEdge: '#2b2418',
  token: '#f4e7c5',
  tokenEdge: '#8a6d3b',
  tokenText: '#2a2118',
  tokenRed: '#c8231b',
  pier: '#7a5530',
  dim: 'rgba(5, 12, 22, 0.45)',
  litRing: '#fff6b0',
  litGlow: 'rgba(255, 220, 90, 0.95)',
  tokenLit: '#fff6c8',
  tokenLitEdge: '#e0a800',
  blocked: '#e0241a',
  blockedFill: 'rgba(255, 245, 240, 0.82)',
  thief: '#2b2d33',
  thiefEdge: '#c9ccd6',
};

type Ctx = CanvasRenderingContext2D;

function poly(ctx: Ctx, pts: [number, number][], fill: string) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Draws a small terrain icon centred on (x, y). `f` scales the icon; at f = 1 it is about 50px wide.
 */
export function drawIcon(ctx: Ctx, terrain: Terrain, x: number, y: number, f: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f, f);
  ctx.lineCap = 'round';
  switch (terrain) {
    case 'forest':
      ctx.fillStyle = '#5b3a1e';
      ctx.fillRect(-3, 8, 6, 9);
      poly(ctx, [[0, -18], [-14, 10], [14, 10]], '#174a1a');
      poly(ctx, [[0, -24], [-10, -2], [10, -2]], '#226b25');
      break;
    case 'field':
      for (const dx of [-8, 0, 8]) {
        ctx.strokeStyle = '#8a6512';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dx, 16);
        ctx.lineTo(dx, -10);
        ctx.stroke();
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.ellipse(dx, -14 + k * 6, 3, 4.5, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#fff1a8';
          ctx.fill();
          ctx.strokeStyle = '#a07a18';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      break;
    case 'hills':
      for (const [bx, by] of [[-14, 2], [2, 2], [-6, -10]]) {
        ctx.fillStyle = '#b8492a';
        ctx.strokeStyle = '#6e2412';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, 14, 10, 1.5);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'pasture':
      ctx.fillStyle = '#333';
      ctx.fillRect(-8.5, 6, 3, 10);
      ctx.fillRect(5.5, 6, 3, 10);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2);
      ctx.moveTo(0, -6);
      ctx.arc(-6, -6, 6, 0, Math.PI * 2);
      ctx.moveTo(12, -6);
      ctx.arc(6, -6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.ellipse(15, -3, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mountain':
      poly(ctx, [[-20, 14], [-2, -18], [16, 14]], '#4d5160');
      poly(ctx, [[-8, -7], [-2, -18], [4, -7], [0, -9]], '#ffffff');
      poly(ctx, [[2, 14], [14, -6], [26, 14]], '#6b7080');
      break;
    case 'desert':
      ctx.strokeStyle = '#b8975a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-24, 10);
      ctx.quadraticCurveTo(-8, -8, 8, 10);
      ctx.moveTo(-4, 14);
      ctx.quadraticCurveTo(12, 0, 26, 14);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

export function harborLabel(kind: HarborKind): string {
  return kind === 'generic' ? '3:1' : '2:1';
}
