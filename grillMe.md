# Grill-me design record

A record of the `/grill-me` design session for the touch-screen hex board companion, held on 2026-10-27. Each question shows the recommendation offered and the decision that was made.

## Starting idea

> Create a project which can run on a PC with an external portable monitor with touch. The program should show a random game board on the screen and allow all players to place the physical pieces on the monitor.

Ground rule set before the session: the app is a companion for a physical copy of the game the players own. It generates and shows the board, rolls dice and helps with turns. It is not a digital version of the game's rules, and it does not use the official game name, logo or artwork.

---

## Questions and answers

### Q1. Scope of the app

What should the program do?

- (a) Board companion: random fair board, drawn under the physical pieces, dice rolls, highlight producing tiles. Players run the game with physical pieces, cards and bank.
- (b) The same, plus helpers: turn tracker and a tap-to-move robber marker.
- (c) A full rules engine (resources, legal builds, scoring). Out of scope.

**Recommended:** (a) for version 1, (b) as a second milestone.

**Answer:** No full game engine. Players play the game outside the program.

**Decision:** Board companion only. (The turn tracker and thief later came into version 1 through Q10 and Q17.)

### Q2. Does the app need to know where the physical pieces are?

- (a) Stay passive: draw the board, don't track pieces.
- (b) Detect pieces with conductive feet or a camera.

**Recommended:** (a).

**Answer:** The app does not need to know where the physical pieces are.

**Decision:** No piece detection or tracking.

### Q3. Where does touch work?

- (a) Only in the side or corner controls; the board ignores every touch.
- (b) The board also responds to touch, behind a long press.
- (c) No touch; mouse and keyboard only.

**Recommended:** (a).

**Answer:** (a).

**Decision:** Touch works only in the controls; the board ignores touch. (Q10 later adds one exception: "move thief" mode.)

### Q4. Tech stack

- (a) Web app: TypeScript and HTML canvas, full screen in Chrome or Edge.
- (b) Python desktop app (pygame).
- (c) Desktop app (Electron or Tauri).

**Follow-up from user:** Which option is better for moving to an iPad later?

**Explanation given:** A web app runs on the iPad as is (Safari, Add to Home Screen, works offline) and can be wrapped with Capacitor for the App Store later. pygame and Electron do not run on iPad. Planning for iPad means handling 4:3 screens, touch-first controls and offline use.

**Answer:** Make it responsive and allow multiple resolutions.

**Decision:** Web app in TypeScript and HTML canvas, built with Vite. Responsive to any resolution and screen shape, touch-first, works offline.

### Q5. Board size

- (a) Only the standard 19-hex board (3–4 players).
- (b) The 19-hex board plus the larger 30-hex board (5–6 players).

**Recommended:** (a) for version 1, with room for the larger board later.

**Answer:** Support both, and choose which one when starting a new game.

**Decision:** Both 19-hex and 30-hex boards, chosen on the New game screen.

### Q6. How big are the hexes?

- (a) Fill the screen: the board scales to the available space.
- (b) Match a physical size through a one-time calibration.

**Recommended:** (a) for version 1.

**Answer:** As big as possible, filling most of the screen.

**Decision:** The board scales to fill as much of the screen as possible.

### Q7. Where do the controls go?

- (a) Use the empty corners around the hex board.
- (b) Fixed side panels.
- (c) A slide-out drawer.

**Recommended:** (a).

**Answer:** (a).

**Decision:** Controls sit in the empty corners; the board takes the remaining space.

### Q8. Dice

- (a) The app rolls.
- (b) Players roll physical dice and tap the total on a 2–12 number pad.
- (c) Both.

**Recommended:** (a), with the number pad later.

**Answer:** Both.

**Decision:** An animated Roll button plus a 2–12 number pad for physical dice.

### Q9. What the board shows after a roll

- Duration: (a) matching tiles stay lit until the next roll, or (b) flash for a few seconds and then return to normal.
- On a 7: a short banner, or nothing.

**Recommended:** (a) plus a banner on a 7.

