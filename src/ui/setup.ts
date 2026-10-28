import { boardSizeForPlayers, type RandomMode } from '../board/generate';
import type { BoardSize } from '../board/layout';
import { randomSeed } from '../board/rng';
import { cryptoRng } from '../game/dice';
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
import type { NewGameOptions } from '../game/state';
import { el, overlay } from './dom';

export interface SetupDefaults {
  colors: PlayerColor[];
  size: BoardSize;
  mode: RandomMode;
}

const MODE_INFO: Record<RandomMode, [string, string]> = {
  random: ['Purely random', 'Anything goes, including red numbers side by side.'],
  balanced: ['Balanced', 'No 6 or 8 next to each other.'],
  balancedPlus: ['Balanced+', 'Also no matching numbers side by side, and no more than two same-terrain tiles touching.'],
};

/**
 * The New game screen. Resolves with the chosen options, or null if cancelled.
 * `canCancel` is false on first launch, when there is no game to go back to.
 */
export function openSetup(defaults: SetupDefaults, canCancel: boolean): Promise<NewGameOptions | null> {
  let colors = defaults.colors.slice();
  let size = defaults.size;
  let sizeOverridden = size !== boardSizeForPlayers(colors.length);
  let mode = defaults.mode;
  let firstSeat: number | 'random' = 'random';

  return overlay<NewGameOptions | null>((done) => {
    const dialog = el('div', { class: 'dialog setup', role: 'dialog', 'aria-label': 'New game' });

    const render = () => {
      dialog.replaceChildren(
        el('h2', {}, 'New game'),
        section('Players', playersRow()),
        section('Seats', seatsDiagram(), el('p', { class: 'hint' }, 'Seats go clockwise from the bottom edge. Tap a seat to change its color.')),
        section('First player', firstRow()),
        section('Board', sizeRow()),
        section('Random mode', modeRow(), el('p', { class: 'hint' }, MODE_INFO[mode][1])),
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

export const FIRST_LAUNCH_DEFAULTS: SetupDefaults = { colors: PLAYER_COLORS.slice(0, 4), size: 19, mode: 'balanced' };
