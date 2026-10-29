import { PLAYER_HEX, PLAYER_NAMES } from '../game/players';
import type { PhoneView, ServerMessage } from '../net/protocol';
import { openSocket } from '../net/socket';
import {
  COSTS,
  DEV_COST,
  DEV_NAMES,
  hand,
  handSize,
  RESOURCE_NAMES,
  RESOURCES,
  type Action,
  type BuildKind,
  type DevCard,
  type Hand,
  type Resource,
} from '../rules/engine';
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
let sheet: 'trade' | 'pad' | 'cards' | 'plenty' | 'monopoly' | null = null;
/** Year of plenty's two picks, in order. */
let plentyPicks: Resource[] = [];
let tradeWith: number | 'bank' = 'bank';
let bankGive: Resource | null = null;
let bankGet: Resource | null = null;
let offerGive = hand();
let offerGet = hand();
/** Cards picked to discard after a 7. */
let discardDraft = hand();
/** The last steal this phone was told about, so it's announced once. */
let stolenKey = '';
/** Your cards as the thief saw them face down, kept to show which one went. */
let lastOrder: Resource[] | null = null;
/** How many face-down cards you were picking from, kept to show which one you took. */
let lastBacks = 0;

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
      if (!view.robber || view.robber.stage !== 'discard') discardDraft = hand();
      if (view.myOrder) lastOrder = view.myOrder;
      if (view.robber?.stage === 'steal' && view.current === view.you) lastBacks = view.robber.count;
      announceSteal(view);
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

/** Tells the two players involved which card was taken. */
function announceSteal(v: PhoneView) {
  const s = v.stolen;
  const key = s ? `${v.log.length}:${v.log[0]?.text}:${s.from}:${s.to}:${s.card}` : '';
  if (!s || key === stolenKey) {
    if (!s) stolenKey = '';
    return;
  }
  stolenKey = key;
  const name = RESOURCE_NAMES[s.card];
  const title = s.to === v.you ? `You took ${name} from ${colorName(v, s.from)}` : `${colorName(v, s.to)} took your ${name}`;
  // The row as it was, with the taken card lifting out of it and turning over: face up for the
  // thief, face down for the victim as it goes.
  let row: HTMLElement[] | null = null;
  if (s.to === v.you && s.index < lastBacks) {
    row = Array.from({ length: lastBacks }, (_, i) =>
      i === s.index ? el('div', { class: 'flip taken' }, el('div', { class: 'flip-inner' }, el('div', { class: 'card-back' }), card(s.card))) : el('div', { class: 'card-back' }),
    );
  } else if (s.from === v.you && lastOrder?.[s.index] === s.card) {
    row = lastOrder
      .map((r, i) =>
        i === s.index ? el('div', { class: 'flip face-down taken leaving' }, el('div', { class: 'flip-inner' }, card(r), el('div', { class: 'card-back' }))) : card(r),
      )
      .reverse();
  }
  lastOrder = null;
  lastBacks = 0;
  if (!row) return toast(title, s.to === v.you ? 'good' : 'bad');
  const replay = el('div', { class: `steal-replay ${s.to === v.you ? 'good' : 'bad'}`, role: 'status' }, el('div', { class: 'sheet steal' }, el('h2', {}, title), el('div', { class: 'backs' }, ...row)));
  replay.addEventListener('click', () => replay.remove());
  document.body.append(replay);
  window.setTimeout(() => replay.remove(), 2600);
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
    const buttons = free.map((s) => button(PLAYER_NAMES[s.color], 'pick', () => socket.send({ type: 'claim', seat: s.seat }), `--player:${PLAYER_HEX[s.color]}`));
    return show(el('section', { class: 'screen' }, el('h1', {}, 'Pick your color'), el('div', { class: 'picks' }, ...buttons), homeScreenTip()));
  }

  const me = v.seats[v.you];
  document.body.style.setProperty('--player', PLAYER_HEX[me.color]);
  if (v.winner !== null && v.final) return show(finishScreen(v));
  if (!v.started || !v.me) {
    const joined = v.seats.filter((s) => s.claimed).length;
    const status = joined < v.seats.length ? `Waiting for players · ${joined} of ${v.seats.length} joined` : 'Everyone is in. Start the game on the board.';
    return show(el('section', { class: 'screen seated' }, el('div', { class: 'me' }, el('span', { class: 'dot' }), PLAYER_NAMES[me.color]), el('h1', {}, status), homeScreenTip()));
  }

  show(
    el(
      'section',
      { class: `play${v.current === v.you ? ' my-turn' : ''}` },
      topBar(v),
      el('div', { class: 'middle' }, actions(v), handView(v.me.hand)),
      el('footer', { class: 'log' }, v.log[0]?.text ?? ''),
      offerOverlay(v),
      robberOverlay(v),
      sheet === 'trade' ? tradeSheet(v) : null,
      sheet === 'pad' ? padSheet() : null,
      sheet === 'cards' ? cardsSheet(v) : null,
      sheet === 'plenty' ? plentySheet() : null,
      sheet === 'monopoly' ? monopolySheet() : null,
    ),
  );
}