**Answer:** Tiles flash for a few seconds and then stay lit. On a 7, the user wants to tap a tile to move the thief, and the thief is drawn on the board.

**Decision:** Matching tiles flash, then stay lit until the next roll. The thief is drawn on the board and moved by tapping (settled in Q10).

### Q10. Thief style and when the board accepts a tap

Original options:

- (a) Only in "move thief" mode, after a 7 or a Move thief button; the next tap moves the thief, Cancel exits.
- (b) Always accept a long press to move the thief.

**Answer:** Also allow players to use a physical thief instead.

**Updated proposal:** Thief style is chosen on the New game screen.

- On-screen thief: drawn on the board, starts on the desert. A 7 or the Move thief corner button turns on "move thief" mode; the next tap on a tile moves it; Cancel exits. Outside this mode the board ignores touch.
- Physical thief: nothing drawn, the board never accepts touches, and a 7 shows a short "7: move the thief" banner.

**Recommended:** Both styles; on-screen is the default; the last choice is remembered.

**Answer:** Yes.

**Decision:** As proposed.

### Q11. How random is a random board?

- (a) Purely random.
- (b) Balanced: no 6 or 8 next to each other.
- (c) Balanced+: also no matching numbers next to each other and at most two same-terrain tiles touching.

**Recommended:** (b) as default, with a setting for all three.

**Answer:** All three, chosen when starting the game.

**Decision:** A Random mode setting on the New game screen: Purely random, Balanced (default), Balanced+.

### Q12. Harbors

**Question from user:** Do harbors appear in the 2–4 player game?

**Explanation given:** Yes. The 19-hex board has 9 harbors (4 generic 3:1, 5 specific 2:1). The 30-hex board has 11. There is no official 2-player mode; with 2 players the 19-hex board is used, harbors included.

**Proposal:** Draw randomized harbors, with an on/off setting for physical harbor pieces.

**Answer:** No on/off setting; just draw them on screen.

**Decision:** Harbors are always drawn: 9 on the 19-hex board, 11 on the 30-hex board.

### Q13. The thief's tile on a roll (on-screen thief)

- (a) Show it blocked: the tile doesn't light up and shows a blocked mark.
- (b) Light it up like the others.

**Recommended:** (a).

**Answer:** Draw the tile with a red blocking sign on top.

**Decision:** When the thief's tile number is rolled, the tile doesn't light up and gets a red blocking sign. With the physical thief, every matching tile lights up as normal.

### Q14. Saving the game

**Proposal:** Save automatically and restore when the app opens; ask "Replace the current board?" before starting a new game over one in progress.

**Question from user:** How is the game saved technically?

**Explanation given:** The game state is a small JSON object (about 2 KB: board size, random mode, thief style, tiles, harbors, thief tile, last roll, history) stored in the browser's storage on that device. No server or account needed. It survives refreshes, restarts and being offline; it stays on that device and browser; it's lost if browser data is cleared.

**Answer:** Save it in the browser session.

**Clarification:** sessionStorage is wiped when the tab or browser closes; localStorage survives closing the browser and restarting the PC.

**Answer:** localStorage.

**Decision:** Save to localStorage on every change, restore on open, and ask "Replace the current board?" before replacing a game in progress.

### Q15. Art and naming

**Proposal:** An original look drawn in code (based on the mockup), with generic terrain names (Forest, Field, Hills, Pasture, Mountain, Desert) and a neutral app title, without the official game name, logo or artwork.

**Answer:** Add movement: sheep running around, wheat and trees moving in the wind, people digging ore or brick.

**Decision:** Original art drawn in code, generic names, plus animated scenes.

### Q16. Animation level

**Proposal:**

- Settings: Full (everything moves), Calm (slow sway only), Off (still board).
- Animations stay inside each tile's middle, away from corners (settlements), edges (roads) and the number token.
- Target 60 fps; drop to Calm automatically on slow devices.

**Recommended:** Full as default.

**Answer:** Yes.

**Decision:** As proposed.

### Q17. Reading the board from all sides

