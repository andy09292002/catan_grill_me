import { PLAYER_HEX, PLAYER_NAMES } from '../game/players';
import type { PhoneView, ServerMessage } from '../net/protocol';
import { openSocket } from '../net/socket';
import { el } from '../ui/dom';

// The phone page for Board + phones games. For now it claims a seat and shows whose turn it is;
// the hand of cards and the actions come with the rules.

const KEY_STORE = 'hex-board/seat';
const root = document.querySelector<HTMLElement>('#phone')!;

interface SeatKey {
  tableId: string;
  key: string;
}

function loadKey(): SeatKey | null {
  try {
    const k = JSON.parse(localStorage.getItem(KEY_STORE) ?? 'null');
    return k && typeof k.key === 'string' && typeof k.tableId === 'string' ? k : null;
  } catch {
    return null;
  }
}

function storeKey(k: SeatKey) {
  try {
    localStorage.setItem(KEY_STORE, JSON.stringify(k));
  } catch {
    // Without storage, a reconnect needs the rejoin code from the board.
  }
}

// A rejoin code from the board's QR is used once, then dropped from the address.
const params = new URLSearchParams(location.search);
let rejoin = params.get('rejoin') ?? undefined;
if (rejoin) history.replaceState(null, '', location.pathname);

let connected = false;
let view: PhoneView | null = null;
let kicked = false;
let noTable = false;

const socket = openSocket(
  () => {
    const hello = { type: 'hello' as const, role: 'phone' as const, key: loadKey()?.key, rejoin };
    rejoin = undefined;
    return hello;
  },
  onMessage,
  (c) => {
    connected = c;
    render();
  },
);

function onMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'welcome':
      kicked = false;
      storeKey({ tableId: msg.tableId, key: msg.key });
      return;
    case 'phone':
      view = msg.view;
      noTable = false;
      if (view.you !== null) kicked = false;
      break;
    case 'noTable':
      view = null;
      noTable = true;
      break;
    case 'kicked':
      kicked = true;
      break;
    default:
      return;
  }
  render();
}

function render() {
  document.body.style.removeProperty('--player');
  if (!connected && !view) return show(screen('Connecting to the board…', 'Make sure this phone is on the same Wi-Fi as the PC.'));
  if (kicked) return show(screen('This seat moved to another phone', 'To play here again, tap your seat on the board and scan its code.'));
  if (noTable || !view) return show(screen('No game yet', 'Start a Board + phones game on the board, then scan its code.'));

  const v = view;
  if (v.you === null) {
    const free = v.seats.map((s, seat) => ({ ...s, seat })).filter((s) => !s.claimed);
    if (!free.length) return show(screen('All seats are taken', 'To take over a seat, tap it on the board and scan its code.'));
    const buttons = free.map((s) => {
      const b = el('button', { type: 'button', class: 'pick', style: `--player:${PLAYER_HEX[s.color]}` }, PLAYER_NAMES[s.color]);
      b.addEventListener('click', () => socket.send({ type: 'claim', seat: s.seat }));
      return b;
    });
    return show(el('section', { class: 'screen' }, el('h1', {}, 'Pick your color'), el('div', { class: 'picks' }, ...buttons)));
  }

  const me = v.seats[v.you];
  document.body.style.setProperty('--player', PLAYER_HEX[me.color]);
  const joined = v.seats.filter((s) => s.claimed).length;
  const status = !v.started
    ? joined < v.seats.length
      ? `Waiting for players · ${joined} of ${v.seats.length} joined`
      : 'Everyone is in. Start the game on the board.'
    : v.current === v.you
      ? 'Your turn'
      : `${PLAYER_NAMES[v.seats[v.current].color]}'s turn`;
  show(
    el(
      'section',
      { class: `screen seated${v.started && v.current === v.you ? ' my-turn' : ''}` },
      el('div', { class: 'me' }, el('span', { class: 'dot' }), PLAYER_NAMES[me.color]),
      el('h1', {}, status),
      !connected && el('p', { class: 'hint' }, 'Reconnecting…'),
    ),
  );
}

function screen(title: string, hint: string) {
  return el('section', { class: 'screen' }, el('h1', {}, title), el('p', { class: 'hint' }, hint));
}

function show(node: HTMLElement) {
  root.replaceChildren(node);
}

render();
