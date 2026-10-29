import { rollCounts, type GameState } from '../game/state';

// How often each total has come up this game, against how often fair dice would roll it.

const SVG = 'http://www.w3.org/2000/svg';
const W = 220;
const H = 150;
const TOP = 22;
const BASE = 128;
const SLOT = W / 11;

/** Ways two dice can make each total, out of 36. */
export function ways(total: number): number {
  return 6 - Math.abs(total - 7);
}

/** Bars for each total from 2 to 12, with a line where fair dice would put them. */
export function renderRollChart(container: HTMLElement, game: GameState) {
  const counts = rollCounts(game);
  const rolls = game.history.length;
  const expected = (n: number) => (rolls * ways(n)) / 36;
  const peak = Math.max(1, ...counts.values(), expected(7));
  const y = (v: number) => BASE - (v / peak) * (BASE - TOP);
  const x = (n: number) => (n - 2 + 0.5) * SLOT;

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Rolls so far: ${[...counts].map(([n, c]) => `${n}: ${c}`).join(', ')}`);
  const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    svg.append(node);
    return node;
  };

  add('text', { x: 2, y: 13, class: 'rc-title' }, rolls ? `${rolls} roll${rolls === 1 ? '' : 's'}` : 'No rolls yet');
  for (const [n, c] of counts) {
    const hot = n === 6 || n === 8;
    if (c) add('rect', { x: x(n) - SLOT * 0.36, y: y(c), width: SLOT * 0.72, height: BASE - y(c), rx: 2, class: `rc-bar${hot ? ' hot' : ''}${n === 7 ? ' seven' : ''}` });
    if (c) add('text', { x: x(n), y: y(c) - 3, class: 'rc-count' }, String(c));
    add('text', { x: x(n), y: H - 6, class: `rc-label${hot ? ' hot' : ''}` }, String(n));
  }
  add('line', { x1: 0, x2: W, y1: BASE, y2: BASE, class: 'rc-axis' });
  if (rolls) {
    const points = [...counts.keys()].map((n) => `${x(n).toFixed(1)},${y(expected(n)).toFixed(1)}`).join(' ');
    add('polyline', { points, class: 'rc-fair' });
  }
  container.replaceChildren(svg);
}