/** The game is over: who won, and everyone's points with the hidden cards turned up. */
function finishScreen(v: PhoneView) {
  const final = v.final!;
  const order = v.seats.map((_, s) => s).sort((a, b) => final.points[b] - final.points[a]);
  return el(
    'section',
    { class: 'screen finish' },
    el('h1', {}, v.winner === v.you ? 'You win!' : `${colorName(v, v.winner!)} wins!`),
    el(
      'ol',
      { class: 'scores' },
      ...order.map((s) =>
        el(
          'li',
          { class: s === v.you ? 'me' : '' },
          el('span', { class: 'dot', style: `background:${PLAYER_HEX[v.seats[s].color]}` }),
          colorName(v, s),
          el('b', {}, `${final.points[s]} pts`),
          final.pointCards[s] ? el('small', {}, `${final.pointCards[s]} hidden`) : null,
        ),
      ),
    ),
    el('p', { class: 'hint' }, 'Rematch from the board to play again with the same seats.'),
  );
}

const DEV_INFO: Record<DevCard, string> = {
  knight: 'Move the thief and take a card. Three or more knights can win Largest Army.',
  roads: 'Place two roads for free.',
  plenty: 'Take any two cards from the bank.',
  monopoly: 'Name a card: everyone gives you all of theirs.',
  point: 'One point. Kept secret until the game ends.',
};

function cardsSheet(v: PhoneView) {
  const me = v.me!;
  const close = button('Close', 'secondary', () => ((sheet = null), render()));
  const rows = me.devCards.map(({ card, isNew }) => {
    let action: HTMLElement;
    if (card === 'point') action = el('span', { class: 'hint' }, 'Counts by itself');
    else if (isNew) action = el('span', { class: 'hint' }, 'New: play from next turn');
    else {
      action = button('Play', 'primary', () => {
        if (card === 'plenty') {
          plentyPicks = [];
          sheet = 'plenty';
        } else if (card === 'monopoly') {
          sheet = 'monopoly';
        } else {
          act({ type: 'playCard', card });
          sheet = null;
        }
        render();
      });
      (action as HTMLButtonElement).disabled = !me.can.play[card];
    }
    return el('li', {}, el('div', {}, el('b', {}, DEV_NAMES[card]), el('p', { class: 'hint' }, DEV_INFO[card])), action);
  });
  return el(
    'div',
    { class: 'sheet-back' },
    el(
      'div',
      { class: 'sheet cards' },
      el('h2', {}, 'Your development cards'),
      rows.length ? el('ul', { class: 'dev-list' }, ...rows) : el('p', { class: 'hint' }, 'None yet. Buy one for a wool, a grain and an ore.'),
      el('p', { class: 'hint' }, 'One card a turn, at any time in your turn, even before rolling.'),
      el('div', { class: 'row' }, close),
    ),
  );
}

function plentySheet() {
  const pickRow = RESOURCES.map((r) => {
    const b = resButton(r, '', false, () => {
      if (plentyPicks.length < 2) plentyPicks.push(r);
      render();
    });
    b.disabled = plentyPicks.length >= 2;
    return b;
  });
  const ok = button('Take them', 'primary', () => {
    act({ type: 'playCard', card: 'plenty', take: plentyPicks });
    sheet = null;
    render();
  });
  ok.disabled = plentyPicks.length !== 2;
  return el(
    'div',
    { class: 'sheet-back' },
    el(
      'div',
      { class: 'sheet' },
      el('h2', {}, 'Year of plenty: take two cards'),
      haveLine(view!.me!.hand),
      el('div', { class: 'trade-line' }, ...pickRow),
      el('div', { class: 'trade-line' }, el('span', { class: 'label' }, 'Taking'), ...plentyPicks.map((r) => chip(r, 1))),
      el('div', { class: 'row' }, button('Back', 'secondary', () => ((plentyPicks = []), (sheet = 'cards'), render())), ok),
    ),
  );
}

