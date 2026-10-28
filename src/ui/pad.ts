import { el, overlay } from './dom';

/** Number pad for totals rolled on physical dice. Resolves with 2–12, or null if closed. */
export function openPad(): Promise<number | null> {
  return overlay<number | null>(
    (done) => {
      const grid = el('div', { class: 'pad-grid' });
      for (let n = 2; n <= 12; n++) {
        const b = el('button', { type: 'button', class: `pad-key${n === 6 || n === 8 ? ' red' : ''}${n === 7 ? ' seven' : ''}` }, String(n));
        b.addEventListener('click', () => done(n));
        grid.append(b);
      }
      const close = el('button', { type: 'button', class: 'pad-key close', 'aria-label': 'Close' }, '✕');
      close.addEventListener('click', () => done(null));
      grid.append(close);
      return el('div', { class: 'pad rot', role: 'dialog', 'aria-label': 'Enter the dice total' }, el('p', {}, 'Dice total'), grid);
    },
    'pad-overlay',
  );
}
