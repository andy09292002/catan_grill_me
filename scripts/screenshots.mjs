// Builds nothing itself: run `npm run build` first. Serves dist/ with `vite preview` and
// captures the board at several screen sizes into screenshots/.
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
  { size: 19, mode: 'balanced', seed: 12345 },
  { size: 30, mode: 'balancedPlus', seed: 12345 },
];

const server = await preview({ preview: { port: 4173, strictPort: true } });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch(process.env.SCREENSHOT_BROWSER === 'chromium' ? {} : { channel: 'msedge' });

await mkdir('screenshots', { recursive: true });
try {
  for (const screen of SCREENS) {
    const page = await browser.newPage({ viewport: { width: screen.width, height: screen.height } });
    for (const b of BOARDS) {
      await page.goto(`${url}?size=${b.size}&mode=${b.mode}&seed=${b.seed}`);
      await page.waitForLoadState('networkidle');
      const file = `screenshots/${screen.name}-${b.size}hex.png`;
      await page.screenshot({ path: file });
      console.log('saved', file);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
