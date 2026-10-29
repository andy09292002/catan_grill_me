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
| 6 | Board + phones: local table server, joining by QR code, seat keys and rejoin | Done |
| 7 | Board + phones: rules engine, building, trading, the phone hand | Done |
| 8 | Board + phones: the 7, discards, the thief and face-down steals | In review |
| 9 | Board + phones: development cards, Largest Army, Longest Road, winning | Planned |
| 10 | Board + phones: 5–6 players, special build phase, a double-click exe | Planned |

The Board + phones design is recorded in `grillMe.md` (session 2).

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

## Board + phones

In this mode each player's phone holds their hidden cards, and the PC runs the game. It needs the table server running on the PC; the GitHub Pages site can only play Board only.

```bash
npm run table
```

This builds the app and starts the server. It prints two addresses: open the first (`http://localhost:5180/`) on the PC for the board, and phones join at the second, which the board also shows as a QR code. Phones must be on the same Wi-Fi as the PC; no internet is needed. The first time, Windows asks whether to let Node.js through the firewall: allow it on **private networks**, or phones can't connect.

- On the New game screen, pick **Mode: Board + phones**, then the players and board as usual, and **Start game**.
- Each player scans the QR code and taps a free color. **Start game** appears once every seat has a phone.
- A badge at each player's edge shows whether their phone is connected. A phone that sleeps or closes the page goes back to its seat when reopened.
- If a phone dies, tap that player's badge: the board shows a one-time code that moves the seat to another phone, and the old phone stops working for this game.
- The server saves the game to `.table/game.json` after every change, so stopping and restarting it carries on where you left off.

**Phones can't connect?** The address in the QR code is the PC's address on your Wi-Fi, so phones on that Wi-Fi should reach it. When they can't, it's almost always Windows Firewall:

1. **Settings → Network & internet → Wi-Fi →** your network **→ Network profile type: Private.** On a *Public* network, Windows blocks phones from connecting.
2. **Control Panel → Windows Defender Firewall → Allow an app through firewall → Change settings,** find **Node.js JavaScript Runtime** and tick **Private.** If you clicked Cancel on the first-run prompt, Windows saved that as a *block* rule; ticking the box replaces it.
3. Restart `npm run table` and scan again.

Some routers also keep devices apart ("AP isolation" or a guest network); use the main network, not the guest one.

**Playing.** The PC runs the base-game rules; nobody needs to count.

- **Setup.** In turn, then back the other way, each player taps **Place settlement** (then **Place road**) on their phone. Legal spots glow on the board in their color: tap one, then **✓** next to it (or **✗**). The second settlement brings one card from each tile around it.
- **Rolling.** Tap **Roll** on your phone or on the board, or roll real dice and enter the total on either. Every settlement next to a tile with that number gets a card, every city two, straight into the phones. The thief's tile pays nothing.
- **Building.** After rolling, your phone shows **Road**, **Settlement** and **City** with their costs; the ones you can afford light up. Pick one, then place it on the board as in setup. **Undo last** takes back your last piece until anything else happens. Buying and trades are final.
- **Trading.** Talk it out, then on your phone tap **Trade**: either the **Bank** (4 for 1, or 3 or 2 for 1 with a harbor; your rates are shown) or another player, choosing what you give and get. They tap **Accept** or **Decline** on theirs.
- **A 7.** Nobody gets cards. Everyone holding more than 7 discards half (rounded down), choosing on their own phone, all at the same time. Then the roller taps a tile on the board for the thief, and **✓**. If several players have a building there, the roller picks whom to rob on their phone; then their phone shows that player's cards face down, shuffled fresh, and they tap one. The victim watches their own cards in the same order and sees which one goes; only those two learn which card it was. A note at the roller's edge of the board shows where the 7 is up to.
- **End turn** on your phone, or **Next turn** on the board.
- Your phone, held sideways, shows your cards fanned like a hand. The panel at your edge of the board shows the other players your points and how many cards you hold (it faces into the table, since your phone already shows you), and glows red over 7.

Still to come: development cards, Largest Army, Longest Road and the win in milestone 9. In Board + phones the thief moves only after a 7 (and, from milestone 9, a knight), so the board's **Thief** button is hidden.

A URL like `?size=30&mode=balancedPlus&seed=12345&players=5&thief=physical` opens a fixed board for testing or sharing without touching the saved game. Modes are `random`, `balanced` and `balancedPlus`.

## Check it

```bash
npm test
npm run build
npm run screenshots
node scripts/table.mjs
```

`node scripts/table.mjs` also needs a build. It starts the table server on a spare port, opens the board and three phones in separate browsers, and checks joining, setup with pieces started on the phones and placed on the board, rolling from a phone, the trade sheet, ending a turn, a 7 keyed in from physical dice with the thief moved on the board and a face-down card taken, a dropped phone coming back, moving a seat with the rejoin code, a server restart, and the sideways prompt. Its screenshots go to `screenshots/table/`.

`npx tsx scripts/phone-shots.ts` (after a build) screenshots the phone at a phone's size from prepared games: a big hand, the discard sheet after a 7 and the trade sheet, into `screenshots/phone/`.

`npm test` includes bot games: bots play through the real server logic, mixing legal moves with nonsense, and every saved state is checked against the rules (no card made or lost, settlements apart, roads connected, refused moves change nothing), 7s, discards and steals included. It plays 60 games; `SIM_GAMES=1000 npx vitest run server/sim` plays more.

`npm run screenshots` needs a build first. It saves the New game screen, both boards, a mid-game roll, and the thief being moved and blocking a tile at 1920×1080, 1366×768, 2560×1440 and 1024×768 into `screenshots/`, using the installed Microsoft Edge. CI runs the tests and screenshots on every push and uploads the screenshots as a build artifact.

Merging into `main` deploys to GitHub Pages, but only if the tests pass.

The app icons in `public/` are rendered from `public/favicon.svg` with `node scripts/icons.mjs`.

`node scripts/perf.mjs` (with `npm run dev` running) reports how long frames take to draw at each animation level; add `--throttle 6` to simulate a slow device and check that Full eases to Calm.

## Layout

- `src/board/` – board geometry, random generation and its tests
- `src/game/` – players and seats, dice, turns, the thief, saving, the animation preference, and their tests
- `src/render/` – fitting the board to the screen, drawing it on a canvas, the animated terrain art and the frame-time watcher
- `src/ui/` – New game screen, confirmation, number pad, roll banner, the joining screen and seat badges
- `src/rules/` – the base-game rules for Board + phones (corners and sides of the board, setup, production, building, undo, trades) and a test for each rule
- `src/net/` – messages between the table server, the board and the phones, what each device may see, and the reconnecting socket
- `src/phone/` – the phone page for Board + phones
- `src/main.ts` – app controller: corner controls, animation and saving, and the board's side of Board + phones
- `server/` – the table server (`table.ts`) and the seats and game it runs (`lobby.ts`), with tests and the bot games (`sim.test.ts`)
- `phone.html` – the page phones open
- `public/` – app icons
- `scripts/screenshots.mjs` – headless screenshots at several screen sizes
- `scripts/perf.mjs` – frame draw times at each animation level
- `scripts/table.mjs` – end-to-end check of a board with three phones
- `.github/workflows/` – CI on every push, and the GitHub Pages deploy on `main`
