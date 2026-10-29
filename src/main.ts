import { restoreBoard, type Board, type RandomMode } from './board/generate';
import { rollDice, THIEF_NUMBER } from './game/dice';
import { PLAYER_HEX, PLAYER_NAMES, defaultColors, seatAngle, seatDirection } from './game/players';
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
import { loadPrefs, savePrefs, type AnimationLevel } from './game/prefs';
import { loadGame, saveGame } from './game/storage';
import { drawBase, drawLive } from './render/draw';
import { fitBoard, pickTile, type Fit } from './render/fit';
import { FrameBudget } from './render/perf';
import { pickPlace, placeAt, type PiecesView } from './render/pieces';
import { geometryOf, type BuildKind } from './rules/engine';
import { showBanner, TUMBLE_MS, type BannerHandle } from './ui/banner';
import { confirmDialog } from './ui/confirm';
import { openPad } from './ui/pad';
import { showFinish, type FinishHandle } from './ui/finish';
import { showLobby, showRejoin, type LobbyHandle } from './ui/lobby';
import { placeAtEdge, renderSeatBadges } from './ui/seats';
import { FIRST_LAUNCH_DEFAULTS, openSetup, type PlayMode } from './ui/setup';
import type { BoardView, ServerMessage } from './net/protocol';
import { openSocket, tableAvailable, type TableSocket } from './net/socket';
import { registerSW } from 'virtual:pwa-register';

// Caches the app for offline use and picks up new versions on the next launch.
registerSW({ immediate: true });

const FLASH_MS = 3000;
const FLASH_PERIOD_MS = 375;
const TURN_MS = 500;
const THIEF_PULSE_MS = 1200;
const HINT_PULSE_MS = 1400;
/** Calm only sways slowly, so it redraws at about 30 fps to save power. */
const CALM_FRAME_MS = 33;
/** Full animation drops to Calm if frames average longer than this to draw. */
const FRAME_BUDGET_MS = 14;

const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
const ctx = canvas.getContext('2d')!;
const root = document.documentElement;

let game: GameState | null = null;
let board: Board | null = null;
/** Whether the game came from the URL (screenshots, shared boards) and so is never saved. */
let ephemeral = false;

/** The connection to the table server, when this page was opened from it. */
let table: TableSocket | null = null;
/** The table server's game while playing Board + phones; null in Board only. The server saves it, not this page. */
let remote: BoardView | null = null;
let lobby: LobbyHandle | null = null;
let finishScreen: FinishHandle | null = null;
/** Whether the first word from the table server has arrived, deciding which game to show. */
let decided = false;
let lastPlay: PlayMode = 'board';

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
/** With phones: which step of a 7 the note at the roller's edge shows. */
let robberKey = '';

let prefs = loadPrefs();
/** Lowered for this session if the device can't keep up with Full; the saved preference stays. */
let slowDevice = false;
const frameBudget = new FrameBudget(FRAME_BUDGET_MS, 90);
let lastDraw = -Infinity;
/** Recent draw times, for the screenshot script and for checking speed on a real device. */
const drawTimes: number[] = [];

// The parts of the board that don't move are drawn once into an offscreen canvas.
const baseCanvas = document.createElement('canvas');
const baseCtx = baseCanvas.getContext('2d')!;
let baseKey = '';
let baseBoard: Board | null = null;
let baseFit: Fit | null = null;

function animationLevel(): AnimationLevel {
  return slowDevice && prefs.animation === 'full' ? 'calm' : prefs.animation;
}

function setAnimation(level: AnimationLevel) {
  prefs = { ...prefs, animation: level };
  savePrefs(prefs);
  slowDevice = false;
  frameBudget.reset();
  requestRender();
}

