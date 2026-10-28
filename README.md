# Hex Board

A touch-screen board companion for a hex-tile resource-trading board game you own. It draws a random board on a portable touch monitor lying flat on the table, and players put their physical pieces on top. The game itself is played with the physical components; the app only handles the board (and later dice, turns and the thief).

The full design and every decision behind it are in [grillMe.md](grillMe.md).

## Status

| Milestone | What | State |
|---|---|---|
| 1 | Board: 19 and 30 hexes, three random modes, harbors, number tokens | In progress |
| 2 | Publish to GitHub Pages and install on the PC | Planned |
| 3 | Game flow: New game screen, dice, turns, text rotation, saving | Planned |
| 4 | Thief | Planned |
| 5 | Animation | Planned |

## Run it

Needs Node.js 24.

```bash
npm install
npm run dev
```

Open the printed URL, drag the browser window onto the touch monitor and press F11 for full screen.

The board settings are in the URL, so any board can be reproduced: `?size=30&mode=balancedPlus&seed=12345`. Modes are `random`, `balanced` and `balancedPlus`.

## Check it

```bash
npm test
npm run build
npm run screenshots
```

`npm run screenshots` needs a build first. It saves the board at 1920×1080, 1366×768, 2560×1440 and 1024×768 into `screenshots/`, using the installed Microsoft Edge. CI runs the tests and screenshots on every push and uploads the screenshots as a build artifact.

## Layout

- `src/board/` – board geometry, random generation and its tests
- `src/render/` – fitting the board to the screen and drawing it on a canvas
- `src/main.ts` – app entry and corner controls
- `scripts/screenshots.mjs` – headless screenshots at several screen sizes
