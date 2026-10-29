import { PLAYER_HEX, PLAYER_NAMES, seatAngle, seatDirection } from '../game/players';
import type { SeatView } from '../net/protocol';
import { el } from './dom';

/** Room the corner controls take, so badges stay out of them. */
const CORNER = 240;
const EDGE_GAP = 8;

/**
 * A badge at each player's edge of the screen, facing them, showing whether their phone is
 * connected. Tapping one offers to move that seat to another phone.
 */
export function renderSeatBadges(container: HTMLElement, seats: SeatView[] | null, onTap: (seat: number) => void) {
  container.replaceChildren();
  if (!seats) return;
  const hw = window.innerWidth / 2;
  const hh = window.innerHeight / 2;
  seats.forEach((s, seat) => {
    const a = seatAngle(seat, seats.length);
    const d = seatDirection(a);
    const badge = el(
      'button',
      {
        type: 'button',
        class: `seat-badge${s.connected ? '' : ' away'}`,
        style: `transform:translate(-50%,-50%) rotate(${a}deg);--player:${PLAYER_HEX[s.color]}`,
        'aria-label': `${PLAYER_NAMES[s.color]}: ${s.connected ? 'phone connected' : 'no phone'}. Tap to move to another phone`,
      },
      el('span', { class: 'dot' }),
      s.connected ? PLAYER_NAMES[s.color] : `${PLAYER_NAMES[s.color]} · no phone`,
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