- (a) Everything upright for one side.
- (b) Readable from any side (pips, underlined 6 and 9, rotation-neutral icons, dice shown in two corners).
- (c) Rotate the screen toward whoever is rolling.

**Recommended:** (b).

**Answer:** (c), rotating by the number of players, for example 120° each for 3 players.

**Note given:** Rotating the whole board would move tiles out from under the physical pieces, and the 30-hex board isn't symmetric.

**Updated proposal:**

- Tiles and harbors never move; only text rotates (number tokens, dice result, banners, corner controls).
- Player count (2–6) chosen on the New game screen; seats spaced evenly (3 players: 0°, 120°, 240°).
- A Next turn button rotates to the next player, which brings the turn tracker into version 1.
- Rotation animates over about half a second.

**Answer:** Yes. Rotate text only and keep the tiles where they are.

**Decision:** As proposed.

### Q18. Player setup

**Proposal:** Each seat gets a color matching that player's physical pieces (red, blue, white, orange, green, brown), with no names. The current player is shown by a colored glow along their side of the screen. The first player is random, with an option to choose a seat.

**Question from user:** Can you show more of how it works?

**Shown:** An interactive demo of player count, seat colors, choosing the first player, Next turn rotation and roll highlighting.

**Answer:** Yes, OK.

**Decision:** As proposed.

### Q19. Player count and board size

- (a) Automatic: 2–4 players get 19 hexes, 5–6 get 30 hexes.
- (b) Automatic, with an override.
- (c) Separate choices.

**Recommended:** (b).

**Answer:** (b).

**Decision:** The board size follows the player count, with an override on the New game screen.

### Q20. Protecting the screen

- (a) Matte anti-glare screen protector film.
- (b) Thick acrylic or glass sheet (may block touch).
- (c) Nothing.

**Recommended:** (a).

**Answer:** (a). No need to consider protection from the program's point of view.

**Decision:** Matte anti-glare film; the program doesn't account for it.

### Q21. How the app is hosted and opened

- (a) GitHub Pages plus an installable web app.
- (b) Local only, with a launcher script.
- (c) Both.

**Recommended:** (a).

**Answer:** (a).

**Decision:** Published to GitHub Pages and installed as a web app from Chrome or Edge on the PC (Add to Home Screen on iPad later). Works offline after the first load. Merging to `main` deploys.

### Q22. Build order

**Proposal:** Board → Game flow → Thief → Animation → Install and publish, with the question of moving publishing earlier.

**Answer:** Yes, move publishing earlier, and leave the iPad for later; test on the portable monitor first.

**Decision:**

1. Board
2. Publish to GitHub Pages and install on the PC
3. Game flow
4. Thief
5. Animation

iPad support comes after version 1; the layout stays responsive throughout.

### Q23. Testing

**Proposal:**

- Vitest tests for board generation, dice, save and restore, turn order and rotation.
- Automated screenshots at 1920×1080, 1366×768, 2560×1440 and a 4:3 shape.
- A hands-on checklist on the real touch monitor at each milestone.
- Tests run on every push; a failing test blocks the deploy.

**Answer:** Yes for all three.

**Decision:** As proposed.

### Q24. Git workflow

- Branch and pull request per milestone; the user reviews and merges; merging deploys; no direct pushes to `main` or merges without approval.
- Or: commit and push straight to `main` after each milestone.

**Recommended:** The first option.

**Answer:** First option.

**Decision:** A branch and pull request per milestone.

---

## Summary

A touch-screen board companion for the physical game the players own. The board is shown on a portable touch monitor lying flat on the table, and players put their physical pieces on top. The game itself is played outside the program.

**Scope**
- No rules engine, and no detection or tracking of physical pieces.
- Touch works only in the corner controls, plus the board during "move thief" mode.

**Board**
- 19-hex board (2–4 players) and 30-hex board (5–6 players). Size follows the player count, with an override.
- Random modes: Purely random, Balanced (default, no 6 or 8 next to each other), Balanced+.
- Harbors always drawn: 9 on the 19-hex board, 11 on the 30-hex board.
- The board fills as much of the screen as possible, with controls in the empty corners. Responsive to any resolution and screen shape.

