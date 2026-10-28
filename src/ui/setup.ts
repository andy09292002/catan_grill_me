import { boardSizeForPlayers, type RandomMode } from '../board/generate';
import type { BoardSize } from '../board/layout';
import { randomSeed } from '../board/rng';
import { cryptoRng } from '../game/dice';
import type { AnimationLevel } from '../game/prefs';
import {
  defaultColors,
  MAX_PLAYERS,
  MIN_PLAYERS,
  nextFreeColor,
  PLAYER_COLORS,
  PLAYER_HEX,
  PLAYER_NAMES,
  randomSeat,
  seatDirection,
  seatAngle,
  type PlayerColor,
} from '../game/players';
import type { NewGameOptions, ThiefStyle } from '../game/state';
import { el, overlay } from './dom';

export interface SetupDefaults {
  colors: PlayerColor[];
  size: BoardSize;
  mode: RandomMode;
  thiefStyle: ThiefStyle;
}

const THIEF_INFO: Record<ThiefStyle, [string, string]> = {
  onscreen: ['On-screen thief', 'Drawn on the board. After a 7, tap a tile to move it; its tile is blocked when its number is rolled.'],
  physical: ['Physical thief', 'Use your own thief piece. The board never responds to touch, and every matching tile lights up.'],
};

const MODE_INFO: Record<RandomMode, [string, string]> = {
  random: ['Purely random', 'Anything goes, including red numbers side by side.'],
  balanced: ['Balanced', 'No 6 or 8 next to each other.'],
  balancedPlus: ['Balanced+', 'Also no matching numbers side by side, and no more than two same-terrain tiles touching.'],
};

const ANIMATION_INFO: Record<AnimationLevel, [string, string]> = {
  full: ['Full', 'Sheep wander, wheat and trees sway, workers dig.'],
  calm: ['Calm', 'Gentle swaying only, at a lower frame rate.'],
  off: ['Off', 'A still board. Saves battery.'],
};

/**
 * The New game screen. Resolves with the chosen options, or null if cancelled.
 * `canCancel` is false on first launch, when there is no game to go back to.
 * Animation is a device setting, not part of a game, so it applies as soon as it's tapped.
 */
