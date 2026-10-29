import { PLAYER_HEX, PLAYER_NAMES } from '../game/players';
import type { PhoneView, ServerMessage } from '../net/protocol';
import { openSocket } from '../net/socket';
import { COSTS, hand, handSize, RESOURCE_NAMES, RESOURCES, type Action, type BuildKind, type Hand, type Resource } from '../rules/engine';
import { el } from '../ui/dom';
import { card, chip } from './cards';

// The phone page for Board + phones games: your hand of cards, held sideways, and what you can
// do with it. The board shows the map; pieces are started here and placed there.

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

/** The open sheet over the hand, if any. */
let sheet: 'trade' | 'pad' | null = null;
let tradeWith: number | 'bank' = 'bank';
let bankGive: Resource | null = null;
let bankGet: Resource | null = null;
let offerGive = hand();
let offerGet = hand();

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

const act = (action: Action) => socket.send({ type: 'act', action });

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
      // A sheet that no longer applies closes by itself.
      if (sheet === 'trade' && !view.me?.can.trade) sheet = null;
      if (sheet === 'pad' && !view.me?.can.roll) sheet = null;
      break;
    case 'noTable':
      view = null;
      noTable = true;
      break;
    case 'kicked':
      kicked = true;
      break;
    case 'error':
      toast(msg.message);
      return;
    default:
      return;
  }
  render();
}

const colorName = (v: PhoneView, seat: number) => PLAYER_NAMES[v.seats[seat].color];

function render() {
  document.body.style.removeProperty('--player');
  if (!connected && !view) return show(screen('Connecting to the board…', 'Make sure this phone is on the same Wi-Fi as the PC.'));
  if (kicked) return show(screen('This seat moved to another phone', 'To play here again, tap your seat on the board and scan its code.'));
  if (noTable || !view) return show(screen('No game yet', 'Start a Board + phones game on the board, then scan its code.'));

  const v = view;
  if (v.you === null) {
    const free = v.seats.map((s, seat) => ({ ...s, seat })).filter((s) => !s.claimed);
    if (!free.length) return show(screen('All seats are taken', 'To take over a seat, tap it on the board and scan its code.'));
    const buttons = free.map((s) => button(PLAYER_NAMES[s.color], 'pick', () => socket.send({ type: 'claim', seat: s.seat }), `--player:${PLAYER_HEX[s.color]}`));
    return show(el('section', { class: 'screen' }, el('h1', {}, 'Pick your color'), el('div', { class: 'picks' }, ...buttons)));
  }

  const me = v.seats[v.you];
  document.body.style.setProperty('--player', PLAYER_HEX[me.color]);
  if (!v.started || !v.me) {
    const joined = v.seats.filter((s) => s.claimed).length;
    const status = joined < v.seats.length ? `Waiting for players · ${joined} of ${v.seats.length} joined` : 'Everyone is in. Start the game on the board.';
    return show(el('section', { class: 'screen seated' }, el('div', { class: 'me' }, el('span', { class: 'dot' }), PLAYER_NAMES[me.color]), el('h1', {}, status)));
  }

  show(
    el(
      'section',
      { class: `play${v.current === v.you ? ' my-turn' : ''}` },
      topBar(v),
      el('div', { class: 'middle' }, actions(v), handView(v.me.hand)),
      el('footer', { class: 'log' }, v.log[0]?.text ?? ''),
      offerOverlay(v),
      sheet === 'trade' ? tradeSheet(v) : null,
      sheet === 'pad' ? padSheet() : null,
    ),
  );
}

function topBar(v: PhoneView) {
  const me = v.me!;
  const mine = v.current === v.you;
  let status: string;
  if (v.phase === 'setup') {
    status = me.placing ? `Tap a glowing spot on the board for your ${me.placing}, then ✓` : me.setupNeed ? `Setup: place a ${me.setupNeed}` : `${colorName(v, v.current)} is placing`;
  } else if (me.placing) {
    status = `Tap a glowing spot on the board for your ${me.placing}, then ✓`;
  } else if (mine) {
    status = me.can.roll ? 'Your turn: roll the dice' : 'Your turn';
  } else {
    status = `${colorName(v, v.current)}'s turn`;
  }
  return el(
    'header',
    { class: 'bar' },
    el('span', { class: 'me' }, el('span', { class: 'dot' }), PLAYER_NAMES[v.seats[v.you!].color]),
    el('span', { class: 'points' }, el('b', {}, String(me.points)), ' pts'),
    el('span', { class: 'status' }, status),
    !connected && el('span', { class: 'warn' }, 'Reconnecting…'),
    v.lastRoll && el('span', { class: `last-roll${v.lastRoll.total === 6 || v.lastRoll.total === 8 ? ' red' : ''}` }, String(v.lastRoll.total)),
  );
}