**Play**
- Dice: an animated Roll button plus a 2–12 number pad for physical dice.
- After a roll: matching tiles flash, then stay lit until the next roll.
- Players: 2–6 seats, each with a color and no names. First player random or chosen by tapping. Next turn rotates the text, never the tiles, to face the current player, and their side of the screen glows.
- Thief style, chosen per game, last choice remembered:
  - On-screen (default): starts on the desert. A 7 or the Move thief button turns on "move thief" mode; tap a tile to move it, or Cancel. A blocked tile shows a red sign instead of lighting up.
  - Physical: a 7 shows a banner, and the board never accepts touches.
- Saving: localStorage on every change; "Replace the current board?" before a new game.

**Look**
- Original art drawn in code, with generic terrain names: Forest, Field, Hills, Pasture, Mountain, Desert.
- Animated scenes: wandering sheep, wheat and trees swaying in the wind, workers digging ore and brick. Animations stay clear of corners, edges and tokens.
- Animation levels: Full (default), Calm, Off, with an automatic drop to Calm on slow devices.

**Tech**
- TypeScript, HTML canvas and Vite, built as an installable web app that works offline.
- Hosted on GitHub Pages; merging a pull request into `main` deploys.
- Tested on the portable monitor first; iPad support after version 1.

**Quality**
- Vitest logic tests, plus automatic screenshots at 1920×1080, 1366×768, 2560×1440 and a 4:3 shape.
- A hands-on checklist for the monitor at each milestone.
- Tests run on every push; a failing test blocks the deploy.

**Milestones** (one branch and pull request each)
1. Board
2. Publish and install on the PC
3. Game flow
4. Thief
5. Animation

## Assumptions (confirmed 2026-10-27)

- App title "Hex Board", without the official game's name or logo. The repo name can stay as it is.
- Harbor labels are an icon plus the trade ratio (3:1 or 2:1). The labels rotate with the other text; the harbors themselves stay put.
- The repo is public, which GitHub Pages on a free account requires.
- Corner layout: Roll and the number pad in one corner, Next turn in another, New game and settings in a third, last roll and roll history in the fourth.
- A 7 entered on the number pad triggers the same thief flow as a 7 from the Roll button.

---

# Session 2: Board + phones mode

A second `/grill-me` session, held on 2026-10-28.

## Starting idea

> Can I use mobile phones to interact with the board, so everyone gets a phone to hide their cards and make decisions on the phone?