function setGame(next: GameState, opts: { resetAngle?: boolean } = {}) {
  const boardChanged = !game || game.board !== next.board;
  game = next;
  if (boardChanged) board = restoreBoard(next.board);
  if (opts.resetAngle) {
    angle = angleFrom = angleTo = currentAngle(next);
    angleStart = -Infinity;
  }
  if (!ephemeral && !remote) saveGame(next);
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

  const level = animationLevel();
  const robber = remote?.started ? remote.rules.robber : null;
  const busy = t < 1 || flashing || !!choosingThief || !!remote?.rules.pending || !!robber;
  // Calm skips frames unless something else on the board is moving.
  if (level === 'calm' && !busy && now - lastDraw < CALM_FRAME_MS) {
    requestRender();
    return;
  }
  lastDraw = now;
  const started = performance.now();

  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pw = Math.round(width * dpr);
  const ph = Math.round(height * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }

  const key = `${pw}x${ph}@${dpr}`;
  if (key !== baseKey || baseBoard !== board || !baseFit) {
    baseCanvas.width = pw;
    baseCanvas.height = ph;
    baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baseFit = drawBase(baseCtx, board, width, height);
    baseKey = key;
    baseBoard = board;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const total = game.lastRoll?.total ?? null;
  drawLive(ctx, board, baseFit, width, height, {
    textAngle: angle,
    highlight: total === null || total === THIEF_NUMBER || rolling ? null : production(game, total),
    flashOn: !flashing || Math.floor((now - flashStart) / FLASH_PERIOD_MS) % 2 === 0,
    glow: { color: PLAYER_HEX[game.colors[game.current]], angle },
    thief:
      game.thiefTile === null
        ? null
        : (() => {
            // With phones, the thief shows where it was tapped until ✓ moves it.
            const choosing = !!choosingThief || robber?.stage === 'move';
            return { tile: robber?.tile ?? game.thiefTile, choosing, pulse: choosing ? (now % THIEF_PULSE_MS) / THIEF_PULSE_MS : 0 };
          })(),
    animation: { t: now / 1000, level },
    pieces: piecesView(now),
  });

  const drawMs = performance.now() - started;
  drawTimes.push(drawMs);
  if (drawTimes.length > 120) drawTimes.shift();
  if (level === 'full' && frameBudget.record(drawMs)) {
    slowDevice = true;
    showToast('Animation eased to Calm to keep the board smooth');
  }
  if (busy || level !== 'off') requestRender();
}

function piecesView(now: number): PiecesView | null {
  if (!remote || !game) return null;
  const colors = game.colors.map((c) => PLAYER_HEX[c]);
  const p = remote.rules.pending;
  return {
    geometry: geometryOf(remote.game),
    buildings: remote.rules.buildings,
    roads: remote.rules.roads,
    colors,
    pending: p && { kind: p.kind, legal: p.legal, at: p.at, color: colors[p.seat] },
    pulse: (now % HINT_PULSE_MS) / HINT_PULSE_MS,
  };
}

/** ✓ and ✗ beside a piece (or the thief) waiting to be placed, turned to face its player. */
function updateBuildConfirm() {
  const box = document.querySelector<HTMLElement>('#build-confirm')!;
  const p = remote?.started ? remote.rules.pending : null;
  const thiefTile = remote?.started && remote.rules.robber?.stage === 'move' ? remote.rules.robber.tile : null;
  if ((!p || p.at === null) && thiefTile === null) {
    box.hidden = true;
    return;
  }
  if (!board) return;
  const fit = fitBoard(board.layout, window.innerWidth, window.innerHeight);
  const at = p && p.at !== null ? placeAt(fit, geometryOf(remote!.game), p.kind, p.at) : fit.toScreen(board.layout.centers[thiefTile!]);
  // Just past the piece on its player's side, so a hand reaching in doesn't cover the piece.
  const d = seatDirection(angleTo);
  const reach = fit.scale * 0.62;
  box.hidden = false;
  box.style.left = `${at.x + d.x * reach}px`;
  box.style.top = `${at.y + d.y * reach}px`;
  box.style.transform = `translate(-50%, -50%) rotate(${angleTo}deg)`;
}

function showToast(message: string) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.classList.add('leaving'), 3500);
  window.setTimeout(() => toast.remove(), 4000);
}

