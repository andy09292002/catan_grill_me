import { rollDie, cryptoRng, THIEF_NUMBER } from '../game/dice';
import type { Roll } from '../game/state';
import { el } from './dom';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function dieFace(value: number, className = 'die'): HTMLElement {
  const face = el('div', { class: className, 'aria-label': `Die showing ${value}` });
  for (let i = 0; i < 9; i++) face.append(el('span', { class: PIPS[value].includes(i) ? 'pip' : '' }));
  return face;
}

export const TUMBLE_MS = 700;

let hideTimer = 0;
let tumbleTimer = 0;

/**
 * Shows a roll in a banner turned towards the current player, near their side of the screen.
 * App rolls tumble the dice first; totals entered from physical dice show straight away.
 */
export function showRollBanner(roll: Roll, offset: { x: number; y: number }, angle: number) {
  document.querySelector('.banner')?.remove();
  clearTimeout(hideTimer);
  clearInterval(tumbleTimer);

  const seven = roll.total === THIEF_NUMBER;
  const banner = el('div', {
    class: `banner${seven ? ' seven' : ''}`,
    style: `--bx:${offset.x}px;--by:${offset.y}px;--angle:${angle}deg`,
    role: 'status',
    'aria-live': 'polite',
  });
  const total = el('div', { class: `banner-total${roll.total === 6 || roll.total === 8 ? ' red' : ''}` }, String(roll.total));
  const caption = el('div', { class: 'banner-caption' }, seven ? 'Move the thief' : roll.dice ? 'Rolled' : 'Entered');
  const dice = el('div', { class: 'banner-dice' });
  banner.append(dice, total, caption);
  document.body.append(banner);

  if (roll.dice) {
    const [a, b] = roll.dice;
    total.classList.add('hidden');
    caption.classList.add('hidden');
    const started = performance.now();
    const tumble = () => {
      if (performance.now() - started >= TUMBLE_MS) {
        clearInterval(tumbleTimer);
        dice.replaceChildren(dieFace(a), dieFace(b));
        total.classList.remove('hidden');
        caption.classList.remove('hidden');
        return;
      }
      dice.replaceChildren(dieFace(rollDie(cryptoRng), 'die tumbling'), dieFace(rollDie(cryptoRng), 'die tumbling'));
    };
    tumble();
    tumbleTimer = window.setInterval(tumble, 80);
  }

  hideTimer = window.setTimeout(
    () => {
      banner.classList.add('leaving');
      window.setTimeout(() => banner.remove(), 400);
    },
    (roll.dice ? TUMBLE_MS : 0) + (seven ? 4000 : 2600),
  );
}