const BUILD_LABELS: Record<BuildKind, string> = { road: 'Road', settlement: 'Settlement', city: 'City' };

function actions(v: PhoneView) {
  const me = v.me!;
  const c = me.can;
  const items: (HTMLElement | null)[] = [];
  if (me.placing) {
    items.push(el('p', { class: 'hint' }, 'Tap a glowing spot on the board, then ✓ there.'));
    if (c.cancel && v.phase === 'main') items.push(button('Cancel', 'secondary', () => act({ type: 'cancel' })));
    if (c.undo) items.push(button('Undo last', 'secondary', () => act({ type: 'undo' })));
    return el('nav', { class: 'actions' }, ...items);
  }
  if (v.phase === 'setup') {
    if (me.setupNeed) items.push(button(`Place ${me.setupNeed}`, 'primary big', () => act({ type: 'build', kind: me.setupNeed! })));
    if (c.undo) items.push(button('Undo last', 'secondary', () => act({ type: 'undo' })));
    return el('nav', { class: 'actions' }, ...items);
  }
  if (c.roll) {
    items.push(button('Roll', 'primary big', () => act({ type: 'roll' })));
    items.push(button('Enter dice', 'secondary', () => ((sheet = 'pad'), render())));
  }
  if (v.current === v.you && !c.roll) {
    for (const kind of ['road', 'settlement', 'city'] as BuildKind[]) {
      const b = button('', 'build', () => act({ type: 'build', kind }));
      b.disabled = !c.build[kind];
      b.append(el('span', { class: 'label' }, BUILD_LABELS[kind]), el('span', { class: 'cost' }, ...costChips(COSTS[kind])), el('span', { class: 'left' }, `${me.pieces[kind]} left`));
      items.push(b);
    }
    const trade = button('Trade', 'secondary', () => ((sheet = 'trade'), render()));
    trade.disabled = !c.trade;
    items.push(trade);
    if (c.undo) items.push(button('Undo last', 'secondary', () => act({ type: 'undo' })));
    const end = button('End turn', 'primary', () => act({ type: 'endTurn' }));
    end.disabled = !c.endTurn;
    items.push(end);
  }
  return el('nav', { class: 'actions' }, ...items);
}

function costChips(cost: Hand) {
  return RESOURCES.filter((r) => cost[r]).map((r) => chip(r, cost[r]));
}

/** Cards fanned in an arc like a hand held in one hand, grouped by kind. */
function handView(h: Hand) {
  const cards = RESOURCES.flatMap((r) => Array<Resource>(h[r]).fill(r));
  const n = cards.length;
  const fan = el('div', { class: 'fan', 'aria-label': `${n} cards` });
  if (!n) fan.append(el('p', { class: 'hint empty' }, 'No cards yet'));
  // Spread sideways as well as round, so each card's name shows; tighter as the hand grows.
  const step = n > 1 ? Math.min(7, 56 / (n - 1)) : 0;
  const spread = n > 1 ? Math.min(0.62, 4.2 / (n - 1)) : 0;
  cards.forEach((r, i) => {
    const k = i - (n - 1) / 2;
    fan.append(card(r, { style: `transform:translateX(calc(-50% + ${k * spread} * var(--card-w))) rotate(${k * step}deg);z-index:${i}` }));
  });
  const counts = el(
    'div',
    { class: 'counts' },
    ...RESOURCES.map((r) => el('span', { class: h[r] ? '' : 'none' }, `${RESOURCE_NAMES[r]} ${h[r]}`)),
  );
  return el('div', { class: 'hand' }, fan, counts);
}

function offerOverlay(v: PhoneView) {
  const o = v.offer;
  if (!o) return null;
  if (o.from === v.you) {
    return el(
      'div',
      { class: 'offer-bar' },
      el('span', {}, `Offered to ${colorName(v, o.to)}: `, ...costChips(o.give), ' for ', ...costChips(o.get), ' · waiting…'),
      button('Withdraw', 'secondary', () => act({ type: 'withdraw' })),
    );
  }
  const mine = v.me!.hand;
  const canPay = RESOURCES.every((r) => mine[r] >= o.get[r]);
  const accept = button('Accept', 'primary', () => act({ type: 'respond', accept: true }));
  accept.disabled = !canPay;
  return el(
    'div',
    { class: 'sheet-back' },
    el(
      'div',
      { class: 'sheet offer' },
      el('h2', {}, `${colorName(v, o.from)} offers a trade`),
      el('div', { class: 'trade-line' }, el('span', {}, 'You get'), ...costChips(o.give)),
      el('div', { class: 'trade-line' }, el('span', {}, 'You give'), ...costChips(o.get)),
      !canPay && el('p', { class: 'hint' }, 'You don’t have those cards.'),
      el('div', { class: 'row' }, button('Decline', 'secondary', () => act({ type: 'respond', accept: false })), accept),
    ),
  );
}