function updateControls() {
  if (!game) return;
  root.style.setProperty('--text-angle', `${angleTo}deg`);

  const color = game.colors[game.current];
  const dot = document.querySelector<HTMLElement>('#turn-dot')!;
  dot.style.background = PLAYER_HEX[color];
  document.querySelector('#next-turn')!.setAttribute('aria-label', `Next turn. Now playing: ${PLAYER_NAMES[color]}`);
  document.querySelector<HTMLElement>('#next-turn')!.style.setProperty('--player', PLAYER_HEX[color]);
  // With phones the thief only moves after a 7, so the free Thief button goes.
  document.querySelector<HTMLElement>('#move-thief')!.hidden = game.thiefStyle !== 'onscreen' || !!remote;

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
  if (!game || !board || rolling) return;
  const fit = fitBoard(board.layout, window.innerWidth, window.innerHeight);
  const pending = remote?.started ? remote.rules.pending : null;
  if (remote?.started && remote.rules.robber?.stage === 'move') {
    const tile = pickTile(board.layout, fit, { x: e.clientX, y: e.clientY });
    if (tile !== null && tile !== game.thiefTile) table!.send({ type: 'act', action: { type: 'moveThief', tile } });
    return;
  }
  if (pending) {
    const at = pickPlace(fit, geometryOf(remote!.game), pending.kind, pending.legal, { x: e.clientX, y: e.clientY });
    if (at !== null) table!.send({ type: 'act', action: { type: 'pick', at } });
    return;
  }
  if (!choosingThief) return;
  const tile = pickTile(board.layout, fit, { x: e.clientX, y: e.clientY });
  if (tile === null || tile === game.thiefTile) return;
  if (remote) table!.send({ type: 'act', action: { type: 'moveThief', tile } });
  else setGame(moveThief(game, tile));
  stopChoosingThief();
}

function applyRoll(roll: Roll) {
  if (!game) return;
  if (remote) {
    table!.send({ type: 'act', action: roll.dice ? { type: 'roll' } : { type: 'enterRoll', total: roll.total } });
    return;
  }
  stopChoosingThief();
  setGame(recordRoll(game, roll));
  showRoll(roll);
}

/** The banner, dice and flashing tiles for a roll that's already in the game. */
function showRoll(roll: Roll) {
  if (!game) return;
  if (remote && roll.total === THIEF_NUMBER) {
    // The dice show as usual; the note at the roller's edge then follows the 7 step by step.
    showBanner(bannerPlacement(), roll);
    robberKey = '';
    syncRobber();
  } else if (roll.total === THIEF_NUMBER && game.thiefStyle === 'onscreen') startChoosingThief(roll);
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
  if (remote) {
    table!.send({ type: 'act', action: { type: 'endTurn' } });
    return;
  }
  turnTowardsNext(game.colors.length);
  setGame(nextTurn(game));
}

function turnTowardsNext(players: number) {
  angleFrom = angle;
  angleTo += 360 / players;
  angleStart = performance.now();
}

/** Turns the text the short way round to face `seat`; setup goes back round the table, so it isn't always forwards. */
function turnTowards(seat: number, players: number) {
  const delta = ((((seatAngle(seat, players) - angleTo) % 360) + 540) % 360) - 180;
  if (Math.abs(delta) < 0.01) return;
  angleFrom = angle;
  angleTo += delta;
  angleStart = performance.now();
}

