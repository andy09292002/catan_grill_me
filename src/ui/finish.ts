import { PLAYER_HEX, PLAYER_NAMES } from '../game/players';
import type { BoardView } from '../net/protocol';
import { el, overlay } from './dom';

export interface FinishHandle {
  close(): void;
}

/** The end of a Board + phones game: the winner, everyone's points with their hidden cards revealed. */
export function showFinish(view: BoardView, actions: { onRematch: () => void; onNewGame: () => void }): FinishHandle {
  let finish: (v: null) => void = () => {};
  const r = view.rules;
  const final = r.final!;
  const winner = r.winner!;
  const order = view.seats.map((_, s) => s).sort((a, b) => final.points[b] - final.points[a]);
  const rows = order.map((s) => {
    const extras = [
      final.pointCards[s] ? `${final.pointCards[s]} victory point card${final.pointCards[s] > 1 ? 's' : ''}` : '',
      r.longestRoad === s ? 'Longest Road' : '',
      r.largestArmy === s ? 'Largest Army' : '',
    ].filter(Boolean);
    return el(
      'li',
      { class: s === winner ? 'winner' : '' },
      el('span', { class: 'dot', style: `background:${PLAYER_HEX[view.seats[s].color]}` }),
      el('span', { class: 'name' }, PLAYER_NAMES[view.seats[s].color]),
      el('span', { class: 'extras' }, extras.join(' · ')),
      el('b', { class: 'pts' }, `${final.points[s]}`),
    );
  });
  const rematch = el('button', { type: 'button', class: 'btn primary' }, 'Rematch');
  rematch.addEventListener('click', actions.onRematch);
  const another = el('button', { type: 'button', class: 'btn secondary' }, 'New game');
  another.addEventListener('click', actions.onNewGame);
  void overlay<null>((done) => {
    finish = done;
    return el(
      'div',
      { class: 'dialog small finish', role: 'dialog', 'aria-label': 'Game over' },
      el('h2', {}, `${PLAYER_NAMES[view.seats[winner].color]} wins!`),
      el('ul', { class: 'finish-scores' }, ...rows),
      el('p', { class: 'hint' }, 'Rematch keeps everyone’s phone and seat.'),
      el('div', { class: 'actions' }, another, rematch),
    );
  });
  return { close: () => finish(null) };
}