function tradeSheet(v: PhoneView) {
  const me = v.me!;
  const close = () => ((sheet = null), render());
  const targets = [
    seg('Bank', tradeWith === 'bank', () => ((tradeWith = 'bank'), render())),
    ...v.seats.flatMap((s, seat) =>
      seat === v.you ? [] : [seg(PLAYER_NAMES[s.color], tradeWith === seat, () => ((tradeWith = seat), render()), PLAYER_HEX[s.color])],
    ),
  ];
  let body: HTMLElement[];
  if (tradeWith === 'bank') {
    const giveRow = RESOURCES.map((r) => {
      const b = resButton(r, `${me.rates[r]}:1`, bankGive === r, () => ((bankGive = r), render()));
      b.disabled = me.hand[r] < me.rates[r];
      return b;
    });
    const getRow = RESOURCES.map((r) => resButton(r, '', bankGet === r, () => ((bankGet = r), render())));
    const ok = button('Trade with the bank', 'primary', () => {
      act({ type: 'bankTrade', give: bankGive!, get: bankGet! });
      bankGive = bankGet = null;
    });
    ok.disabled = !bankGive || !bankGet || bankGive === bankGet || me.hand[bankGive] < me.rates[bankGive];
    body = [el('div', { class: 'trade-line' }, el('span', {}, 'Give'), ...giveRow), el('div', { class: 'trade-line' }, el('span', {}, 'Get 1'), ...getRow), el('div', { class: 'row' }, button('Close', 'secondary', close), ok)];
  } else {
    const to = tradeWith;
    const send = button('Send offer', 'primary', () => {
      act({ type: 'offer', to, give: offerGive, get: offerGet });
      offerGive = hand();
      offerGet = hand();
      sheet = null;
      render();
    });
    send.disabled = !handSize(offerGive) || !handSize(offerGet);
    body = [
      el('div', { class: 'trade-line' }, el('span', {}, 'You give'), ...RESOURCES.map((r) => stepper(r, offerGive, me.hand[r]))),
      el('div', { class: 'trade-line' }, el('span', {}, 'You get'), ...RESOURCES.map((r) => stepper(r, offerGet, 9))),
      el('div', { class: 'row' }, button('Close', 'secondary', close), send),
    ];
  }
  return el('div', { class: 'sheet-back' }, el('div', { class: 'sheet trade' }, el('div', { class: 'segs' }, ...targets), ...body));
}

function stepper(r: Resource, h: Hand, max: number) {
  const minus = button('−', 'step', () => ((h[r] = Math.max(0, h[r] - 1)), render()));
  const plus = button('+', 'step', () => {
    h[r] = Math.min(max, h[r] + 1);
    // The same card can't be on both sides.
    (h === offerGive ? offerGet : offerGive)[r] = 0;
    render();
  });
  minus.disabled = h[r] === 0;
  plus.disabled = h[r] >= max;
  return el('span', { class: 'stepper' }, chip(r, 1), minus, el('b', {}, String(h[r])), plus);
}

function padSheet() {
  const keys = Array.from({ length: 11 }, (_, i) => i + 2).map((n) =>
    button(String(n), `pad-key${n === 6 || n === 8 ? ' red' : ''}${n === 7 ? ' seven' : ''}`, () => {
      act({ type: 'enterRoll', total: n });
      sheet = null;
      render();
    }),
  );
  return el(
    'div',
    { class: 'sheet-back' },
    el('div', { class: 'sheet pad' }, el('h2', {}, 'Total on the dice'), el('div', { class: 'pad-grid' }, ...keys), el('div', { class: 'row' }, button('Close', 'secondary', () => ((sheet = null), render())))),
  );
}

function resButton(r: Resource, note: string, selected: boolean, onClick: () => void) {
  const b = button('', `res${selected ? ' selected' : ''}`, onClick);
  b.append(chip(r, 1), el('span', {}, RESOURCE_NAMES[r]), note ? el('small', {}, note) : '');
  return b;
}

function seg(label: string, selected: boolean, onClick: () => void, color?: string) {
  const b = button('', `seg${selected ? ' selected' : ''}`, onClick);
  if (color) b.append(el('span', { class: 'dot', style: `background:${color}` }));
  b.append(label);
  return b;
}

function button(label: string, cls: string, onClick: () => void, style = '') {
  const b = el('button', { type: 'button', class: cls, style: style || undefined }, label);
  b.addEventListener('click', onClick);
  return b;
}

function screen(title: string, hint: string) {
  return el('section', { class: 'screen' }, el('h1', {}, title), el('p', { class: 'hint' }, hint));
}

function show(node: HTMLElement) {
  root.replaceChildren(node);
}

function toast(message: string) {
  const t = el('div', { class: 'toast', role: 'status' }, message);
  document.body.append(t);
  window.setTimeout(() => t.remove(), 3000);
}

render();