/** `rematch` keeps every phone in its seat when the players are the same. */
async function newGame(firstLaunch = false, rematch = false) {
  const defaults = game
    ? { colors: game.colors, size: game.board.size, mode: game.board.mode, thiefStyle: game.thiefStyle }
    : FIRST_LAUNCH_DEFAULTS;
  const result = await openSetup(defaults, !firstLaunch, { level: prefs.animation, onChange: setAnimation }, { available: !!table, play: lastPlay });
  if (!result) return;
  // A finished game needs no asking.
  const over = remote?.rules.winner !== null && remote?.rules.winner !== undefined;
  if (game && !over && !(await confirmDialog('Replace the current board?', 'The board, turn and roll history of the game in progress will be lost.', 'Replace', 'Keep current board'))) return;
  lastPlay = result.play;
  if (result.play === 'phones') {
    // The table server makes the game and sends it back; phones join from the lobby.
    table!.send({ type: 'create', options: result.options, rematch });
    return;
  }
  if (remote) leaveTable();
  startGame(result.options);
}

/** Back to Board only: the table server forgets its game and the phones are let go. */
function leaveTable() {
  remote = null;
  lobby?.close();
  lobby = null;
  table?.send({ type: 'close' });
  renderBadges();
}

/** Shows the Board only game saved on this PC, or the New game screen if there is none. */
function startLocal() {
  const saved = loadGame();
  if (saved) {
    game = null;
    setGame(saved, { resetAngle: true });
  } else void newGame(true);
}

function onServer(msg: ServerMessage) {
  if (msg.type === 'noTable') {
    lobby?.close();
    lobby = null;
    if (remote || !decided) {
      decided = true;
      remote = null;
      renderBadges();
      startLocal();
    }
    return;
  }
  if (msg.type === 'error') {
    showToast(msg.message);
    return;
  }
  if (msg.type === 'rejoinCode') {
    if (remote) void showRejoin(remote.seats[msg.seat].color, msg.url);
    return;
  }
  if (msg.type !== 'board') return;

  decided = true;
  const { view, event } = msg;
  const fresh = !remote || remote.id !== view.id;
  remote = view;
  if (fresh) {
    stopChoosingThief();
    game = null;
    setGame(view.game, { resetAngle: true });
  } else if (event?.kind === 'roll') {
    stopChoosingThief();
    setGame(view.game);
    showRoll(event.roll);
  } else if (event?.kind === 'turn') {
    stopChoosingThief();
    turnTowards(view.game.current, view.game.colors.length);
    setGame(view.game);
  } else {
    setGame(view.game);
  }

  if (!view.started) {
    if (lobby) lobby.update(view);
    else lobby = showLobby(view, { onStart: () => table?.send({ type: 'start' }), onCancel: () => table?.send({ type: 'close' }) });
  } else if (lobby) {
    lobby.close();
    lobby = null;
  }
  syncRobber();
  syncFinish();
  renderBadges();
}

/** Shows the end screen once someone has won, and takes it away when a new game starts. */
function syncFinish() {
  const won = remote?.started && remote.rules.winner !== null;
  if (won && !finishScreen) {
    finishScreen = showFinish(remote!, {
      onRematch: () => {
        closeFinish();
        // If the New game screen is cancelled, the end screen comes back.
        void newGame(false, true).then(syncFinish);
      },
      onNewGame: () => {
        closeFinish();
        void newGame().then(syncFinish);
      },
    });
  } else if (!won) closeFinish();
}

function closeFinish() {
  finishScreen?.close();
  finishScreen = null;
}

/**
 * Keeps the note at the current player's edge in step with a 7 (who still has to discard,
 * then the move and the steal) or a special build phase. It sits at the edge so it never
 * covers the tiles being chosen.
 */
