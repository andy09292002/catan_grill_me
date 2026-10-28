# Hex Board

A touch-screen board companion for a hex-tile resource-trading board game you own. It draws a random board on a portable touch monitor lying flat on the table, and players put their physical pieces on top. The game itself is played with the physical components; the app handles the board, dice, turns, the thief and saving.

The full design and every decision behind it are in [grillMe.md](grillMe.md).

## Status

| Milestone | What | State |
|---|---|---|
| 1 | Board: 19 and 30 hexes, three random modes, harbors, number tokens | Done |
| 2 | Publish to GitHub Pages and install on the PC | Done |
| 3 | Game flow: New game screen, dice, turns, text rotation, saving | Done |
| 4 | Thief | Done |
| 5 | Animation | Done |

## Install it

The app is published at **https://andy09292002.github.io/catan_grill_me/**.

1. Open that link in Edge or Chrome on the PC.
2. Click the **Install** icon at the right end of the address bar (or the menu → **Apps** → **Install Hex Board**).
3. Launch **Hex Board** from the Start menu or desktop, drag its window onto the touch monitor, and press **F11** for full screen.

After the first launch it works offline. New versions download in the background and apply the next time the app opens.

## Run it from source

Needs Node.js 24.

```bash
npm install
npm run dev
```

Open the printed URL, drag the browser window onto the touch monitor and press F11 for full screen.

## Playing

- **New game** (top right): players, seat colors, first player, board size, random mode, thief style and animation. Starting a new game over one in progress asks first.
- **Roll** (bottom right) rolls two dice; **Enter** next to it takes a total from physical dice. Matching tiles flash, then stay lit until the next roll. A 7 starts moving the thief (or, with a physical thief, shows a reminder).
- **Next turn** (bottom left) passes to the next seat clockwise. Numbers, harbor labels and the corner controls turn to face whoever's turn it is, and their side of the screen glows in their color.
- **Last roll** (top left) shows the latest roll and the ones before it.
- **Thief.** With the on-screen thief (the default), it starts on the desert. After a 7, or when you tap **Thief** (top right), tap a tile to move it there, or **Cancel**. When its tile's number is rolled, that tile shows a red blocking sign instead of lighting up. With a physical thief, the board never responds to touch and every matching tile lights up.
- **Animation.** Sheep wander their pastures, wheat and trees sway in the wind, and workers dig in the hills and mountains, all kept clear of tile corners, edges and number tokens so nothing moves under a piece. Like the text, each tile's art and the thief turn to face the current player. **Full** (the default), **Calm** (gentle swaying at about 30 fps) or **Off** (a still board) is set on the New game screen and applies right away. If a device can't keep up with Full, the app eases to Calm by itself.
- The game saves after every change and comes back after a refresh, a restart or closing the app.
- On a PC keyboard, **R** rolls and **N** passes the turn.

A URL like `?size=30&mode=balancedPlus&seed=12345&players=5&thief=physical` opens a fixed board for testing or sharing without touching the saved game. Modes are `random`, `balanced` and `balancedPlus`.

## Check it

```bash
npm test
npm run build
npm run screenshots
```

`npm run screenshots` needs a build first. It saves the New game screen, both boards, a mid-game roll, and the thief being moved and blocking a tile at 1920×1080, 1366×768, 2560×1440 and 1024×768 into `screenshots/`, using the installed Microsoft Edge. CI runs the tests and screenshots on every push and uploads the screenshots as a build artifact.

Merging into `main` deploys to GitHub Pages, but only if the tests pass.

The app icons in `public/` are rendered from `public/favicon.svg` with `node scripts/icons.mjs`.

`node scripts/perf.mjs` (with `npm run dev` running) reports how long frames take to draw at each animation level; add `--throttle 6` to simulate a slow device and check that Full eases to Calm.

## Layout

- `src/board/` – board geometry, random generation and its tests
- `src/game/` – players and seats, dice, turns, the thief, saving, the animation preference, and their tests
- `src/render/` – fitting the board to the screen, drawing it on a canvas, the animated terrain art and the frame-time watcher
- `src/ui/` – New game screen, confirmation, number pad and roll banner
- `src/main.ts` – app controller: corner controls, animation and saving
- `public/` – app icons
- `scripts/screenshots.mjs` – headless screenshots at several screen sizes
- `scripts/perf.mjs` – frame draw times at each animation level
- `.github/workflows/` – CI on every push, and the GitHub Pages deploy on `main`
