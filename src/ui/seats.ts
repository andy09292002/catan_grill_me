import { PLAYER_HEX, PLAYER_NAMES, seatAngle, seatDirection } from '../game/players';
import type { SeatView } from '../net/protocol';
import { el } from './dom';

/** Least room left for the corner controls, so badges stay out of them. */
const CORNER = 240;
const EDGE_GAP = 8;

export interface SeatStats {
  points: number;
  cards: number;
  devCards: number;
  knights: number;
  longestRoad: boolean;
  largestArmy: boolean;
}

/** More cards than this and a 7 costs half of them, so the panel warns. */
const SAFE_HAND = 7;

/**
 * A panel at each player's edge of the screen: points, how many cards they hold, and whether
 * their phone is connected. It faces into the table, so the other players read it; its owner
 * sees the same on their phone. Tapping one offers to move that seat to another phone.
 */
export function renderSeatBadges(container: HTMLElement, seats: SeatView[] | null, stats: SeatStats[], onTap: (seat: number) => void) {
  container.replaceChildren();
  if (!seats) return;
  seats.forEach((s, seat) => {
    const a = seatAngle(seat, seats.length);
    // Upside down for its owner, upright for the players across the table.
    const facing = a + 180;
    const st = stats[seat];
    const over = !!st && st.cards > SAFE_HAND;
    const badge = el(
      'button',
      {
        type: 'button',
        class: `seat-badge${s.connected ? '' : ' away'}${over ? ' over' : ''}`,
        style: `transform:translate(-50%,-50%) rotate(${facing}deg);--player:${PLAYER_HEX[s.color]}`,
        'aria-label': `${PLAYER_NAMES[s.color]}: ${st ? `${st.points} points, ${st.cards} cards, ${st.devCards} development cards, ` : ''}${s.connected ? 'phone connected' : 'no phone'}. Tap to move to another phone`,
      },
      el('span', { class: 'dot' }),
      el('span', { class: 'name' }, s.connected ? PLAYER_NAMES[s.color] : `${PLAYER_NAMES[s.color]} · no phone`),
      st && el('span', { class: 'stat', title: 'Points' }, el('b', {}, String(st.points)), ' pts'),
      st && el('span', { class: 'stat cards', title: 'Cards in hand' }, el('span', { class: 'card-icon' }), el('b', {}, String(st.cards))),
      st && st.devCards > 0 && el('span', { class: 'stat dev', title: 'Development cards' }, el('span', { class: 'card-icon dev' }), el('b', {}, String(st.devCards))),
      st && st.knights > 0 && el('span', { class: 'stat', title: 'Knights played' }, el('b', {}, String(st.knights)), st.knights === 1 ? ' knight' : ' knights'),
      st?.longestRoad && el('span', { class: 'award', title: 'Longest Road: 2 points' }, 'Longest Road'),
      st?.largestArmy && el('span', { class: 'award', title: 'Largest Army: 2 points' }, 'Largest Army'),
    );
    badge.addEventListener('click', () => onTap(seat));
    container.append(badge);
    placeAtEdge(badge, a);
  });
}

/**
 * Puts a (centred, turned) element at the screen edge in the direction of seat angle `a`,
 * `inset` pixels in from it and slid along the edge out of the corners. The element must
 * already be in the page, so its size is known.
 */
export function placeAtEdge(node: HTMLElement, a: number, inset = 0) {
  const hw = window.innerWidth / 2;
  const hh = window.innerHeight / 2;
  const d = seatDirection(a);
  // Half the size of the turned element, so it can sit right at the edge without clipping.
  const r = (a * Math.PI) / 180;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const hx = (w * Math.abs(Math.cos(r)) + h * Math.abs(Math.sin(r))) / 2;
  const hy = (w * Math.abs(Math.sin(r)) + h * Math.abs(Math.cos(r))) / 2;
  // Follow the seat's direction to the screen edge, then slide along it out of the corners.
  const reach = Math.min(Math.abs(d.x) > 1e-9 ? hw / Math.abs(d.x) : Infinity, Math.abs(d.y) > 1e-9 ? hh / Math.abs(d.y) : Infinity);
  let x = d.x * reach;
  let y = d.y * reach;
  // Between the two corners at the ends of this edge, however much room their controls take.
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
  if (Math.abs(x) >= hw - 1) {
    const side = x < 0 ? 'left' : 'right';
    x = Math.sign(x) * (hw - hx - EDGE_GAP - inset);
    y = clamp(y, -hh + cornerRoom(`top-${side}`, 'height') + hy, hh - cornerRoom(`bottom-${side}`, 'height') - hy);
  } else {
    const side = y < 0 ? 'top' : 'bottom';
    y = Math.sign(y) * (hh - hy - EDGE_GAP - inset);
    x = clamp(x, -hw + cornerRoom(`${side}-left`, 'width') + hx, hw - cornerRoom(`${side}-right`, 'width') - hx);
  }
  node.style.left = `${hw + x}px`;
  node.style.top = `${hh + y}px`;
}

/** How far a corner's controls reach along an edge. */
function cornerRoom(corner: string, along: 'width' | 'height'): number {
  const box = document.querySelector(`.corner.${corner}`)?.getBoundingClientRect();
  return Math.max(CORNER, (box?.[along] ?? 0) + EDGE_GAP);
}