This reopens two decisions from session 1: Q1 (no rules engine) and Q2 (the app doesn't know where pieces are). They still hold for Board only mode. The new mode below is where they change.

## Questions and answers

### P1. How much does the app know about the game?

- (a) Phone as a private card wallet: players tap +/− on their own cards, and the board still knows nothing.
- (b) The app knows where the pieces are, deals cards and runs the rules.
- (c) In between: automatic dealing, with manual building and trading.

**Recommended:** (a).

**Answer:** Two modes: one is the board monitor only, played physically, where the system doesn't know the situation. The other is the board monitor plus phones, running the game fully digitally.

**Decision:** Two modes, chosen per game. **Board only** is today's app, unchanged. **Board + phones** runs the full rules (option b).

### P2. In Board + phones mode, are the pieces physical or drawn?

- (a) Drawn by the app.
- (b) Physical pieces, also entered into the app.
- (c) Both.

**Recommended:** (a).

**Answer:** Drawn on screen.

**Decision:** The app draws every road, settlement and city in the seat color. No physical pieces go on the monitor in this mode.

### P3. How do phones talk to the board?

- (a) A direct WebRTC link, set up through a free public service. Keeps GitHub Pages.
- (b) A small server on the PC, over home Wi-Fi.
- (c) A hosted online database.

**Recommended:** (a).

**Answer:** Try (a), if it doesn't require internet.

Follow-up: (a) needs the internet to load the phone page and for the handshake. The board has no camera, so a two-way QR handshake can't replace it. Only (b) works without internet.

**Answer:** Local server only is OK.

**Decision:** Board + phones runs from a small server on the PC (`npm run table`). Phones join over the same Wi-Fi by QR code, with no internet. Board only mode stays on GitHub Pages.

### P4. Which rules?

- (a) Base game for 3–4 players.
- (b) (a) plus the 5–6 player extension.
- (c) (b) plus expansions.

**Recommended:** (b).

**Answer:** (b), 2–6 players, base game only.

**Decision:** Base game only, no expansions, for 2–6 players. 5–6 players use the 30-hex board and the special build phase.

### P5. Two players

- (a) The same rules with 2 seats on the 19-hex board.
- (b) A 2-player variant with neutral pieces.

**Recommended:** (a). **Answer:** (a).

**Decision:** No special 2-player rules.

### P6. Where are build spots picked?

- (a) On the phone's map.
- (b) On the board monitor.
- (c) Either, confirmed on the phone.

**Recommended:** (c).

**Answer:** On the board only.

**Decision:** The phone starts the action, the legal spots light up on the board in the player's color, and the player taps one on the board.

### P7. How is a build confirmed?

- (a) Tap on the board, confirm on the phone.
- (b) Tap on the board, confirm with ✓ / ✗ on the board.
- (c) No confirm, but undo.

**Recommended:** (a). **Answer:** (b).

**Decision:** Tapping a spot shows a preview piece, and a ✓ / ✗ next to it places or cancels the build. The board takes those taps only while a build is waiting.

### P8. Player trades

- (a) Talk it out, then the current player sends the deal to one player, who accepts or declines.
- (b) An open offer to everyone.
- (c) Both.

**Recommended:** (a). **Answer:** (a).

**Decision:** Direct offers to one player. Bank and harbor trades happen on your own phone at your best rate.

### P9. What the board shows about each player

- (a) A panel at each player's edge, facing them.
- (b) Points only.
- (c) Nothing.

**Recommended:** (a). **Answer:** (a).

**Decision:** Each panel shows public points (without hidden victory-point cards), the number of resource cards, the number of development cards, knights played, and the Largest Army and Longest Road badges. It glows when the player holds more than 7 cards.

### P10. Joining and dropped phones

- (a) A seat key on each phone, plus a rejoin QR code on the board.
- (b) The same, plus a PIN.

**Recommended:** (a). **Answer:** (a).

**Decision:** Reopening the page puts a player back in their seat. Tapping a seat's panel on the board shows a rejoin QR code that moves the seat to another phone, and the old key stops working. The game waits only when it needs the missing player. The server saves the game to a file after every action and resumes after a restart.

### P11. Dice

- (a) Roll on the phone.
- (b) Roll on the phone, or roll physical dice and key them in on the phone.
- (c) Roll on the board.

**Recommended:** (b).

**Answer:** Roll on the phone, or on the board, or roll physical dice and key them in.

**Decision:** All three ways, and every way rolls for the current player: the phone's Roll button, the board's Roll button, or physical dice keyed into the phone's or the board's number pad.

### P12. The thief and stealing

- (a) Move the thief on the board, choose the victim on the phone, take a random card.
- (b) Everything on the board.

**Recommended:** (a).

**Answer:** (a), but not a random card. The thief sees the victim's cards face down (5 cards means 5 backs) and picks one. The card at that position is taken from the victim.

**Decision:** The thief moves on the board with ✓ / ✗. The victim is chosen on the phone, then the victim's cards appear face down and the thief picks one. On a 7, discards happen on every phone at the same time.

### P13. Order of the face-down cards

- (a) Shuffled fresh for each steal.
- (b) The victim arranges their own hand.

**Recommended:** (a). **Answer:** (a), shuffled every time.

**Decision:** A fresh shuffle for every steal. The victim's phone shows the same shuffled order, so the card at the picked position is the one that leaves.

### P14. Mistakes

- (a) No undo.
- (b) Undo your own last action until anyone else learns something.
- (c) A table-wide rewind.

**Recommended:** (b).

**Answer:** No undo for buying or trading.

**Decision:** Players can undo their own last road, settlement or city until anything else happens. Buying a development card and all trades are final.

### P15. Starting a digital game

- (a) Set up on the board's New game screen, then the phones claim seats.
- (b) The first phone hosts.

**Recommended:** (a). **Answer:** (a).

**Decision:** The New game screen gains **Mode: Board only / Board + phones**. The board shows a QR code, each phone claims a free color, and Start appears once every seat has a phone. Setup placement follows the snake order.

### P16. Ending the game

- (a) An automatic win at 10 points.
- (b) The player claims the win.

**Recommended:** (a). **Answer:** Automatic.

**Decision:** The game ends as soon as the current player reaches 10 points, counting hidden victory-point cards. The board reveals those cards and shows the winner and final scores, each phone shows a summary, and Rematch keeps the same phones and seats.

### P17. Phone layout

- (a) Portrait, with the hand at the bottom.
- (b) Landscape.

**Recommended:** (a).

**Answer:** Landscape, like holding cards fanned in one hand.

**Decision:** Landscape, with the cards fanned in an arc and the action buttons alongside. A phone held upright asks to be turned sideways.

### P18. Where the rules run

- (a) The PC server is the only judge, and each device receives only what it may see.
- (b) Every device runs the rules.

**Recommended:** (a). **Answer:** (a), a single judge on the PC.

**Decision:** Node and WebSockets in the same repo. The rules engine is plain TypeScript with no screen code. Phones never receive other players' hidden cards. A double-click exe comes later.

### P19. Testing

- (a) Rules unit tests, simulated bot games and screen tests.
- (b) Rules unit tests and screen tests.

**Recommended:** (a).

**Answer:** (a), with a unit test for each rule.

**Decision:** Vitest unit tests for each rule. Thousands of simulated bot games through the real server, checking that cards are never created or lost, nothing illegal is accepted and every game ends. Playwright screen tests of the board with 2–6 phones. A checklist for real phones and the touch monitor.

### P20. Build order

- (a) Five milestones.
- (b) Fewer, bigger milestones.

**Recommended:** (a). **Answer:** (a).

**Decision:** M6 to M10, listed in the summary below.

## Summary (session 2)

**Modes:** Board only (unchanged, GitHub Pages) and Board + phones (full base-game rules, pieces drawn by the app).

**Rules:** base game for 2–6 players. 5–6 players use the 30-hex board and the special build phase.

**Connection:** a local Node server on the PC with WebSockets and no internet. The server is the only judge, and each phone receives only its own hidden information.

**At the table**
- Set up on the board, and phones claim seats by QR code.
- Seat keys handle reconnecting, and a rejoin QR code moves a seat to another phone.
- The game is saved to a file after every action.
- Builds start on the phone, are picked on the board and are confirmed with ✓ / ✗ on the board. Only builds can be undone.
- Roll on a phone, on the board, or with physical dice keyed in.
- Trades: talk it out, then send the deal to one player. Bank and harbor trades are on your own phone.
- The 7: discards at the same time on every phone, the thief moved on the board, the victim picked on the phone, and a pick among the victim's shuffled face-down cards.
- Each player has a panel at their edge with public points, card counts, knights and badges.
- Landscape phones with cards fanned in an arc.
- An automatic win at 10 with a reveal, then Rematch.

**Milestones**
6. Local server and joining: `npm run table`, the Mode choice, QR code, seat claiming, seat keys, rejoin, the save file.
7. Rules engine: setup placement, rolling, production, building with ✓ / ✗ and undo, bank, harbor and player trades, player panels, the phone hand.
8. The 7: discards, the thief, face-down steals.
9. Development cards, Largest Army, Longest Road, winning, the end screen.
10. 5–6 players with the special build phase, and the double-click exe.

## Assumptions (session 2)

- The animation levels and the text rotation work the same in both modes.
- Drawn roads, settlements and cities use original art in the seat colors.
- An action log on the phones, and brief toasts on the board.
- No turn timer and no sounds.
- The same rule as session 1: no official names, logo or artwork.
