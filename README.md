# Hex Board

A touch-screen board companion for a hex-tile resource-trading board game you own. It draws a random board on a portable touch monitor lying flat on the table, and players put their physical pieces on top. The game itself is played with the physical components; the app handles the board, dice, turns and saving (and later the thief).

The full design and every decision behind it are in [grillMe.md](grillMe.md).

## Status

| Milestone | What | State |
|---|---|---|
| 1 | Board: 19 and 30 hexes, three random modes, harbors, number tokens | Done |
| 2 | Publish to GitHub Pages and install on the PC | Done |
| 3 | Game flow: New game screen, dice, turns, text rotation, saving | In progress |
| 4 | Thief | Planned |
| 5 | Animation | Planned |

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

- **New game** (top right): players, seat colors, first player, board size and random mode. Starting a new game over one in progress asks first.
- **Roll** (bottom right) rolls two dice; **Enter** next to it takes a total from physical dice. Matching tiles flash, then stay lit until the next roll. A 7 shows a reminder to move the thief.
- **Next turn** (bottom left) passes to the next seat clockwise. Numbers, harbor labels and the corner controls turn to face whoever's turn it is, and their side of the screen glows in their color.
- **Last roll** (top left) shows the latest roll and the ones before it.
- The game saves after every change and comes back after a refresh, a restart or closing the app.
- On a PC keyboard, **R** rolls and **N** passes the turn.

A URL like `?size=30&mode=balancedPlus&seed=12345&players=5` opens a fixed board for testing or sharing without touching the saved game. Modes are `random`, `balanced` and `balancedPlus`.

## Check it

```bash
npm test
npm run build
npm run screenshots
```

`npm run screenshots` needs a build first. It saves the New game screen, both boards and a mid-game roll at 1920×1080, 1366×768, 2560×1440 and 1024×768 into `screenshots/`, using the installed Microsoft Edge. CI runs the tests and screenshots on every push and uploads the screenshots as a build artifact.

Merging into `main` deploys to GitHub Pages, but only if the tests pass.

The app icons in `public/` are rendered from `public/favicon.svg` with `node scripts/icons.mjs`.

## Layout

- `src/board/` – board geometry, random generation and its tests
- `src/game/` – players and seats, dice, turns, saving, and their tests
- `src/render/` – fitting the board to the screen and drawing it on a canvas
- `src/ui/` – New game screen, confirmation, number pad and roll banner
- `src/main.ts` – app controller: corner controls, animation and saving
- `public/` – app icons
- `scripts/screenshots.mjs` – headless screenshots at several screen sizes
- `.github/workflows/` – CI on every push, and the GitHub Pages deploy on `main`