export function openSetup(
  defaults: SetupDefaults,
  canCancel: boolean,
  animation: { level: AnimationLevel; onChange: (level: AnimationLevel) => void },
): Promise<NewGameOptions | null> {
  let animationLevel = animation.level;
  let colors = defaults.colors.slice();
  let size = defaults.size;
  let sizeOverridden = size !== boardSizeForPlayers(colors.length);
  let mode = defaults.mode;
  let thiefStyle = defaults.thiefStyle;
  let firstSeat: number | 'random' = 'random';

  return overlay<NewGameOptions | null>((done) => {
    const dialog = el('div', { class: 'dialog setup', role: 'dialog', 'aria-label': 'New game' });

    const render = () => {
      dialog.replaceChildren(
        el('h2', {}, 'New game'),
        // Two columns on wide, short screens (see style.css); one column otherwise.
        el(
          'div',
          { class: 'setup-grid' },
          el(
            'div',
            {},
            section('Players', playersRow()),
            section('Seats', seatsDiagram(), el('p', { class: 'hint' }, 'Seats go clockwise from the bottom edge. Tap a seat to change its color.')),
            section('First player', firstRow()),
          ),
          el(
            'div',
            {},
            section('Board', sizeRow()),
            section('Random mode', modeRow(), el('p', { class: 'hint' }, MODE_INFO[mode][1])),
            section('Thief', thiefRow(), el('p', { class: 'hint' }, THIEF_INFO[thiefStyle][1])),
            section('Animation', animationRow(), el('p', { class: 'hint' }, `${ANIMATION_INFO[animationLevel][1]} Applies right away.`)),
          ),
        ),
        el('div', { class: 'actions' }, canCancel && action('Cancel', 'secondary', () => done(null)), action('Start game', 'primary', start)),
      );
    };

    const start = () =>
      done({
        colors,
        firstSeat: firstSeat === 'random' ? randomSeat(colors.length, cryptoRng) : firstSeat,
        size,
        mode,
        seed: randomSeed(),
        thiefStyle,
      });

    const playersRow = () =>
      segmented(
        Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => ({
          label: String(n),
          selected: n === colors.length,
          onClick: () => {
            colors = n <= colors.length ? colors.slice(0, n) : [...colors, ...defaultColors(MAX_PLAYERS).filter((c) => !colors.includes(c))].slice(0, n);
            if (!sizeOverridden) size = boardSizeForPlayers(n);
            if (typeof firstSeat === 'number' && firstSeat >= n) firstSeat = 'random';
            render();
          },
        })),
      );

    const seatsDiagram = () => {
      const table = el('div', { class: 'seat-table' });
      colors.forEach((c, seat) => {
        const d = seatDirection(seatAngle(seat, colors.length));
        const b = el(
          'button',
          {
            type: 'button',
            class: 'seat',
            style: `left:${50 + d.x * 42}%;top:${50 + d.y * 38}%;background:${PLAYER_HEX[c]}`,
            'aria-label': `Seat ${seat + 1}: ${PLAYER_NAMES[c]}. Tap to change color`,
          },
          String(seat + 1),
        );
        b.addEventListener('click', () => {
          colors = colors.map((col, s) => (s === seat ? nextFreeColor(colors, seat) : col));
          render();
        });
        table.append(b);
      });
      return table;
    };

    const firstRow = () =>
      segmented([
        { label: 'Random', selected: firstSeat === 'random', onClick: () => ((firstSeat = 'random'), render()) },
        ...colors.map((c, seat) => ({
          label: PLAYER_NAMES[c],
          color: PLAYER_HEX[c],
          selected: firstSeat === seat,
          onClick: () => ((firstSeat = seat), render()),
        })),
      ]);

    const sizeRow = () => {
      const recommended = boardSizeForPlayers(colors.length);
      return segmented(
        ([19, 30] as const).map((s) => ({
          label: `${s} hexes${s === recommended ? ' · recommended' : ''}`,
          selected: s === size,
          onClick: () => {
            size = s;
            sizeOverridden = s !== recommended;
            render();
          },
        })),
      );
    };

    const modeRow = () =>
      segmented(
        (Object.keys(MODE_INFO) as RandomMode[]).map((m) => ({
          label: MODE_INFO[m][0],
          selected: m === mode,
          onClick: () => ((mode = m), render()),
        })),
      );

    const thiefRow = () =>
      segmented(
        (Object.keys(THIEF_INFO) as ThiefStyle[]).map((t) => ({
          label: THIEF_INFO[t][0],
          selected: t === thiefStyle,
          onClick: () => ((thiefStyle = t), render()),
        })),
      );

    const animationRow = () =>
      segmented(
        (Object.keys(ANIMATION_INFO) as AnimationLevel[]).map((a) => ({
          label: ANIMATION_INFO[a][0],
          selected: a === animationLevel,
          onClick: () => {
            animationLevel = a;
            animation.onChange(a);
            render();
          },
        })),
      );

    render();
    return dialog;
  });
}

function section(title: string, ...content: HTMLElement[]) {
  return el('section', {}, el('h3', {}, title), ...content);
}

interface Option {
  label: string;
  selected: boolean;
  color?: string;
  onClick: () => void;
}

function segmented(options: Option[]) {
  const row = el('div', { class: 'segmented', role: 'radiogroup' });
  for (const o of options) {
    const b = el(
      'button',
      { type: 'button', class: `seg${o.selected ? ' selected' : ''}`, role: 'radio', 'aria-checked': o.selected ? 'true' : 'false' },
      o.color ? el('span', { class: 'dot', style: `background:${o.color}` }) : null,
      o.label,
    );
    b.addEventListener('click', o.onClick);
    row.append(b);
  }
  return row;
}

function action(label: string, kind: string, onClick: () => void) {
  const b = el('button', { type: 'button', class: `btn ${kind}` }, label);
  b.addEventListener('click', onClick);
  return b;
}

export const FIRST_LAUNCH_DEFAULTS: SetupDefaults = {
  colors: PLAYER_COLORS.slice(0, 4),
  size: 19,
  mode: 'balanced',
  thiefStyle: 'onscreen',
};
