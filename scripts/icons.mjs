// Renders public/favicon.svg into the PNG app icons. Run after changing the SVG:
//   node scripts/icons.mjs
// Uses the installed Microsoft Edge, like the screenshot script.

import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile('public/favicon.svg', 'utf8');
const ICONS = [
  { file: 'public/icon-512.png', size: 512 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const { file, size } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: file });
    await page.close();
    console.log('saved', file);
  }
} finally {
  await browser.close();
}
