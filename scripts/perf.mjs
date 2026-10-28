// Measures how long the board takes to draw per frame at each animation level.
// Run with the dev server up (`npm run dev`):  node scripts/perf.mjs [url] [--throttle N]
// --throttle slows the CPU N times, to check that Full eases to Calm on a slow device.
// Uses the installed Microsoft Edge, like the screenshot script.

import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const throttleAt = args.indexOf('--throttle');
const throttle = throttleAt >= 0 ? Number(args.splice(throttleAt, 2)[1]) : 1;
const url = args[0] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const scale of [1, 2]) {
    for (const size of [19, 30]) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
      const page = await context.newPage();
      if (throttle > 1) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      }
      for (const level of ['full', 'calm']) {
        await page.addInitScript((l) => localStorage.setItem('hex-board/prefs', JSON.stringify({ animation: l })), level);
        await page.goto(`${url}?size=${size}&seed=12345&players=${size === 30 ? 5 : 4}`);
        await page.waitForTimeout(throttle > 1 ? 8000 : 3000);
        const stats = await page.evaluate(() => window.hexBoard.stats);
        const fps = await page.evaluate(
          () =>
            new Promise((resolve) => {
              let n = 0;
              const end = performance.now() + 1000;
              const f = () => (n++, performance.now() < end ? requestAnimationFrame(f) : resolve(n));
              requestAnimationFrame(f);
            }),
        );
        console.log(
          `${size} hexes  ${scale}x  ${level.padEnd(4)}  draw ${stats.averageDrawMs.toFixed(1)} ms  ` +
            `frames ${fps}/s  now ${stats.level}${stats.slowDevice ? ' (eased)' : ''}`,
        );
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
