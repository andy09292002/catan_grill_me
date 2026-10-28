import { generateBoard, type Board, type RandomMode } from './board/generate';
import type { BoardSize } from './board/layout';
import { randomSeed } from './board/rng';
import { drawBoard } from './render/draw';
import { registerSW } from 'virtual:pwa-register';

// Caches the app for offline use and picks up new versions on the next launch.
registerSW({ immediate: true });

// Milestone 1 keeps settings in the URL (?size=30&mode=balancedPlus&seed=123) so any
// board can be reproduced. Milestone 3 replaces this with the New game screen and saving.

const MODES: RandomMode[] = ['random', 'balanced', 'balancedPlus'];
const MODE_LABELS: Record<RandomMode, string> = {
  random: 'Purely random',
  balanced: 'Balanced',
  balancedPlus: 'Balanced+',
};

interface Settings {
  size: BoardSize;
  mode: RandomMode;
  seed: number;
}

function readSettings(): Settings {
  const params = new URLSearchParams(location.search);
  const size = params.get('size') === '30' ? 30 : 19;
  const mode = MODES.find((m) => m === params.get('mode')) ?? 'balanced';
  const seed = Number(params.get('seed'));
  return { size, mode, seed: Number.isInteger(seed) && seed > 0 ? seed : randomSeed() };
}

function writeSettings({ size, mode, seed }: Settings) {
  const params = new URLSearchParams({ size: String(size), mode, seed: String(seed) });
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
const ctx = canvas.getContext('2d')!;
const modeLabel = document.querySelector('#mode-label')!;
const sizeLabel = document.querySelector('#size-label')!;

let settings = readSettings();
let board: Board = generateBoard(settings);

function render() {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoard(ctx, board, width, height);
  modeLabel.textContent = MODE_LABELS[settings.mode];
  sizeLabel.textContent = `${settings.size} hexes`;
}

function regenerate(next: Partial<Settings>) {
  settings = { ...settings, seed: randomSeed(), ...next };
  board = generateBoard(settings);
  writeSettings(settings);
  render();
}

document.querySelector('#new-board')!.addEventListener('click', () => regenerate({}));
document.querySelector('#mode')!.addEventListener('click', () =>
  regenerate({ mode: MODES[(MODES.indexOf(settings.mode) + 1) % MODES.length] }),
);
document.querySelector('#size')!.addEventListener('click', () => regenerate({ size: settings.size === 19 ? 30 : 19 }));

// The board ignores touch; only the corner controls respond.
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

window.addEventListener('resize', render);
writeSettings(settings);
render();
