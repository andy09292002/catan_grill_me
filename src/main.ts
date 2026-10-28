import { restoreBoard, type Board, type RandomMode } from './board/generate';
import { rollDice, THIEF_NUMBER } from './game/dice';
import { PLAYER_HEX, PLAYER_NAMES, defaultColors, seatDirection } from './game/players';
import {
  createGame,
  currentAngle,
  moveThief,
  nextTurn,
  production,
  recordRoll,
  type GameState,
  type NewGameOptions,
  type Roll,
  type ThiefStyle,
} from './game/state';
import { loadGame, saveGame } from './game/storage';
import { drawBoard } from './render/draw';
import { fitBoard, pickTile } from './render/fit';
import { showBanner, TUMBLE_MS, type BannerHandle } from './ui/banner';
import { confirmDialog } from './ui/confirm';
import { openPad } from './ui/pad';
import { FIRST_LAUNCH_DEFAULTS, openSetup } from './ui/setup';
import { registerSW } from 'virtual:pwa-register';

// Caches the app for offline use and picks up new versions on the next launch.
registerSW({ immediate: true });

const FLASH_MS = 3000;
const FLASH_PERIOD_MS = 375;
const TURN_MS = 500;
const THIEF_PULSE_MS = 1200;

const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
const ctx = canvas.getContext('2d')!;
const root = document.documentElement;

let game: GameState | null = null;
let board: Board | null = null;
/** Whether the game came from the URL (screenshots, shared boards) and so is never saved. */
let ephemeral = false;

// Text angle keeps growing turn after turn so it always turns forwards, never back the long way.
let angle = 0;
let angleFrom = 0;
let angleTo = 0;
let angleStart = -Infinity;
let flashStart = -Infinity;
let rolling = false;
let frame = 0;
/** Set while players choose where the on-screen thief goes; the board only takes taps then. */
let choosingThief: BannerHandle | null = null;