function monopolySheet() {
  const choices = RESOURCES.map((r) =>
    resButton(r, '', false, () => {
      act({ type: 'playCard', card: 'monopoly', resource: r });
      sheet = null;
      render();
    }),
  );
  return el(
    'div',
    { class: 'sheet-back' },
    el(
      'div',
      { class: 'sheet' },
      el('h2', {}, 'Monopoly: which card does everyone give you?'),
      haveLine(view!.me!.hand),
      el('div', { class: 'trade-line' }, ...choices),
      el('div', { class: 'row' }, button('Back', 'secondary', () => ((sheet = 'cards'), render()))),
    ),
  );
}

function topBar(v: PhoneView) {
  const me = v.me!;
  const mine = v.current === v.you;
  const rb = v.robber;
  let status: string;
  if (rb) {
    const waiting = rb.owed.flatMap((n, s) => (n > 0 && s !== v.you ? [colorName(v, s)] : []));
    status =
      rb.stage === 'discard'
        ? rb.owed[v.you!] > 0
          ? `A 7! Discard ${rb.owed[v.you!]} cards`
          : `A 7: waiting for ${waiting.join(', ')} to discard`
        : rb.stage === 'move'
          ? mine
            ? 'Move the thief: tap a tile on the board, then ✓'
            : `${colorName(v, v.current)} is moving the thief`
          : rb.stage === 'choose'
            ? mine
              ? 'Pick whom to rob'
              : `${colorName(v, v.current)} is picking whom to rob`
            : mine
              ? 'Take a card'
              : `${colorName(v, v.current)} is taking a card from ${colorName(v, rb.victim!)}`;
  } else if (v.phase === 'setup') {
    status = me.placing ? `Tap a glowing spot on the board for your ${me.placing}, then ✓` : me.setupNeed ? `Setup: place a ${me.setupNeed}` : `${colorName(v, v.current)} is placing`;
  } else if (me.placing) {
    status = `Tap a glowing spot on the board for your ${me.placing}, then ✓`;
  } else if (v.special) {
    status = mine
      ? `Special build after ${colorName(v, v.special.turnOf)}'s turn: build or buy a card, then Done`
      : `${colorName(v, v.current)} is building after ${colorName(v, v.special.turnOf)}'s turn`;
  } else if (mine) {
    status = me.can.roll ? 'Your turn: roll the dice' : 'Your turn';
  } else {
    status = `${colorName(v, v.current)}'s turn`;
  }
  return el(
    'header',
    { class: 'bar' },
    el('span', { class: 'me' }, el('span', { class: 'dot' }), PLAYER_NAMES[v.seats[v.you!].color]),
    el(
      'span',
      { class: 'points', title: 'Your points, counting your secret victory point cards' },
      el('b', {}, String(me.totalPoints)),
      ' pts',
      me.totalPoints > me.points ? el('small', {}, ` (${me.totalPoints - me.points} secret)`) : null,
    ),
    el('span', { class: 'status' }, status),
    !connected && el('span', { class: 'warn' }, 'Reconnecting…'),
    canFullscreen() && !document.fullscreenElement ? fullscreenButton() : null,
    v.lastRoll && el('span', { class: `last-roll${v.lastRoll.total === 6 || v.lastRoll.total === 8 ? ' red' : ''}` }, String(v.lastRoll.total)),
  );
}

const BUILD_LABELS: Record<BuildKind, string> = { road: 'Road', settlement: 'Settlement', city: 'City' };

