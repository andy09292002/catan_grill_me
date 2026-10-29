// Screenshots of the phone's sheets at a phone's size, from a prepared game: the discard after
// a 7 with a big hand, the player-trade sheet, and the face-down steal. Starts its own table
// server from a save file, so no clicking through setup.
// Needs a build first (`npm run build`). Run: npx tsx scripts/phone-shots.ts

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SavedTable } from '../server/lobby';
import { createGame } from '../src/game/state';
import { apply, hand, legalPlaces, RESOURCES, startTable, type Action, type Hand, type Table } from '../src/rules/engine';

const PORT = 5198;
const out = 'screenshots/phone';
mkdirSync(out, { recursive: true });

function act(t: Table, seat: number, a: Action): Table {
  const r = apply(t, seat, a, () => [3, 4]);
  if (!r.ok) throw new Error(`${a.type}: ${r.reason}`);
  return r.table;
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
const save = (table: Table) => {
  const saved: SavedTable = { version: 2, id: 'shots', started: true, game: table.game, rules: table.rules, keys };
  writeFileSync(join(saveDir, 'game.json'), JSON.stringify(saved));
};

const saveDir = mkdtempSync(join(tmpdir(), 'hex-phone-'));
const browser = await chromium.launch({ channel: process.env.SCREENSHOT_BROWSER === 'chromium' ? undefined : 'msedge' });

async function withServer(table: Table, shoot: (open: (seat: number) => Promise<import('@playwright/test').Page>) => Promise<void>) {
  save(table);
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/table.ts'], { env: { ...process.env, PORT: String(PORT), HEX_BOARD_SAVE: saveDir }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((resolve) => server.stdout.on('data', (d) => String(d).includes('table is running') && resolve()));
  try {
    await shoot(async (seat) => {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await ctx.addInitScript((k) => localStorage.setItem('hex-board/seat', JSON.stringify({ tableId: 'shots', key: k })), keys[seat]);
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/phone.html`);
      return page;
    });
  } finally {
    server.kill();
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
  console.log(`Screenshots saved to ${out}/`);
} finally {
  await browser.close();
  rmSync(saveDir, { recursive: true, force: true });
}
