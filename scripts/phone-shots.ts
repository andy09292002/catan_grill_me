// Screenshots of the phone's sheets at a phone's size, from prepared games: the discard after
// a 7 with a big hand, the player-trade sheet, development cards, and the end of a game on the
// phone and the board. Starts its own table server from a save file, so no clicking through setup.
// Needs a build first (`npm run build`). Run: npx tsx scripts/phone-shots.ts

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SavedTable } from '../server/lobby';
import { createGame } from '../src/game/state';
import { apply, DEV_COST, hand, legalPlaces, RESOURCES, startTable, type Action, type DevCard, type Hand, type Table } from '../src/rules/engine';

const PORT = 5198;
const out = 'screenshots/phone';
mkdirSync(out, { recursive: true });

function act(t: Table, seat: number, a: Action): Table {
  const r = apply(t, seat, a, () => [3, 4]);
  if (!r.ok) throw new Error(`${a.type}: ${r.reason}`);
  return r.table;
}

/** Sets one seat's hand, taking the difference from the bank. */
function withCards(table: Table, seat: number, h: Partial<Hand>): Table {
  const hands = table.rules.hands.map((x, s) => (s === seat ? hand(h) : x));
  return withHands(table, hands);
}

/** Sets hands, keeping the bank's totals right. */
function withHands(t: Table, hands: Partial<Hand>[]): Table {
  const next = hands.map((h) => hand(h));
  const bank = hand();
  for (const r of RESOURCES) bank[r] = 19 - next.reduce((n, h) => n + h[r], 0);
  return { ...t, rules: { ...t.rules, hands: next, bank } };
}

let t = startTable(createGame({ colors: ['red', 'blue', 'white'], firstSeat: 0, size: 19, mode: 'balanced', seed: 4242, thiefStyle: 'onscreen' }));
while (t.rules.phase === 'setup') {
  const seat = t.game.current;
  for (const kind of ['settlement', 'road'] as const) {
    t = act(t, seat, { type: 'build', kind });
    t = act(t, seat, { type: 'pick', at: legalPlaces(t, seat, kind)[0] });
    t = act(t, seat, { type: 'confirm' });
  }
}
t = withHands(t, [{ wood: 3, brick: 2, wool: 1, grain: 4, ore: 2 }, { wood: 3, grain: 3, ore: 2 }, { wool: 2 }]);
const keys = ['key-red', 'key-blue', 'key-white'];
const save = (table: Table, seatKeys = keys) => {
  const saved: SavedTable = { version: 4, id: 'shots', started: true, game: table.game, rules: table.rules, keys: seatKeys };
  writeFileSync(join(saveDir, 'game.json'), JSON.stringify(saved));
};

const saveDir = mkdtempSync(join(tmpdir(), 'hex-phone-'));
const browser = await chromium.launch({ channel: process.env.SCREENSHOT_BROWSER === 'chromium' ? undefined : 'msedge' });

type Open = (seat: number | 'board') => Promise<import('@playwright/test').Page>;

/** Hands `seat` development cards, bought on `bought`, out of the deck. */
function withDev(table: Table, seat: number, cards: DevCard[], bought = 0): Table {
  const deck = table.rules.deck.slice();
  for (const c of cards) deck.splice(deck.lastIndexOf(c), 1);
  const devCards = table.rules.devCards.slice();
  devCards[seat] = [...devCards[seat], ...cards.map((card) => ({ card, bought }))];
  return { ...table, rules: { ...table.rules, deck, devCards } };
}

