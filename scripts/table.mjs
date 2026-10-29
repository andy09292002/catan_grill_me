// End-to-end check of Board + phones: starts the table server on a spare port, opens the board
// and three phones in separate browsers, joins, plays setup by starting pieces on the phones and
// placing them on the board, rolls, opens a trade, ends a turn, drops and moves a phone, and
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

const PHONE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true };
const channel = process.env.SCREENSHOT_BROWSER === 'chromium' ? undefined : 'msedge';
const browser = await chromium.launch({ channel });
let server = await startServer();
try {
  const boardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const board = await boardCtx.newPage();
  const remote = () => board.evaluate(() => window.hexBoard.remote);
  await board.goto(BASE);
  await board.getByRole('radio', { name: 'Board + phones' }).click();
  await board.getByRole('radio', { name: '3', exact: true }).click();
  await board.screenshot({ path: `${out}/01-new-game.png` });
  await board.getByRole('button', { name: 'Start game' }).click();
  await board.getByText('Join with your phones').waitFor();
  check(await board.getByRole('img', { name: /QR code/ }).evaluate((img) => img.complete && img.naturalWidth > 0), 'board shows the join QR code');

  // Phones load the page from localhost here; at the table they use the address in the QR code.
  const phones = [];
  for (const color of ['Red', 'Blue', 'White']) {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/phone.html`);
    await page.getByRole('button', { name: color }).click();
    await page.getByText(color, { exact: true }).waitFor();
    phones.push({ color, ctx, page });
  }
  await board.getByRole('button', { name: 'Start game' }).waitFor();
  await board.screenshot({ path: `${out}/02-lobby-full.png` });
  check((await board.getByText('Joined', { exact: true }).count()) === 3, 'board shows all three phones joined');
  await board.getByRole('button', { name: 'Start game' }).click();
  await board.locator('.seat-badge').first().waitFor();

  // Setup: the player whose step it is starts the piece on their phone and places it on the board.
  let shotSetup = false;
  for (let step = 0; step < 12; step++) {
    const seat = (await remote()).game.current;
    const phone = phones[seat].page;
    const place = phone.getByRole('button', { name: /^Place (settlement|road)$/ });
    await place.waitFor();
    const kind = (await place.textContent()).includes('road') ? 'road' : 'settlement';
    await place.click();
    await board.waitForFunction(() => window.hexBoard.remote.rules.pending);
    const { legal } = (await remote()).rules.pending;
    const at = legal[Math.floor(legal.length / 2)];
    const p = await board.evaluate(([k, a]) => window.hexBoard.placeOnScreen(k, a), [kind, at]);
    await board.mouse.click(p.x, p.y);
    await board.locator('#build-confirm:not([hidden])').waitFor();
    if (!shotSetup) {
      await board.screenshot({ path: `${out}/03-board-placing.png` });
      await phone.screenshot({ path: `${out}/04-phone-placing.png` });
      shotSetup = true;
    }
    await board.locator('#build-yes').click();
    await board.waitForFunction(
      ([k, a]) => {
        const r = window.hexBoard.remote.rules;
        return !r.pending && (k === 'road' ? r.roads[a] !== null : r.buildings[a] !== null);
      },
      [kind, at],
    );
  }
  const main = await remote();
  check(main.rules.phase === 'main' && main.rules.points.every((n) => n === 2), 'setup placed 2 settlements and 2 roads each');
  await board.waitForTimeout(700);
  await board.screenshot({ path: `${out}/05-board-after-setup.png` });

  const first = main.game.current;
  const turnText = (seat, viewer) => (seat === viewer ? 'Your turn' : `${phones[seat].color}'s turn`);
  const me = phones[first].page;
  await me.getByText('Your turn').first().waitFor();
  await me.screenshot({ path: `${out}/06-phone-roll.png` });
  await me.getByRole('button', { name: 'Roll', exact: true }).click();
  await board.waitForFunction(() => window.hexBoard.remote.rules.rolled);
  const rolled = (await remote()).game.lastRoll;
  check(rolled.dice && rolled.total === rolled.dice[0] + rolled.dice[1], `phone rolled ${rolled.total} on the server`);
  if (rolled.total === 7) await board.getByRole('button', { name: 'Cancel' }).click();
  await me.getByRole('button', { name: 'End turn' }).waitFor();
  await me.waitForTimeout(300);
  await me.screenshot({ path: `${out}/07-phone-hand.png` });
  await me.getByRole('button', { name: 'Trade' }).click();
  await me.getByText('Trade with the bank').waitFor();
  await me.screenshot({ path: `${out}/08-phone-trade.png` });
  await me.getByRole('button', { name: 'Close' }).click();

  await me.getByRole('button', { name: 'End turn' }).click();
  const second = (first + 1) % 3;
  await phones[second].page.getByText('Your turn').first().waitFor();
  check(true, 'End turn on the phone passes the turn');
  await board.waitForTimeout(700);
  await board.screenshot({ path: `${out}/09-board-next-turn.png` });

  // A 7, keyed in from physical dice: the thief moves on the board and takes a card face down.
  const roller = phones[second].page;
  await roller.getByRole('button', { name: 'Enter dice' }).click();
  await roller.getByRole('button', { name: '7', exact: true }).click();
  await board.waitForFunction(() => window.hexBoard.remote.rules.robber?.stage === 'move');
  const target = (second + 1) % 3;
  const thiefNow = (await remote()).game.thiefTile;
  const tile = (await board.evaluate((s) => window.hexBoard.tilesTouching(s), target)).find((id) => id !== thiefNow);
  const tp = await board.evaluate((id) => window.hexBoard.tileOnScreen(id), tile);
  await board.mouse.click(tp.x, tp.y);
  await board.locator('#build-confirm:not([hidden])').waitFor();
  await board.waitForTimeout(400);
  await board.screenshot({ path: `${out}/10-board-thief.png` });
  await board.locator('#build-yes').click();
  await board.waitForFunction((id) => window.hexBoard.game.thiefTile === id, tile);
  check(true, 'a 7 lets the roller move the thief on the board');
  const stage = (await remote()).rules.robber?.stage;
  if (stage === 'choose') await roller.getByRole('button', { name: new RegExp(`^Rob ${phones[target].color}`) }).click();
  if (stage) {
    await roller.locator('.card-back').first().waitFor();
    await roller.screenshot({ path: `${out}/11-phone-steal.png` });
    const victim = (await remote()).rules.robber.victim;
    await phones[victim].page.getByText(/is taking one of your cards/).waitFor();
    await phones[victim].page.screenshot({ path: `${out}/12-phone-victim.png` });
    const before = (await remote()).rules.cards;
    await roller.locator('.card-back').first().click();
    await board.waitForFunction(() => !window.hexBoard.remote.rules.robber);
    const after7 = (await remote()).rules.cards;
    check(after7[second] === before[second] + 1 && after7.reduce((a, b) => a + b) === before.reduce((a, b) => a + b), 'the face-down pick moves one card');
    await roller.getByText(/^You took /).waitFor();
  }
  await roller.getByRole('button', { name: 'End turn' }).click();
  const third = (second + 1) % 3;
  await phones[third].page.getByText('Your turn').first().waitFor();

  // A phone that sleeps and comes back keeps its seat.
  await phones[2].page.close();
  await board.locator('.seat-badge.away').waitFor();
  check(true, 'board marks a dropped phone');
  phones[2].page = await phones[2].ctx.newPage();
  await phones[2].page.goto(`${BASE}/phone.html`);
  await phones[2].page.getByText(turnText(third, 2)).first().waitFor();
  await board.locator('.seat-badge.away').waitFor({ state: 'detached' });
  check(true, 'reopened phone is back in its seat');

  // White's battery dies: move the seat to a new phone.
  await board.getByRole('button', { name: /^White/ }).click();
  await board.getByText('Move White to another phone').waitFor();
  const rejoinUrl = new URL(await board.evaluate(() => decodeURIComponent(document.querySelector('.lobby img').src.split('text=')[1])));
  await board.getByRole('button', { name: 'Done' }).click();
  const newCtx = await browser.newContext(PHONE);
  const newPhone = await newCtx.newPage();
  await newPhone.goto(`${BASE}/phone.html${rejoinUrl.search}`);
  await newPhone.getByText('White', { exact: true }).first().waitFor();
  await phones[2].page.getByText('This seat moved to another phone').waitFor();
  check(true, 'rejoin code moves the seat and the old phone is told');

  // The PC restarts: the game and the seats carry on.
  server.kill();
  await new Promise((r) => server.once('exit', r));
  server = await startServer();
  // Red's phone never moved, so it's the one to watch reconnect.
  await phones[0].page.getByText('Reconnecting…').waitFor({ state: 'detached', timeout: 8000 });
  await phones[0].page.getByText(turnText(third, 0)).first().waitFor();
  await board.reload();
  await board.locator('.seat-badge').first().waitFor();
  const after = await remote();
  check(after.game.current === third && after.rules.points.every((n) => n === 2), 'game survives a server restart');

  const portrait = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const upright = await portrait.newPage();
  await upright.goto(`${BASE}/phone.html`);
  check(await upright.getByText('Turn your phone sideways').isVisible(), 'upright phone asks to be turned sideways');
  console.log(`Screenshots saved to ${out}/`);
} finally {
  server.kill();
  await browser.close();
  rmSync(saveDir, { recursive: true, force: true });
}
