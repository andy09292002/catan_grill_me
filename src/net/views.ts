import {
  apply,
  bankRate,
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
  };
  return {
    hand: r.hands[seat],
    pieces: piecesLeft(r, seat),
    points: publicPoints(r, seat),
    rates: Object.fromEntries(RESOURCES.map((res) => [res, bankRate(t, seat, res)])) as Record<Resource, number>,
    setupNeed: setupNeed(t, seat),
    placing: mine && r.pending ? r.pending.kind : null,
    can,
  };
}
