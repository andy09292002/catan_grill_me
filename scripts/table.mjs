// End-to-end check of Board + phones: starts the table server on a spare port, opens the board
// and three phones in separate browsers, joins, plays a little, drops and moves a phone, and
// restarts the server. Fails on the first thing that's wrong; saves screenshots to screenshots/table/.
// Needs a build first (`npm run build`). Run: node scripts/table.mjs

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const out = 'screenshots/table';
mkdirSync(out, { recursive: true });
const saveDir = mkdtempSync(join(tmpdir(), 'hex-table-'));

function startServer() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/table.ts'], {
    env: { ...process.env, PORT: String(PORT), HEX_BOARD_SAVE: saveDir },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => String(d).includes('table is running') && resolve(child));
    child.on('exit', (code) => reject(new Error(`table server exited with ${code}`)));
  });
}

function check(ok, what) {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`ok - ${what}`);
}

const channel = process.env.SCREENSHOT_BROWSER === 'chromium' ? undefined : 'msedge';
const browser = await chromium.launch({ channel });
let server = await startServer();
try {
  const boardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const board = await boardCtx.newPage();
  await board.goto(BASE);
  await board.getByRole('radio', { name: 'Board + phones' }).click();
  await board.getByRole('radio', { name: '3', exact: true }).click();
  await board.screenshot({ path: `${out}/1-new-game.png` });
  await board.getByRole('button', { name: 'Start game' }).click();
  await board.getByText('Join with your phones').waitFor();
  check(await board.getByRole('img', { name: /QR code/ }).evaluate((img) => img.complete && img.naturalWidth > 0), 'board shows the join QR code');
  const joinUrl = await board.locator('.lobby-url').textContent();
  check(/^http:\/\/[\d.]+|localhost/.test(joinUrl), `join address is ${joinUrl}`);

  // Phones load the page from localhost here; at the table they use the address in the QR code.
  const phones = [];
  for (const color of ['Red', 'Blue', 'White']) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/phone.html`);
    await page.getByRole('button', { name: color }).click();
    await page.getByText(color, { exact: true }).waitFor();
    phones.push({ color, ctx, page });
  }
  await phones[0].page.screenshot({ path: `${out}/2-phone-waiting.png` });
  await board.getByRole('button', { name: 'Start game' }).waitFor();
  await board.screenshot({ path: `${out}/3-lobby-full.png` });
  check(await board.getByText('Joined', { exact: true }).count() === 3, 'board shows all three phones joined');
  await board.getByRole('button', { name: 'Start game' }).click();
  // The first player is random, so read it from the board.
  await board.locator('.seat-badge').first().waitFor();
  const first = await board.evaluate(() => window.hexBoard.game.current);
  const turnText = (seat, viewer) => (seat === viewer ? 'Your turn' : `${phones[seat].color}'s turn`);
  for (let i = 0; i < 3; i++) await phones[i].page.getByText(turnText(first, i)).waitFor();
  check(true, `phones show whose turn it is (${phones[first].color} first)`);
  check((await board.locator('.seat-badge').count()) === 3, 'board shows a badge at each seat');

  await board.keyboard.press('r');
  await board.waitForTimeout(1200);
  const rolled = await board.evaluate(() => window.hexBoard.game.lastRoll);
  check(rolled && rolled.dice && rolled.total === rolled.dice[0] + rolled.dice[1], `server rolled ${rolled?.total}`);
  if (rolled.total === 7) {
    await board.getByRole('button', { name: 'Cancel' }).click();
  }
  await board.getByRole('button', { name: /Next turn/ }).click();
  const second = (first + 1) % 3;
  await phones[second].page.getByText('Your turn').waitFor();
  check(true, 'Next turn on the board moves the turn on the phones');
  await board.waitForTimeout(700);
  await board.screenshot({ path: `${out}/4-board-playing.png` });
  await phones[second].page.screenshot({ path: `${out}/5-phone-your-turn.png` });

  // A phone that sleeps and comes back keeps its seat.
  await phones[2].page.close();
  await board.locator('.seat-badge.away').waitFor();
  check(true, 'board marks a dropped phone');
  await board.screenshot({ path: `${out}/6-board-phone-away.png` });
  phones[2].page = await phones[2].ctx.newPage();
  await phones[2].page.goto(`${BASE}/phone.html`);
  await phones[2].page.getByText(turnText(second, 2)).waitFor();
  await board.locator('.seat-badge.away').waitFor({ state: 'detached' });
  check(true, 'reopened phone is back in its seat');

  // White's battery dies: move the seat to a new phone.
  await board.getByRole('button', { name: /^White/ }).click();
  await board.getByText('Move White to another phone').waitFor();
  await board.screenshot({ path: `${out}/7-board-rejoin.png` });
  const rejoinUrl = new URL(await board.evaluate(() => decodeURIComponent(document.querySelector('.lobby img').src.split('text=')[1])));
  await board.getByRole('button', { name: 'Done' }).click();
  const newCtx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const newPhone = await newCtx.newPage();
  await newPhone.goto(`${BASE}/phone.html${rejoinUrl.search}`);
  await newPhone.getByText('White', { exact: true }).waitFor();
  await phones[2].page.getByText('This seat moved to another phone').waitFor();
  check(true, 'rejoin code moves the seat and the old phone is told');
  await phones[2].page.screenshot({ path: `${out}/8-phone-moved.png` });

  // The PC restarts: the game and the seats carry on.
  server.kill();
  await new Promise((r) => server.once('exit', r));
  server = await startServer();
  // Red's phone never moved, so it's the one to watch reconnect.
  await phones[0].page.getByText('Reconnecting…').waitFor({ state: 'detached', timeout: 8000 });
  await phones[0].page.getByText(turnText(second, 0)).waitFor();
  await board.reload();
  await board.locator('.seat-badge').first().waitFor();
  const after = await board.evaluate(() => ({ current: window.hexBoard.game.current, rolls: window.hexBoard.game.history.length }));
  check(after.current === second && after.rolls === 1, 'game survives a server restart');

  const portrait = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const upright = await portrait.newPage();
  await upright.goto(`${BASE}/phone.html`);
  check(await upright.getByText('Turn your phone sideways').isVisible(), 'upright phone asks to be turned sideways');
  await upright.screenshot({ path: `${out}/9-phone-portrait.png` });
  console.log(`Screenshots saved to ${out}/`);
} finally {
  server.kill();
  await browser.close();
  rmSync(saveDir, { recursive: true, force: true });
}
