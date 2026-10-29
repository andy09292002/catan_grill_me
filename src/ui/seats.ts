import { PLAYER_HEX, PLAYER_NAMES, seatAngle, seatDirection } from '../game/players';
import type { SeatView } from '../net/protocol';
import { el } from './dom';

/** Room the corner controls take, so badges stay out of them. */
const CORNER = 240;
const EDGE_GAP = 8;

export interface SeatStats {
  points: number;
  cards: number;
}

/** More cards than this and a 7 costs half of them, so the panel warns. */
const SAFE_HAND = 7;

/**
 * A panel at each player's edge of the screen, facing them: points, how many cards they hold,
 * and whether their phone is connected. Tapping one offers to move that seat to another phone.
 */
export function renderSeatBadges(container: HTMLElement, seats: SeatView[] | null, stats: SeatStats[], onTap: (seat: number) => void) {
  container.replaceChildren();
  if (!seats) return;
  const hw = window.innerWidth / 2;
  const hh = window.innerHeight / 2;
  seats.forEach((s, seat) => {
    const a = seatAngle(seat, seats.length);
    const d = seatDirection(a);
    const st = stats[seat];
    const over = !!st && st.cards > SAFE_HAND;
    const badge = el(
      'button',
      {
        type: 'button',
        class: `seat-badge${s.connected ? '' : ' away'}${over ? ' over' : ''}`,
        style: `transform:translate(-50%,-50%) rotate(${a}deg);--player:${PLAYER_HEX[s.color]}`,
        'aria-label': `${PLAYER_NAMES[s.color]}: ${st ? `${st.points} points, ${st.cards} cards, ` : ''}${s.connected ? 'phone connected' : 'no phone'}. Tap to move to another phone`,
      },
      el('span', { class: 'dot' }),
      el('span', { class: 'name' }, s.connected ? PLAYER_NAMES[s.color] : `${PLAYER_NAMES[s.color]} · no phone`),
      st && el('span', { class: 'stat', title: 'Points' }, el('b', {}, String(st.points)), ' pts'),
      st && el('span', { class: 'stat cards', title: 'Cards in hand' }, el('span', { class: 'card-icon' }), el('b', {}, String(st.cards))),
    );
    badge.addEventListener('click', () => onTap(seat));
    container.append(badge);

    // Half the size of the turned badge, so it can sit right at the edge without clipping.
    const r = (a * Math.PI) / 180;
    const w = badge.offsetWidth;
    const h = badge.offsetHeight;
    const hx = (w * Math.abs(Math.cos(r)) + h * Math.abs(Math.sin(r))) / 2;
    const hy = (w * Math.abs(Math.sin(r)) + h * Math.abs(Math.cos(r))) / 2;
    // Follow the seat's direction to the screen edge, then slide along it out of the corners.
    const reach = Math.min(Math.abs(d.x) > 1e-9 ? hw / Math.abs(d.x) : Infinity, Math.abs(d.y) > 1e-9 ? hh / Math.abs(d.y) : Infinity);
    let x = d.x * reach;
    let y = d.y * reach;
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    if (Math.abs(x) >= hw - 1) {
      x = Math.sign(x) * (hw - hx - EDGE_GAP);
      y = clamp(y, hh - CORNER - hy);
    } else {
      y = Math.sign(y) * (hh - hy - EDGE_GAP);
      x = clamp(x, hw - CORNER - hx);
    }
    badge.style.left = `${hw + x}px`;
    badge.style.top = `${hh + y}px`;
  });
}