function syncRobber() {
  const note = document.querySelector<HTMLElement>('#robber-note')!;
  const rb = remote?.started ? remote.rules.robber : null;
  const special = remote?.started && !rb ? remote.rules.special : null;
  const key = rb ? `${rb.stage}:${rb.owed.join()}:${rb.victim}:${angleTo}` : special ? `special:${remote!.game.current}:${angleTo}` : '';
  if (key === robberKey) return;
  robberKey = key;
  note.hidden = !rb && !special;
  if ((!rb && !special) || !remote || !game) return;
  const name = (seat: number) => PLAYER_NAMES[game!.colors[seat]];
  const roller = name(remote.game.current);
  if (rb) {
    const captions = {
      discard: `Discard on your phones: ${rb.owed.flatMap((n, s) => (n > 0 ? [`${name(s)} ${n}`] : [])).join(' · ')}`,
      move: `${roller}: tap a tile to move the thief, then ✓`,
      choose: `${roller} is choosing whom to rob`,
      steal: `${roller} is taking a card from ${rb.victim === null ? '' : name(rb.victim)}`,
    };
    note.textContent = captions[rb.stage];
  } else {
    note.textContent = `Special build after ${name(special!.turnOf)}'s turn: ${roller} may build or buy a card`;
  }
  note.style.transform = `translate(-50%, -50%) rotate(${angleTo}deg)`;
  // Just inside the player's own panel.
  placeAtEdge(note, angleTo, 56);
}

function renderBadges() {
  const r = remote?.rules;
  const stats = r
    ? remote!.seats.map((_, s) => ({
        points: r.points[s],
        cards: r.cards[s],
        devCards: r.devCards[s],
        knights: r.knights[s],
        longestRoad: r.longestRoad === s,
        largestArmy: r.largestArmy === s,
      }))
    : [];
  renderSeatBadges(document.querySelector('#seat-badges')!, remote?.started ? remote.seats : null, stats, (seat) => table?.send({ type: 'rejoinCode', seat }));
  updateBuildConfirm();
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
document.querySelector('#build-yes')!.addEventListener('click', () => table?.send({ type: 'act', action: { type: 'confirm' } }));
document.querySelector('#build-no')!.addEventListener('click', () => table?.send({ type: 'act', action: { type: 'cancel' } }));
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
    hexBoard?: {
      readonly game: GameState | null;
      readonly remote: BoardView | null;
      /** Where a spot (or a path, for a road) is on screen, for scripts that tap the board. */
      placeOnScreen(kind: BuildKind, at: number): { x: number; y: number } | null;
      /** A tile's centre on screen, and the tiles next to a seat's buildings, for scripts that move the thief. */
      tileOnScreen(tile: number): { x: number; y: number } | null;
      tilesTouching(seat: number): number[];
      readonly stats: { level: AnimationLevel; slowDevice: boolean; averageDrawMs: number };
    };
  }
}
window.hexBoard = {
  get game() {
    return game;
  },
  get remote() {
    return remote;
  },
  tileOnScreen(tile) {
    if (!board) return null;
    return fitBoard(board.layout, window.innerWidth, window.innerHeight).toScreen(board.layout.centers[tile]);
  },
  tilesTouching(seat) {
    if (!remote) return [];
    const g = geometryOf(remote.game);
    return [...new Set(g.spots.filter((s) => remote!.rules.buildings[s.id]?.seat === seat).flatMap((s) => s.tiles))];
  },
  placeOnScreen(kind, at) {
    if (!remote || !board) return null;
    return placeAt(fitBoard(board.layout, window.innerWidth, window.innerHeight), geometryOf(remote.game), kind, at);
  },
  get stats() {
    const averageDrawMs = drawTimes.length ? drawTimes.reduce((a, b) => a + b, 0) / drawTimes.length : 0;
    return { level: animationLevel(), slowDevice, averageDrawMs };
  },
};
window.addEventListener('resize', () => {
  requestRender();
  renderBadges();
  robberKey = '';
  syncRobber();
});

const fromUrl = gameFromUrl();
if (fromUrl) {
  ephemeral = true;
  setGame(fromUrl, { resetAngle: true });
} else void boot();

async function boot() {
  if (!(await tableAvailable())) {
    startLocal();
    return;
  }
  table = openSocket(() => ({ type: 'hello', role: 'board' }), onServer, (connected) => {
    if (!connected && remote) showToast('Lost the table server. Reconnecting…');
  });
  // If the server doesn't answer, play Board only rather than wait on a blank screen.
  window.setTimeout(() => {
    if (decided) return;
    decided = true;
    startLocal();
  }, 3000);
}
