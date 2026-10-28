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

export interface Placement {
  /** Offset from the screen centre, towards the current player. */
  offset: { x: number; y: number };
  /** Degrees the banner turns to face the current player. */
  angle: number;
}

/** A banner that stays up until closed, with one button, for "move the thief". */
export interface Prompt {
  caption: string;
  action: { label: string; onClick: () => void };
}

export interface BannerHandle {
  close(): void;
}

let hideTimer = 0;
let tumbleTimer = 0;

/**
 * Shows a roll, or a prompt with no roll, in a banner turned towards the current player.
 * App rolls tumble the dice first; totals entered from physical dice show straight away.
 * Without a prompt the banner fades on its own; with one it stays until closed.
 */
export function showBanner(where: Placement, roll: Roll | null, prompt?: Prompt): BannerHandle {
  document.querySelector('.banner')?.remove();
  clearTimeout(hideTimer);
  clearInterval(tumbleTimer);

  const seven = roll?.total === THIEF_NUMBER;
  const banner = el('div', {
    class: `banner${seven ? ' seven' : ''}${prompt ? ' prompt' : ''}`,
    style: `--bx:${where.offset.x}px;--by:${where.offset.y}px;--angle:${where.angle}deg`,
    role: 'status',
    'aria-live': 'polite',
  });
  const dice = el('div', { class: 'banner-dice' });
  const total = roll
    ? el('div', { class: `banner-total${roll.total === 6 || roll.total === 8 ? ' red' : ''}` }, String(roll.total))
    : el('div', { class: 'banner-thief', 'aria-hidden': 'true' });
  const caption = el(
    'div',
    { class: 'banner-caption' },
    prompt?.caption ?? (seven ? 'Move the thief' : roll?.dice ? 'Rolled' : 'Entered'),
  );
  const button = prompt ? el('button', { type: 'button', class: 'btn secondary banner-action' }, prompt.action.label) : null;
  button?.addEventListener('click', prompt!.action.onClick);
  banner.append(dice, total, caption);
  if (button) banner.append(button);
  document.body.append(banner);

  const reveal: HTMLElement[] = button ? [total, caption, button] : [total, caption];
  if (roll?.dice) {
    const [a, b] = roll.dice;
    reveal.forEach((n) => n.classList.add('hidden'));
    const started = performance.now();
    const tumble = () => {
      if (performance.now() - started >= TUMBLE_MS) {
        clearInterval(tumbleTimer);
        dice.replaceChildren(dieFace(a), dieFace(b));
        reveal.forEach((n) => n.classList.remove('hidden'));
        return;
      }
      dice.replaceChildren(dieFace(rollDie(cryptoRng), 'die tumbling'), dieFace(rollDie(cryptoRng), 'die tumbling'));
    };
    tumble();
    tumbleTimer = window.setInterval(tumble, 80);
  }

  const close = () => {
    clearTimeout(hideTimer);
    if (!banner.isConnected || banner.classList.contains('leaving')) return;
    banner.classList.add('leaving');
    window.setTimeout(() => banner.remove(), 400);
  };
  if (!prompt) hideTimer = window.setTimeout(close, (roll?.dice ? TUMBLE_MS : 0) + (seven ? 4000 : 2600));
  return { close };
}
