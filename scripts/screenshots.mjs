// Builds nothing itself: run `npm run build` first. Serves dist/ with `vite preview` and
// captures the app at several screen sizes into screenshots/.
//
// Locally this uses the installed Microsoft Edge (no browser download needed).
// In CI, set SCREENSHOT_BROWSER=chromium after `npx playwright install chromium`.

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const SCREENS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: '1024x768-4x3', width: 1024, height: 768 },
];
const BOARDS = [
  { size: 19, mode: 'balanced', seed: 12345, players: 4 },
  { size: 30, mode: 'balancedPlus', seed: 12345, players: 5 },
];

const server = await preview({ preview: { port: 4173, strictPort: true } });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch(process.env.SCREENSHOT_BROWSER === 'chromium' ? {} : { channel: 'msedge' });

await mkdir('screenshots', { recursive: true });
const shot = async (page, file) => {
  await page.screenshot({ path: `screenshots/${file}` });
  console.log('saved', `screenshots/${file}`);
};

try {
  for (const screen of SCREENS) {
    // A fresh context per screen size, so no saved game leaks between shots.
    const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height } });
    const page = await context.newPage();

    await page.goto(url);
    await page.waitForSelector('.dialog.setup');
    await shot(page, `${screen.name}-new-game.png`);

    for (const b of BOARDS) {
      await page.goto(`${url}?size=${b.size}&mode=${b.mode}&seed=${b.seed}&players=${b.players}`);
      await page.waitForLoadState('networkidle');
      await shot(page, `${screen.name}-${b.size}hex.png`);
    }

    // Mid-game: second player's turn, an 8 entered from physical dice, after the flash settles.
    await page.goto(`${url}?size=19&mode=balanced&seed=12345&players=3`);
    await page.click('#next-turn');
    await page.click('#pad-open');
    await page.click('.pad-key >> text="8"');
    await page.waitForTimeout(3300);
    await shot(page, `${screen.name}-19hex-rolled-8.png`);

    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
