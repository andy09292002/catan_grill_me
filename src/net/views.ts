import {
  apply,
  bankRate,
  canPlay,
  roadLengths,
  totalPoints,
  handSize,
  legalPlaces,
  piecesLeft,
  publicPoints,
  RESOURCES,
  setupNeed,
  type Action,
  type BuildKind,
  type Resource,
  type Table,
} from '../rules/engine';
import type { PhoneCan, PhoneMe, PublicRobber, PublicRules } from './protocol';

// What each device is shown. The board gets only public information; a phone also gets its
// own hand. Nothing here ever reveals another player's cards.

const BOARD_ACTIONS = new Set<Action['type']>(['roll', 'enterRoll', 'endTurn', 'moveThief', 'pick', 'confirm', 'cancel']);
const PHONE_ACTIONS = new Set<Action['type']>([
  'roll',
  'enterRoll',
  'build',
  'cancel',
  'undo',
  'bankTrade',
  'offer',
  'withdraw',
  'respond',
  'endTurn',
  'discard',
  'chooseVictim',
  'steal',
  'buyCard',
  'playCard',
]);

/** Board actions are picks and ✓ / ✗ on the board, dice and Next turn; phones do the rest. */
export function allowedFrom(device: 'board' | 'phone', action: Action): boolean {
  return (device === 'board' ? BOARD_ACTIONS : PHONE_ACTIONS).has(action?.type);
}

export function publicRules(t: Table): PublicRules {
  const r = t.rules;
  const seats = t.game.colors.map((_, s) => s);
  return {
    phase: r.phase,
    buildings: r.buildings,
    roads: r.roads,
    cards: r.hands.map(handSize),
    points: seats.map((s) => publicPoints(r, s)),
    rolled: r.rolled,
    pending: r.pending && {
      seat: t.game.current,
      kind: r.pending.kind,
      legal: legalPlaces(t, t.game.current, r.pending.kind),
      at: r.pending.at,
    },
    robber: publicRobber(t),
    devCards: r.devCards.map((h) => h.length),
    deckLeft: r.deck.length,
    knights: r.knights,
    roadLengths: roadLengths(t),
    longestRoad: r.longestRoad,
    largestArmy: r.largestArmy,
    winner: r.winner,
    final: finalScores(t),
  };
}

/** Everyone's points and victory point cards, once someone has won; null before that. */
export function finalScores(t: Table): PublicRules['final'] {
  const r = t.rules;
  if (r.winner === null) return null;
  return {
    points: r.hands.map((_, s) => totalPoints(r, s)),
    pointCards: r.devCards.map((h) => h.filter((c) => c.card === 'point').length),
  };
}

export function publicRobber(t: Table): PublicRobber | null {
  const rb = t.rules.robber;
  if (!rb) return null;
  return { stage: rb.stage, owed: rb.owed, tile: rb.tile, victims: rb.victims, victim: rb.victim, count: rb.order.length };
}

const works = (t: Table, seat: number, action: Action) => apply(t, seat, action, () => [1, 1]).ok;

export function phoneMe(t: Table, seat: number): PhoneMe {
  const r = t.rules;
  const mine = t.game.current === seat;
  const kinds: BuildKind[] = ['road', 'settlement', 'city'];
  const can: PhoneCan = {
    roll: works(t, seat, { type: 'roll' }),
    build: Object.fromEntries(kinds.map((k) => [k, works(t, seat, { type: 'build', kind: k })])) as Record<BuildKind, boolean>,
    cancel: works(t, seat, { type: 'cancel' }),
    undo: works(t, seat, { type: 'undo' }),
    trade: mine && r.phase === 'main' && r.rolled && !r.pending && !r.robber,
    endTurn: works(t, seat, { type: 'endTurn' }),
    buyCard: works(t, seat, { type: 'buyCard' }),
    play: {
      knight: works(t, seat, { type: 'playCard', card: 'knight' }),
      roads: works(t, seat, { type: 'playCard', card: 'roads' }),
      // Checked without the cards to take, which are chosen on the phone afterwards.
      plenty: mine && r.phase === 'main' && !r.pending && !r.robber && !r.playedDev && canPlay(t, seat, 'plenty'),
      monopoly: mine && r.phase === 'main' && !r.pending && !r.robber && !r.playedDev && canPlay(t, seat, 'monopoly'),
    },
  };
  return {
    hand: r.hands[seat],
    pieces: piecesLeft(r, seat),
    points: publicPoints(r, seat),
    rates: Object.fromEntries(RESOURCES.map((res) => [res, bankRate(t, seat, res)])) as Record<Resource, number>,
    setupNeed: setupNeed(t, seat),
    placing: mine && r.pending ? r.pending.kind : null,
    devCards: r.devCards[seat].map((c) => ({ card: c.card, isNew: c.bought >= t.game.turn })),
    freeRoads: mine ? r.freeRoads : 0,
    totalPoints: totalPoints(r, seat),
    can,
  };
}