function actions(v: PhoneView) {
  const me = v.me!;
  const c = me.can;
  const items: (HTMLElement | null)[] = [];
  const rb = v.robber;
  if (rb) {
    if (rb.stage === 'choose' && v.current === v.you) {
      for (const seat of rb.victims) {
        const b = button('', 'secondary victim', () => act({ type: 'chooseVictim', seat }), `--victim:${PLAYER_HEX[v.seats[seat].color]}`);
        b.append(el('span', { class: 'dot' }), `Rob ${colorName(v, seat)}`, el('small', {}, `${v.players[seat].cards} cards`));
        items.push(b);
      }
    }
    return el('nav', { class: 'actions' }, ...items);
  }
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
  const cardsButton = () => {
    const n = me.devCards.length;
    const b = button(n ? `Cards (${n})` : 'Cards', 'secondary', () => ((sheet = 'cards'), render()));
    return b;
  };
  if (me.freeRoads > 0) items.push(button(`Place free road (${me.freeRoads} left)`, 'primary big', () => act({ type: 'build', kind: 'road' })));
  if (c.roll) {
    items.push(button('Roll', 'primary big', () => act({ type: 'roll' })));
    items.push(el('div', { class: 'pair' }, button('Enter dice', 'secondary', () => ((sheet = 'pad'), render())), cardsButton()));
  }
  if (v.current === v.you && !c.roll) {
    for (const kind of ['road', 'settlement', 'city'] as BuildKind[]) {
      const b = button('', 'build', () => act({ type: 'build', kind }));
      b.disabled = !c.build[kind];
      b.append(el('span', { class: 'label' }, BUILD_LABELS[kind]), el('span', { class: 'cost' }, ...costChips(COSTS[kind])), el('span', { class: 'left' }, `${me.pieces[kind]} left`));
      items.push(b);
    }
    const buy = button('', 'build', () => act({ type: 'buyCard' }));
    buy.disabled = !c.buyCard;
    buy.append(el('span', { class: 'label' }, 'Card'), el('span', { class: 'cost' }, ...costChips(DEV_COST)));
    const trade = button('Trade', 'secondary', () => ((sheet = 'trade'), render()));
    trade.disabled = !c.trade;
    items.push(buy, el('div', { class: 'pair' }, trade, cardsButton()));
    if (c.undo) items.push(button('Undo last', 'secondary', () => act({ type: 'undo' })));
    const end = button(v.special ? 'Done building' : 'End turn', 'primary', () => act({ type: 'endTurn' }));
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
  // Spread sideways as well as round, tighter as the hand grows, but never wider than the space.
  const step = n > 1 ? Math.min(7, 30 / (n - 1)) : 0;
  // The outer cards lean out by about a card's width at full tilt, so leave room for that too.
  const gap = n > 1 ? `min(0.62 * var(--card-w), (100% - 2.2 * var(--card-w)) / ${n - 1})` : '0px';
  cards.forEach((r, i) => {
    const k = i - (n - 1) / 2;
    fan.append(card(r, `left:calc(50% + ${k} * ${gap});transform:translateX(-50%) rotate(${k * step}deg);z-index:${i}`));
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
      haveLine(mine),
      el('div', { class: 'trade-line' }, el('span', { class: 'label' }, 'You get'), ...costChips(o.give)),
      el('div', { class: 'trade-line' }, el('span', { class: 'label' }, 'You give'), ...costChips(o.get)),
      !canPay && el('p', { class: 'hint' }, 'You don’t have those cards.'),
      el('div', { class: 'row' }, button('Decline', 'secondary', () => act({ type: 'respond', accept: false })), accept),
    ),
  );
}

/** The 7 on the phone: choosing discards, picking a face-down card, or watching yours be picked. */
function robberOverlay(v: PhoneView) {
  const rb = v.robber;
  const me = v.me!;
  if (!rb) return null;
  if (rb.stage === 'discard' && rb.owed[v.you!] > 0) {
    const owed = rb.owed[v.you!];
    const picked = handSize(discardDraft);
    const ok = button(`Discard ${owed}`, 'primary', () => act({ type: 'discard', cards: discardDraft }));
    ok.disabled = picked !== owed;
    return el(
      'div',
      { class: 'sheet-back' },
      el(
        'div',
        { class: 'sheet discard' },
        el('h2', {}, `A 7! Discard ${owed} of your ${handSize(me.hand)} cards`),
        haveLine(me.hand, discardDraft),
        el('div', { class: 'trade-line' }, ...RESOURCES.map((r) => stepper(r, discardDraft, picked < owed ? me.hand[r] : discardDraft[r]))),
        el('div', { class: 'row' }, el('span', { class: 'count' }, `${picked} of ${owed} picked`), ok),
      ),
    );
  }
  if (rb.stage === 'steal' && v.current === v.you) {
    const backs = Array.from({ length: rb.count }, (_, index) => {
      const b = button('', 'card-back', () => {
        b.classList.add('taken');
        act({ type: 'steal', index });
      });
      b.setAttribute('aria-label', `Card ${index + 1}`);
      return b;
    });
    return el(
      'div',
      { class: 'sheet-back' },
      el('div', { class: 'sheet steal' }, el('h2', {}, `Take one of ${colorName(v, rb.victim!)}'s cards`), el('div', { class: 'backs' }, ...backs)),
    );
  }
  if (rb.stage === 'steal' && v.myOrder) {
    return el(
      'div',
      { class: 'sheet-back' },
      el(
        'div',
        { class: 'sheet steal' },
        el('h2', {}, `${colorName(v, v.current)} is taking one of your cards`),
        el('p', { class: 'hint' }, 'They see these face down, as if you held them up facing them: their left is your right.'),
        el('div', { class: 'backs' }, ...v.myOrder.map((r) => card(r)).reverse()),
      ),
    );
  }
  return null;
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
    body = [el('div', { class: 'trade-line' }, el('span', { class: 'label' }, 'Give'), ...giveRow), el('div', { class: 'trade-line' }, el('span', { class: 'label' }, 'Get 1'), ...getRow), el('div', { class: 'row' }, button('Close', 'secondary', close), ok)];
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
      el('div', { class: 'trade-line' }, el('span', { class: 'label' }, 'You give'), ...RESOURCES.map((r) => stepper(r, offerGive, me.hand[r]))),
      el('div', { class: 'trade-line' }, el('span', { class: 'label' }, 'You get'), ...RESOURCES.map((r) => stepper(r, offerGet, 9))),
      el('div', { class: 'row' }, button('Close', 'secondary', close), send),
    ];
  }
  return el('div', { class: 'sheet-back' }, el('div', { class: 'sheet trade' }, el('div', { class: 'segs' }, ...targets), haveLine(me.hand), ...body));
}

