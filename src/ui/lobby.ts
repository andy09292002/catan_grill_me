import { PLAYER_HEX, PLAYER_NAMES } from '../game/players';
import type { BoardView } from '../net/protocol';
import { qrSrc } from '../net/socket';
import { el, overlay } from './dom';

export interface LobbyHandle {
  update(view: BoardView): void;
  close(): void;
}

/** The joining screen: a QR code for the phones and each seat's status. Start appears once every seat has a phone. */
export function showLobby(view: BoardView, actions: { onStart: () => void; onCancel: () => void }): LobbyHandle {
  let finish: (v: null) => void = () => {};
  let current = view;
  const dialog = el('div', { class: 'dialog lobby', role: 'dialog', 'aria-label': 'Join with your phones' });

  const render = () => {
    const joined = current.seats.filter((s) => s.claimed).length;
    const all = joined === current.seats.length;
    const start = el('button', { type: 'button', class: 'btn primary', disabled: !all }, all ? 'Start game' : `Waiting for ${current.seats.length - joined} more`);
    start.addEventListener('click', actions.onStart);
    const cancel = el('button', { type: 'button', class: 'btn secondary' }, 'Cancel');
    cancel.addEventListener('click', actions.onCancel);
    dialog.replaceChildren(
      el('h2', {}, 'Join with your phones'),
      el(
        'div',
        { class: 'lobby-body' },
        el(
          'div',
          { class: 'lobby-qr' },
          el('img', { src: qrSrc(current.joinUrl), alt: `QR code for ${current.joinUrl}`, width: 240, height: 240 }),
          el('p', { class: 'lobby-url' }, current.joinUrl),
          el('p', { class: 'hint' }, 'Scan with the camera. Phones must be on the same Wi-Fi as this PC.'),
        ),
        el(
          'ul',
          { class: 'lobby-seats' },
          ...current.seats.map((s) =>
            el(
              'li',
              { class: s.claimed ? 'joined' : '' },
              el('span', { class: 'dot', style: `background:${PLAYER_HEX[s.color]}` }),
              el('span', { class: 'name' }, PLAYER_NAMES[s.color]),
              el('span', { class: 'status' }, s.claimed ? (s.connected ? 'Joined' : 'Joined · phone away') : 'Waiting…'),
            ),
          ),
        ),
      ),
      el('div', { class: 'actions' }, cancel, start),
    );
  };

  render();
  void overlay<null>((done) => {
    finish = done;
    return dialog;
  });
  return {
    update(view) {
      current = view;
      render();
    },
    close() {
      finish(null);
    },
  };
}

/** The code that moves a seat to another phone, e.g. when a battery dies. */
export function showRejoin(color: BoardView['seats'][number]['color'], url: string): Promise<null> {
  return overlay<null>((done) => {
    const close = el('button', { type: 'button', class: 'btn primary' }, 'Done');
    close.addEventListener('click', () => done(null));
    return el(
      'div',
      { class: 'dialog small lobby', role: 'dialog', 'aria-label': `Move ${PLAYER_NAMES[color]} to another phone` },
      el('h2', {}, `Move ${PLAYER_NAMES[color]} to another phone`),
      el('div', { class: 'lobby-qr' }, el('img', { src: qrSrc(url), alt: 'QR code for the new phone', width: 240, height: 240 })),
      el('p', { class: 'hint' }, `Scan with the new phone. ${PLAYER_NAMES[color]}'s old phone stops working for this game. The code works once.`),
      el('div', { class: 'actions' }, close),
    );
  });
}