async function withServer(table: Table, shoot: (open: Open) => Promise<void>, seatKeys = keys) {
  save(table, seatKeys);
  const contexts: import('@playwright/test').BrowserContext[] = [];
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/table.ts'], { env: { ...process.env, PORT: String(PORT), HEX_BOARD_SAVE: saveDir }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((resolve) => server.stdout.on('data', (d) => String(d).includes('table is running') && resolve()));
  try {
    await shoot(async (seat) => {
      if (seat === 'board') {
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        contexts.push(ctx);
        const page = await ctx.newPage();
        await page.goto(`http://localhost:${PORT}/`);
        return page;
      }
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      contexts.push(ctx);
      await ctx.addInitScript((k) => localStorage.setItem('hex-board/seat', JSON.stringify({ tableId: 'shots', key: k })), seatKeys[seat]);
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/phone.html`);
      return page;
    });
  } finally {
    // Close this round's phones first, or they reconnect to the next round's server with the
    // same seat keys and keep bumping the new phones off their seats.
    await Promise.all(contexts.map((c) => c.close()));
    server.kill();
    await new Promise((r) => server.once('exit', r));
  }
}

try {
  // A 7 with Red holding 12 cards and Blue 8.
  await withServer(act(t, 0, { type: 'enterRoll', total: 7 }), async (open) => {
    const red = await open(0);
    await red.getByText(/Discard 6 of your 12 cards/).waitFor();
    await red.screenshot({ path: `${out}/discard-red.png` });
    const blue = await open(1);
    await blue.getByText(/Discard 4 of your 8 cards/).waitFor();
    await blue.getByRole('button', { name: '+' }).first().click();
    await blue.screenshot({ path: `${out}/discard-blue.png` });
  });
  // Red's turn after rolling: the hand and the trade sheet.
  await withServer(act(t, 0, { type: 'enterRoll', total: 5 }), async (open) => {
    const red = await open(0);
    await red.getByRole('button', { name: 'End turn' }).waitFor();
    await red.screenshot({ path: `${out}/hand-red.png` });
    await red.getByRole('button', { name: 'Trade' }).click();
    await red.getByRole('button', { name: /Blue/ }).click();
    await red.getByText('Send offer').waitFor();
    await red.screenshot({ path: `${out}/trade-red.png` });
  });
  // Development cards: one of each kind, the monopoly bought this turn.
  const later = { ...t, game: { ...t.game, turn: 3 } };
  const carded = withDev(withDev(later, 0, ['knight', 'plenty', 'point']), 0, ['monopoly'], 3);
  await withServer(act(carded, 0, { type: 'enterRoll', total: 5 }), async (open) => {
    const red = await open(0);
    await red.getByRole('button', { name: 'Cards (4)' }).click();
    await red.getByText('Your development cards').waitFor();
    await red.screenshot({ path: `${out}/cards-red.png` });
    // Year of plenty: two ore.
    await red.locator('.dev-list li', { hasText: 'Year of plenty' }).getByRole('button', { name: 'Play' }).click();
    await red.locator('.sheet .res', { hasText: 'Ore' }).click();
    await red.locator('.sheet .res', { hasText: 'Ore' }).click();
    await red.screenshot({ path: `${out}/plenty-red.png` });
    await red.getByRole('button', { name: 'Take them' }).click();
    await red.getByText('Ore 4').waitFor();
  });

  // One point short (a city, a settlement, Largest Army and 4 victory point cards), with the
  // last victory point card on top of the deck: buying it wins.
  let near = withDev(withCards(later, 0, DEV_COST), 0, ['point', 'point', 'point', 'point']);
  const city = near.rules.buildings.findIndex((b) => b?.seat === 0);
  const buildings = near.rules.buildings.map((b, i) => (i === city ? { seat: 0, kind: 'city' as const } : b));
  const deck = [...near.rules.deck.filter((c) => c !== 'point'), 'point' as const];
  near = { ...near, rules: { ...near.rules, buildings, deck, knights: [3, 0, 0], largestArmy: 0 } };
  await withServer(act(near, 0, { type: 'enterRoll', total: 5 }), async (open) => {
    const red = await open(0);
    const board = await open('board');
    await board.locator('.seat-badge').first().waitFor();
    await red.locator('.build', { hasText: 'Card' }).click();
    await red.getByText('You win!').waitFor();
    await red.screenshot({ path: `${out}/win-red.png` });
    const blue = await open(1);
    await blue.getByText('Red wins!').waitFor();
    await blue.screenshot({ path: `${out}/win-blue.png` });
    await board.getByText('Red wins!').waitFor();
    await board.screenshot({ path: `${out}/win-board.png` });
  });
  // Five players on the big board: after Red's turn, Blue's special build.
  let big = startTable(
    createGame({ colors: ['red', 'blue', 'white', 'orange', 'green'], firstSeat: 0, size: 30, mode: 'balanced', seed: 99, thiefStyle: 'onscreen' }),
  );
  while (big.rules.phase === 'setup') {
    const seat = big.game.current;
    for (const kind of ['settlement', 'road'] as const) {
      big = act(big, seat, { type: 'build', kind });
      big = act(big, seat, { type: 'pick', at: legalPlaces(big, seat, kind)[0] });
      big = act(big, seat, { type: 'confirm' });
    }
  }
  big = act(act(big, 0, { type: 'enterRoll', total: 5 }), 0, { type: 'endTurn' });
  const bigKeys = [...keys, 'key-orange', 'key-green'];
  await withServer(big, async (open) => {
    const blue = await open(1);
    await blue.getByRole('button', { name: 'Done building' }).waitFor();
    await blue.screenshot({ path: `${out}/special-blue.png` });
    const board = await open('board');
    await board.locator('#robber-note:not([hidden])').waitFor();
    await board.waitForTimeout(700);
    await board.screenshot({ path: `${out}/special-board.png` });
  }, bigKeys);
  console.log(`Screenshots saved to ${out}/`);
} finally {
  await browser.close();
  rmSync(saveDir, { recursive: true, force: true });
}