/** What's in your hand, for the sheets that cover it; with `less`, what's left once those go. */
function haveLine(h: Hand, less?: Hand) {
  return el(
    'div',
    { class: 'have' },
    el('span', { class: 'label' }, less && handSize(less) ? 'You keep' : 'You have'),
    ...RESOURCES.map((r) => {
      const n = h[r] - (less?.[r] ?? 0);
      return el('span', { class: `have-item${n ? '' : ' none'}` }, chip(r, 1), el('b', {}, String(n)));
    }),
  );
}

function stepper(r: Resource, h: Hand, max: number) {
  const minus = button('−', 'step', () => ((h[r] = Math.max(0, h[r] - 1)), render()));
  const plus = button('+', 'step', () => {
    h[r] = Math.min(max, h[r] + 1);
    // The same card can't be on both sides of a trade.
    if (h === offerGive) offerGet[r] = 0;
    if (h === offerGet) offerGive[r] = 0;
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

/** Opened from the home screen, there's no address bar to hide. */
function installed(): boolean {
  return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function canFullscreen(): boolean {
  return document.fullscreenEnabled && !installed();
}

/** Hides the address bar (Android browsers) and keeps the phone sideways. */
function goFullscreen() {
  if (!canFullscreen() || document.fullscreenElement) return;
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => (window.screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {
      // Not allowed here; the page still works with the address bar.
    });
}

function fullscreenButton() {
  const b = button('', 'icon fullscreen', goFullscreen);
  b.setAttribute('aria-label', 'Full screen');
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>';
  return b;
}

/** Browsers that can't go full screen (Safari on iPhone) can run the page from the home screen instead. */
function homeScreenTip() {
  if (document.fullscreenEnabled || installed()) return null;
  return el('p', { class: 'hint tip' }, 'No address bar: in the browser’s Share menu, tap Add to Home Screen, then open Hex Board from there.');
}

// The first tap anywhere goes full screen where the browser allows it.
document.addEventListener('pointerup', goFullscreen, { once: true });
document.addEventListener('fullscreenchange', render);

function screen(title: string, hint: string) {
  return el('section', { class: 'screen' }, el('h1', {}, title), el('p', { class: 'hint' }, hint));
}

function show(node: HTMLElement) {
  root.replaceChildren(node);
}

function toast(message: string, kind: 'bad' | 'good' = 'bad') {
  const t = el('div', { class: `toast ${kind}`, role: 'status' }, message);
  document.body.append(t);
  window.setTimeout(() => t.remove(), 3500);
}

render();