function setGame(next: GameState, opts: { resetAngle?: boolean } = {}) {
  const boardChanged = !game || game.board !== next.board;
  game = next;
  if (boardChanged) board = restoreBoard(next.board);
  if (opts.resetAngle) {
    angle = angleFrom = angleTo = currentAngle(next);
    angleStart = -Infinity;
  }
  if (!ephemeral) saveGame(next);
  updateControls();
  requestRender();
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function requestRender() {
  if (!frame) frame = requestAnimationFrame(render);
}

function render(now: number) {
  frame = 0;
  if (!game || !board) return;

  const t = Math.min(1, (now - angleStart) / TURN_MS);
  angle = angleFrom + (angleTo - angleFrom) * easeInOut(t);
  const flashing = now - flashStart < FLASH_MS;

  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const total = game.lastRoll?.total ?? null;
  drawBoard(ctx, board, width, height, {
    textAngle: angle,
    highlight: total === null || total === THIEF_NUMBER || rolling ? null : production(game, total),
    flashOn: !flashing || Math.floor((now - flashStart) / FLASH_PERIOD_MS) % 2 === 0,
    glow: { color: PLAYER_HEX[game.colors[game.current]], angle },
    thief:
      game.thiefTile === null
        ? null
        : { tile: game.thiefTile, choosing: !!choosingThief, pulse: choosingThief ? (now % THIEF_PULSE_MS) / THIEF_PULSE_MS : 0 },
  });

  if (t < 1 || flashing || choosingThief) requestRender();
}

function updateControls() {
  if (!game) return;
  root.style.setProperty('--text-angle', `${angleTo}deg`);

  const color = game.colors[game.current];
  const dot = document.querySelector<HTMLElement>('#turn-dot')!;
  dot.style.background = PLAYER_HEX[color];
  document.querySelector('#next-turn')!.setAttribute('aria-label', `Next turn. Now playing: ${PLAYER_NAMES[color]}`);
  document.querySelector<HTMLElement>('#next-turn')!.style.setProperty('--player', PLAYER_HEX[color]);
  document.querySelector<HTMLElement>('#move-thief')!.hidden = game.thiefStyle !== 'onscreen';

  // While the dice tumble, the corner still shows the previous roll so it doesn't give the result away.
  const skip = rolling ? 1 : 0;
  const last = game.history[skip];
  const lastEl = document.querySelector<HTMLElement>('#last-roll')!;
  lastEl.textContent = last ? String(last.total) : '–';
  lastEl.classList.toggle('red', !!last && (last.total === 6 || last.total === 8));
  const recent = document.querySelector('#recent')!;
  recent.replaceChildren(
    ...game.history.slice(skip + 1, skip + 9).map((r) => {
      const chip = document.createElement('span');
      chip.className = `chip${r.total === 6 || r.total === 8 ? ' red' : ''}`;
      chip.textContent = String(r.total);
      return chip;
    }),
  );
}

/** Banner placement: from the screen centre towards the current player's side, turned to face them. */
function bannerPlacement() {
  const d = seatDirection(angleTo);
  const reach = Math.min(window.innerWidth, window.innerHeight) * 0.24;
  return { offset: { x: d.x * reach, y: d.y * reach }, angle: angleTo };
}

/** Starts "move thief" mode: the banner stays up with Cancel until a tile is tapped. */
function startChoosingThief(roll: Roll | null) {
  stopChoosingThief();
  choosingThief = showBanner(bannerPlacement(), roll, {
    caption: 'Tap a tile to move the thief',
    action: { label: 'Cancel', onClick: stopChoosingThief },
  });
  requestRender();
}

function stopChoosingThief() {
  choosingThief?.close();
  choosingThief = null;
  requestRender();
}

function onBoardTap(e: PointerEvent) {
  if (!game || !board || !choosingThief || rolling) return;
  const fit = fitBoard(board.layout, window.innerWidth, window.innerHeight);
  const tile = pickTile(board.layout, fit, { x: e.clientX, y: e.clientY });
  if (tile === null || tile === game.thiefTile) return;
  setGame(moveThief(game, tile));
  stopChoosingThief();
}

function applyRoll(roll: Roll) {
  if (!game) return;
  stopChoosingThief();
  setGame(recordRoll(game, roll));
  if (roll.total === THIEF_NUMBER && game.thiefStyle === 'onscreen') startChoosingThief(roll);
  else showBanner(bannerPlacement(), roll);
  if (roll.dice) {
    // Keep the result hidden on the board until the dice stop tumbling.
    rolling = true;
    updateControls();
    requestRender();
    window.setTimeout(() => {
      rolling = false;
      flashStart = performance.now();
      updateControls();
      requestRender();
    }, TUMBLE_MS);
  } else {
    flashStart = performance.now();
    requestRender();
  }
}

function roll() {
  if (!game || rolling) return;
  const dice = rollDice();
  applyRoll({ total: dice[0] + dice[1], dice });
}

async function enterRoll() {
  if (!game || rolling) return;
  const total = await openPad();
  if (total !== null) applyRoll({ total, dice: null });
}

function advanceTurn() {
  if (!game) return;
  stopChoosingThief();
  angleFrom = angle;
  angleTo += 360 / game.colors.length;
  angleStart = performance.now();
  setGame(nextTurn(game));
}

async function newGame(firstLaunch = false) {
  const defaults = game
    ? { colors: game.colors, size: game.board.size, mode: game.board.mode, thiefStyle: game.thiefStyle }
    : FIRST_LAUNCH_DEFAULTS;
  const options = await openSetup(defaults, !firstLaunch);
  if (!options) return;
  if (game && !(await confirmDialog('Replace the current board?', 'The board, turn and roll history of the game in progress will be lost.', 'Replace', 'Keep current board'))) return;
  startGame(options);
}

function startGame(options: NewGameOptions) {
  // A real game replaces any board opened from the URL, so drop the URL settings too.
  if (ephemeral) history.replaceState(null, '', location.pathname);
  ephemeral = false;
  stopChoosingThief();
  game = null;
  setGame(createGame(options), { resetAngle: true });
}

/** ?size=30&mode=balancedPlus&seed=123&players=3&thief=physical opens a fixed board without touching the saved game. */
function gameFromUrl(): GameState | null {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed'));
  if (!Number.isInteger(seed) || seed <= 0) return null;
  const players = Math.min(6, Math.max(2, Number(params.get('players')) || 4));
  const mode = (['random', 'balanced', 'balancedPlus'] as RandomMode[]).find((m) => m === params.get('mode')) ?? 'balanced';
  const size = params.get('size') === '30' ? 30 : 19;
  const thiefStyle: ThiefStyle = params.get('thief') === 'physical' ? 'physical' : 'onscreen';
  return createGame({ colors: defaultColors(players), firstSeat: 0, size, mode, seed, thiefStyle });
}

document.querySelector('#roll')!.addEventListener('click', roll);
document.querySelector('#pad-open')!.addEventListener('click', enterRoll);
document.querySelector('#next-turn')!.addEventListener('click', advanceTurn);
document.querySelector('#new-game')!.addEventListener('click', () => newGame());
document.querySelector('#move-thief')!.addEventListener('click', () => (choosingThief ? stopChoosingThief() : startChoosingThief(null)));

// Keyboard shortcuts for testing on a PC: R roll, N next turn.
window.addEventListener('keydown', (e) => {
  if (document.querySelector('.overlay') || e.repeat) return;
  if (e.key === 'r' || e.key === 'R') roll();
  if (e.key === 'n' || e.key === 'N') advanceTurn();
});

// The board ignores touch except while choosing where the on-screen thief goes.
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('pointerdown', onBoardTap);

// Read-only view of the game for the screenshot script.
declare global {
  interface Window {
    hexBoard?: { readonly game: GameState | null };
  }
}
window.hexBoard = {
  get game() {
    return game;
  },
};
window.addEventListener('resize', requestRender);

const fromUrl = gameFromUrl();
if (fromUrl) {
  ephemeral = true;
  setGame(fromUrl, { resetAngle: true });
} else {
  const saved = loadGame();
  if (saved) setGame(saved, { resetAngle: true });
  else void newGame(true);
}
