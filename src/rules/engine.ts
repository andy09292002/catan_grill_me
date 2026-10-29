import type { ResourceTerrain } from '../board/generate';
import type { Rng } from '../board/rng';
import { cryptoRng, rollDice, THIEF_NUMBER, type Dice } from '../game/dice';
import { PLAYER_NAMES } from '../game/players';
import { moveThief, nextTurn, recordRoll, type GameState } from '../game/state';
import { boardGeometry, type Geometry } from './geometry';

// The base-game rules for Board + phones. Pure functions over plain data, so the server can save
// the state as JSON and the tests can drive it directly. `apply` is the only way to change it.

export type Resource = 'wood' | 'brick' | 'wool' | 'grain' | 'ore';
export const RESOURCES: Resource[] = ['wood', 'brick', 'wool', 'grain', 'ore'];
export const RESOURCE_NAMES: Record<Resource, string> = { wood: 'Wood', brick: 'Brick', wool: 'Wool', grain: 'Grain', ore: 'Ore' };
export const TERRAIN_RESOURCE: Record<ResourceTerrain, Resource> = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'wool',
  field: 'grain',
  mountain: 'ore',
};

export type Hand = Record<Resource, number>;
export type BuildKind = 'road' | 'settlement' | 'city';

export const COSTS: Record<BuildKind, Hand> = {
  road: hand({ wood: 1, brick: 1 }),
  settlement: hand({ wood: 1, brick: 1, wool: 1, grain: 1 }),
  city: hand({ grain: 2, ore: 3 }),
};
export const PIECES: Record<BuildKind, number> = { road: 15, settlement: 5, city: 4 };
export const BANK_EACH = 19;

export interface Building {
  seat: number;
  kind: 'settlement' | 'city';
}

export interface PendingBuild {
  kind: BuildKind;
  /** The spot (or path, for a road) tapped on the board, waiting for ✓; null until one is tapped. */
  at: number | null;
}

export interface TradeOffer {
  from: number;
  to: number;
  /** What `from` gives. */
  give: Hand;
  /** What `from` gets. */
  get: Hand;
}

/** The last thing built, kept until anything else happens so its builder can take it back. */
export interface LastBuild {
  seat: number;
  kind: BuildKind;
  at: number;
  /** What was paid, or for a second setup settlement the cards it brought in (as a negative refund). */
  paid: Hand;
  granted: Hand;
}

/**
 * After a 7: everyone over 7 cards discards half (all at once), then the roller moves the
 * thief, picks whom to rob if there's a choice, and takes one of their cards face down.
 */
export interface Robber {
  stage: 'discard' | 'move' | 'choose' | 'steal';
  /** Cards each seat still has to discard. */
  owed: number[];
  /** The tile tapped for the thief, waiting for ✓. */
  tile: number | null;
  /** Players the roller may rob, once the thief has moved. */
  victims: number[];
  victim: number | null;
  /** The victim's cards in the order they're laid face down, shuffled fresh for this steal. */
  order: Resource[];
}

/** The last card taken, so the two players involved can be told which it was. */
export interface Steal {
  from: number;
  to: number;
  card: Resource;
}

export interface LogEntry {
  seat: number | null;
  text: string;
}

export interface RulesState {
  version: 2;
  phase: 'setup' | 'main';
  /** Seats in setup order: once round from the first player, then back the other way. */
  setupOrder: number[];
  setupStep: number;
  /** This setup step's settlement, waiting for its road. */
  setupSettlement: number | null;
  hands: Hand[];
  bank: Hand;
  /** Per spot. */
  buildings: (Building | null)[];
  /** Per path: the seat whose road it is. */
  roads: (number | null)[];
  rolled: boolean;
  pending: PendingBuild | null;
  offer: TradeOffer | null;
  lastBuild: LastBuild | null;
  robber: Robber | null;
  lastSteal: Steal | null;
  log: LogEntry[];
}

export interface Table {
  game: GameState;
  rules: RulesState;
}

export type Action =
  | { type: 'roll' }
  | { type: 'enterRoll'; total: number }
  | { type: 'build'; kind: BuildKind }
  | { type: 'pick'; at: number }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'undo' }
  | { type: 'bankTrade'; give: Resource; get: Resource }
  | { type: 'offer'; to: number; give: Hand; get: Hand }
  | { type: 'withdraw' }
  | { type: 'respond'; accept: boolean }
  | { type: 'endTurn' }
  | { type: 'moveThief'; tile: number }
  | { type: 'discard'; cards: Hand }
  | { type: 'chooseVictim'; seat: number }
  | { type: 'steal'; index: number };

/** What just happened, for the board's animations. */
export type RulesEvent = 'roll' | 'turn' | 'build' | 'pending' | 'trade' | 'thief' | 'undo' | 'robber';

export type Result = { ok: true; table: Table; event: RulesEvent; roll?: GameState['lastRoll'] } | { ok: false; reason: string };

const LOG_LIMIT = 30;

export function hand(partial: Partial<Hand> = {}): Hand {
  return { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0, ...partial };
}

export const handSize = (h: Hand) => RESOURCES.reduce((n, r) => n + h[r], 0);
const covers = (h: Hand, cost: Hand) => RESOURCES.every((r) => h[r] >= cost[r]);
const plus = (a: Hand, b: Hand): Hand => hand(Object.fromEntries(RESOURCES.map((r) => [r, a[r] + b[r]])));
const minus = (a: Hand, b: Hand): Hand => hand(Object.fromEntries(RESOURCES.map((r) => [r, a[r] - b[r]])));

export function isHand(h: unknown): h is Hand {
  if (typeof h !== 'object' || h === null) return false;
  return RESOURCES.every((r) => Number.isInteger((h as Hand)[r]) && (h as Hand)[r] >= 0 && (h as Hand)[r] <= 95);
}

const geometryCache = new WeakMap<object, Geometry>();
export function geometryOf(game: GameState): Geometry {
  let g = geometryCache.get(game.board);
  if (!g) {
    g = boardGeometry(game.board);
    geometryCache.set(game.board, g);
  }
  return g;
}

export function createRules(game: GameState): RulesState {
  const g = geometryOf(game);
  const n = game.colors.length;
  const round = Array.from({ length: n }, (_, i) => (game.firstSeat + i) % n);
  return {
    version: 2,
    phase: 'setup',
    setupOrder: [...round, ...round.slice().reverse()],
    setupStep: 0,
    setupSettlement: null,
    hands: game.colors.map(() => hand()),
    bank: hand({ wood: BANK_EACH, brick: BANK_EACH, wool: BANK_EACH, grain: BANK_EACH, ore: BANK_EACH }),
    buildings: g.spots.map(() => null),
    roads: g.paths.map(() => null),
    rolled: false,
    pending: null,
    offer: null,
    lastBuild: null,
    robber: null,
    lastSteal: null,
    log: [{ seat: null, text: 'Setup: each player places a settlement and a road, then again in reverse order.' }],
  };
}

/** A game with rules starts with the setup player whose step it is. */
export function startTable(game: GameState): Table {
  const rules = createRules(game);
  return { game: { ...game, current: rules.setupOrder[0] }, rules };
}

// --- Questions about the state -------------------------------------------------------------

export function piecesLeft(r: RulesState, seat: number): Record<BuildKind, number> {
  const mine = r.buildings.filter((b) => b?.seat === seat);
  return {
    road: PIECES.road - r.roads.filter((s) => s === seat).length,
    settlement: PIECES.settlement - mine.filter((b) => b!.kind === 'settlement').length,
    city: PIECES.city - mine.filter((b) => b!.kind === 'city').length,
  };
}

/** Points everyone can see: 1 per settlement, 2 per city. */
export function publicPoints(r: RulesState, seat: number): number {
  return r.buildings.reduce((n, b) => n + (b?.seat === seat ? (b.kind === 'city' ? 2 : 1) : 0), 0);
}

/** The best rate this seat gets when giving `give` to the bank: 4, 3 with a generic harbor, 2 with a matching one. */
export function bankRate(t: Table, seat: number, give: Resource): number {
  const g = geometryOf(t.game);
  let rate = 4;
  t.rules.buildings.forEach((b, spot) => {
    if (b?.seat !== seat) return;
    const h = g.spots[spot].harbor;
    if (h === 'generic') rate = Math.min(rate, 3);
    else if (h && TERRAIN_RESOURCE[h] === give) rate = 2;
  });
  return rate;
}

function spotFree(r: RulesState, g: Geometry, spot: number) {
  return r.buildings[spot] === null && g.spots[spot].neighbors.every((n) => r.buildings[n] === null);
}

/** Every spot or path where `seat` may put a `kind` now, ignoring cost. */
export function legalPlaces(t: Table, seat: number, kind: BuildKind): number[] {
  const { rules: r } = t;
  const g = geometryOf(t.game);
  if (r.phase === 'setup') {
    if (kind === 'settlement' && r.setupSettlement === null) return g.spots.filter((s) => spotFree(r, g, s.id)).map((s) => s.id);
    if (kind === 'road' && r.setupSettlement !== null) return g.spots[r.setupSettlement].paths.filter((p) => r.roads[p] === null);
    return [];
  }
  if (kind === 'city') return g.spots.filter((s) => r.buildings[s.id]?.seat === seat && r.buildings[s.id]!.kind === 'settlement').map((s) => s.id);
  if (kind === 'settlement') {
    return g.spots.filter((s) => spotFree(r, g, s.id) && s.paths.some((p) => r.roads[p] === seat)).map((s) => s.id);
  }
  // A road joins one of the seat's own buildings, or another of its roads at a spot no one else has built on.
  return g.paths
    .filter((p) => r.roads[p.id] === null)
    .filter((p) =>
      p.ends.some((end) => {
        const b = r.buildings[end];
        if (b?.seat === seat) return true;
        return b === null && g.spots[end].paths.some((q) => q !== p.id && r.roads[q] === seat);
      }),
    )
    .map((p) => p.id);
}

/** What `seat` must place next during setup, or null outside setup or when it isn't their step. */
export function setupNeed(t: Table, seat: number): 'settlement' | 'road' | null {
  const r = t.rules;
  if (r.phase !== 'setup' || r.setupOrder[r.setupStep] !== seat) return null;
  return r.setupSettlement === null ? 'settlement' : 'road';
}

// --- Changing the state --------------------------------------------------------------------

const fail = (reason: string): Result => ({ ok: false, reason });

/** Applies one player's action. Board actions are made on behalf of the current player. */
export function apply(t: Table, seat: number, action: Action, roll: () => Dice = rollDice, random: Rng = cryptoRng): Result {
  const r = t.rules;
  if (r.robber && !ROBBER_ACTIONS.has(action.type)) return fail(robberWait(t));
  const current = t.game.current;
  const name = PLAYER_NAMES[t.game.colors[seat]] ?? '';
  const isCurrent = seat === current;

  switch (action.type) {
    case 'roll':
    case 'enterRoll': {
      if (!isCurrent) return fail('Not your turn');
      if (r.phase !== 'main') return fail('Finish setup first');
      if (r.rolled) return fail('Already rolled this turn');
      if (r.pending) return fail('Finish building first');
      let dice: Dice | null = null;
      let total: number;
      if (action.type === 'roll') {
        dice = roll();
        total = dice[0] + dice[1];
      } else {
        if (!Number.isInteger(action.total) || action.total < 2 || action.total > 12) return fail('A roll is 2 to 12');
        total = action.total;
      }
      const game = recordRoll(t.game, { total, dice });
      const rules: RulesState = { ...r, rolled: true, lastBuild: null, lastSteal: null };
      const produced = total === THIEF_NUMBER ? { ...rules, robber: startRobber(rules) } : produce({ game, rules }, total);
      return done({ game, rules: log(produced, seat, `${name} rolled ${total}`) }, 'roll', game.lastRoll);
    }

    case 'build': {
      if (!isCurrent) return fail('Not your turn');
      if (!['road', 'settlement', 'city'].includes(action.kind)) return fail('Unknown piece');
      if (r.pending) return fail('Already building');
      if (r.offer) return fail('Finish the trade first');
      const need = setupNeed(t, seat);
      if (r.phase === 'setup') {
        if (need !== action.kind) return fail(need ? `Place a ${need} now` : 'Not your step');
      } else {
        if (!r.rolled) return fail('Roll first');
        if (!covers(r.hands[seat], COSTS[action.kind])) return fail('Not enough cards');
      }
      if (piecesLeft(r, seat)[action.kind] <= 0) return fail(`No ${action.kind}s left`);
      if (!legalPlaces(t, seat, action.kind).length) return fail('Nowhere to build that');
      return done({ ...t, rules: { ...r, pending: { kind: action.kind, at: null } } }, 'pending');
    }

    case 'pick': {
      if (!isCurrent || !r.pending) return fail('Nothing to place');
      if (!legalPlaces(t, seat, r.pending.kind).includes(action.at)) return fail('Not a legal spot');
      return done({ ...t, rules: { ...r, pending: { ...r.pending, at: action.at } } }, 'pending');
    }

    case 'cancel':
      if (isCurrent && r.robber?.stage === 'move' && r.robber.tile !== null) return done({ ...t, rules: { ...r, robber: { ...r.robber, tile: null } } }, 'robber');
      if (!isCurrent || !r.pending) return fail('Nothing to cancel');
      return done({ ...t, rules: { ...r, pending: null } }, 'pending');

    case 'confirm':
      if (isCurrent && r.robber?.stage === 'move' && r.robber.tile !== null) return placeThief(t, seat, r.robber.tile, random);
      if (!isCurrent || !r.pending || r.pending.at === null) return fail('Pick a spot first');
      return place(t, seat, r.pending.kind, r.pending.at);

    case 'undo':
      return undo(t, seat);

    case 'bankTrade': {
      if (!isCurrent) return fail('Not your turn');
      if (r.phase !== 'main' || !r.rolled) return fail('Roll first');
      if (r.pending) return fail('Finish building first');
      if (!RESOURCES.includes(action.give) || !RESOURCES.includes(action.get) || action.give === action.get) return fail('Pick two different cards');
      const rate = bankRate(t, seat, action.give);
      if (r.hands[seat][action.give] < rate) return fail(`You need ${rate} ${RESOURCE_NAMES[action.give]}`);
      if (r.bank[action.get] < 1) return fail(`The bank has no ${RESOURCE_NAMES[action.get]} left`);
      const pay = hand({ [action.give]: rate });
      const take = hand({ [action.get]: 1 });
      const rules = move(move(r, seat, 'bank', pay), 'bank', seat, take);
      return done(
        { ...t, rules: log({ ...rules, lastBuild: null }, seat, `${name} traded ${rate} ${RESOURCE_NAMES[action.give]} for 1 ${RESOURCE_NAMES[action.get]} with the bank`) },
        'trade',
      );
    }

    case 'offer': {
      if (!isCurrent) return fail('Not your turn');
      if (r.phase !== 'main' || !r.rolled) return fail('Roll first');
      if (r.pending) return fail('Finish building first');
      if (!Number.isInteger(action.to) || action.to < 0 || action.to >= t.game.colors.length || action.to === seat) return fail('Pick another player');
      if (!isHand(action.give) || !isHand(action.get)) return fail('Bad offer');
      if (!handSize(action.give) || !handSize(action.get)) return fail('Both sides must give something');
      if (RESOURCES.some((res) => action.give[res] && action.get[res])) return fail('The same card on both sides');
      if (!covers(r.hands[seat], action.give)) return fail('You don’t have those cards');
      const offer: TradeOffer = { from: seat, to: action.to, give: hand(action.give), get: hand(action.get) };
      return done({ ...t, rules: { ...r, offer } }, 'trade');
    }

    case 'withdraw':
      if (!r.offer || r.offer.from !== seat) return fail('No offer to withdraw');
      return done({ ...t, rules: { ...r, offer: null } }, 'trade');

    case 'respond': {
      const o = r.offer;
      if (!o || o.to !== seat) return fail('No offer for you');
      if (!action.accept) {
        return done({ ...t, rules: log({ ...r, offer: null }, seat, `${name} turned down a trade`) }, 'trade');
      }
      if (!covers(r.hands[o.from], o.give)) return fail('They no longer have those cards');
      if (!covers(r.hands[o.to], o.get)) return fail('You don’t have those cards');
      const rules = move(move(r, o.from, o.to, o.give), o.to, o.from, o.get);
      const other = PLAYER_NAMES[t.game.colors[o.from]];
      return done({ ...t, rules: log({ ...rules, offer: null, lastBuild: null }, seat, `${other} and ${name} traded`) }, 'trade');
    }

    case 'endTurn': {
      if (!isCurrent) return fail('Not your turn');
      if (r.phase !== 'main') return fail('Finish setup first');
      if (!r.rolled) return fail('Roll first');
      if (r.pending) return fail('Finish building first');
      return done({ game: nextTurn(t.game), rules: { ...r, rolled: false, offer: null, lastBuild: null, lastSteal: null } }, 'turn');
    }

    case 'moveThief': {
      // Tapping a tile only shows where the thief would go; ✓ moves it.
      const rb = r.robber;
      if (!rb || rb.stage !== 'move') return fail('The thief moves after a 7');
      if (!isCurrent) return fail('Not your turn');
      const tiles = t.game.board.tiles.length;
      if (!Number.isInteger(action.tile) || action.tile < 0 || action.tile >= tiles || action.tile === t.game.thiefTile) return fail('Pick another tile');
      return done({ ...t, rules: { ...r, robber: { ...rb, tile: action.tile } } }, 'robber');
    }

    case 'discard': {
      const rb = r.robber;
      if (!rb || rb.stage !== 'discard' || !rb.owed[seat]) return fail('Nothing to discard');
      if (!isHand(action.cards) || handSize(action.cards) !== rb.owed[seat]) return fail(`Discard exactly ${rb.owed[seat]} cards`);
      if (!covers(r.hands[seat], action.cards)) return fail('You don’t have those cards');
      const owed = rb.owed.slice();
      owed[seat] = 0;
      const stage = owed.some((n) => n > 0) ? 'discard' : 'move';
      const rules = move(r, seat, 'bank', hand(action.cards));
      return done({ ...t, rules: log({ ...rules, robber: { ...rb, owed, stage } }, seat, `${name} discarded ${handSize(action.cards)} cards`) }, 'robber');
    }

    case 'chooseVictim': {
      const rb = r.robber;
      if (!rb || rb.stage !== 'choose') return fail('No one to rob now');
      if (!isCurrent) return fail('Not your turn');
      if (!rb.victims.includes(action.seat)) return fail('Pick a player next to the thief');
      return done({ ...t, rules: { ...r, robber: aimAt(r, rb, action.seat, random) } }, 'robber');
    }

    case 'steal': {
      const rb = r.robber;
      if (!rb || rb.stage !== 'steal' || rb.victim === null) return fail('Nothing to take');
      if (!isCurrent) return fail('Not your turn');
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= rb.order.length) return fail('Pick one of the cards');
      const card = rb.order[action.index];
      const rules = move(r, rb.victim, seat, hand({ [card]: 1 }));
      const other = PLAYER_NAMES[t.game.colors[rb.victim]];
      return done(
        { ...t, rules: log({ ...rules, robber: null, lastSteal: { from: rb.victim, to: seat, card } }, seat, `${name} took a card from ${other}`) },
        'robber',
      );
    }
  }
  return fail('Unknown action');
}

/** While the thief is out, only these moves are open; anything else waits. */
const ROBBER_ACTIONS = new Set<Action['type']>(['discard', 'moveThief', 'confirm', 'cancel', 'chooseVictim', 'steal']);

function robberWait(t: Table): string {
  const stage = t.rules.robber!.stage;
  if (stage === 'discard') return 'Waiting for discards';
  if (stage === 'move') return 'Move the thief first';
  return 'Finish the steal first';
}

/** Half (rounded down) for everyone over 7 cards. */
export function discardsOwed(r: RulesState): number[] {
  return r.hands.map((h) => (handSize(h) > 7 ? Math.floor(handSize(h) / 2) : 0));
}

function startRobber(r: RulesState): Robber {
  const owed = discardsOwed(r);
  return { stage: owed.some((n) => n > 0) ? 'discard' : 'move', owed, tile: null, victims: [], victim: null, order: [] };
}

/** Players with a building on `tile` and at least one card, other than the roller. */
export function victimsAt(t: Table, tile: number, roller: number): number[] {
  const g = geometryOf(t.game);
  const seats = new Set<number>();
  for (const s of g.spots) {
    const b = t.rules.buildings[s.id];
    if (b && b.seat !== roller && s.tiles.includes(tile) && handSize(t.rules.hands[b.seat]) > 0) seats.add(b.seat);
  }
  return [...seats].sort((a, b) => a - b);
}

/** Lays the victim's cards face down in a fresh random order. */
function aimAt(r: RulesState, rb: Robber, victim: number, random: Rng): Robber {
  const order = shuffle(RESOURCES.flatMap((res) => Array<Resource>(r.hands[victim][res]).fill(res)), random);
  return { ...rb, stage: 'steal', victim, order };
}

/** Moves the thief, then goes straight to the steal when only one player can be robbed. */
function placeThief(t: Table, seat: number, tile: number, random: Rng): Result {
  const game = moveThief(t.game, tile);
  if (game === t.game) return fail('Pick another tile');
  const rb = t.rules.robber!;
  const victims = victimsAt({ game, rules: t.rules }, tile, seat);
  let robber: Robber | null = null;
  if (victims.length === 1) robber = aimAt(t.rules, { ...rb, victims, tile: null }, victims[0], random);
  else if (victims.length > 1) robber = { ...rb, stage: 'choose', victims, tile: null };
  const name = PLAYER_NAMES[t.game.colors[seat]];
  return done({ game, rules: log({ ...t.rules, robber }, seat, `${name} moved the thief`) }, 'thief');
}

function shuffle<T>(items: T[], random: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function done(table: Table, event: RulesEvent, roll?: GameState['lastRoll']): Result {
  return { ok: true, table, event, roll };
}

function log(r: RulesState, seat: number | null, text: string): RulesState {
  return { ...r, log: [{ seat, text }, ...r.log].slice(0, LOG_LIMIT) };
}

/** Moves cards between two seats or a seat and the bank. */
function move(r: RulesState, from: number | 'bank', to: number | 'bank', cards: Hand): RulesState {
  const hands = r.hands.slice();
  let bank = r.bank;
  if (from === 'bank') bank = minus(bank, cards);
  else hands[from] = minus(hands[from], cards);
  if (to === 'bank') bank = plus(bank, cards);
  else hands[to] = plus(hands[to], cards);
  return { ...r, hands, bank };
}

/**
 * Hands out a roll's cards. When the bank runs short of a resource, a lone claimant gets what's
 * left; with several claimants nobody gets that resource.
 */
export function produce(t: Table, total: number): RulesState {
  const g = geometryOf(t.game);
  const claims = t.game.colors.map(() => hand());
  t.game.board.tiles.forEach((tile, id) => {
    if (tile.number !== total || tile.terrain === 'desert' || id === t.game.thiefTile) return;
    const res = TERRAIN_RESOURCE[tile.terrain];
    for (const s of g.spots) {
      const b = t.rules.buildings[s.id];
      if (b && s.tiles.includes(id)) claims[b.seat][res] += b.kind === 'city' ? 2 : 1;
    }
  });
  let rules = t.rules;
  for (const res of RESOURCES) {
    const wanted = claims.reduce((n, c) => n + c[res], 0);
    if (!wanted) continue;
    const claimants = claims.filter((c) => c[res] > 0).length;
    if (wanted <= rules.bank[res]) {
      claims.forEach((c, seat) => c[res] && (rules = move(rules, 'bank', seat, hand({ [res]: c[res] }))));
    } else if (claimants === 1) {
      const seat = claims.findIndex((c) => c[res] > 0);
      if (rules.bank[res]) rules = move(rules, 'bank', seat, hand({ [res]: rules.bank[res] }));
    }
  }
  return rules;
}

function place(t: Table, seat: number, kind: BuildKind, at: number): Result {
  const r = t.rules;
  const name = PLAYER_NAMES[t.game.colors[seat]];
  if (!legalPlaces(t, seat, kind).includes(at)) return fail('Not a legal spot');
  const setup = r.phase === 'setup';
  const paid = setup ? hand() : COSTS[kind];
  if (!covers(r.hands[seat], paid)) return fail('Not enough cards');

  let rules: RulesState = move(r, seat, 'bank', paid);
  let granted = hand();
  if (kind === 'road') {
    const roads = rules.roads.slice();
    roads[at] = seat;
    rules = { ...rules, roads };
  } else {
    const buildings = rules.buildings.slice();
    buildings[at] = { seat, kind };
    rules = { ...rules, buildings };
  }
  rules = log({ ...rules, pending: null }, seat, `${name} built a ${kind}`);

  if (!setup) return done({ ...t, rules: { ...rules, lastBuild: { seat, kind, at, paid, granted } } }, 'build');

  let game = t.game;
  const players = t.game.colors.length;
  if (kind === 'settlement') {
    // The second settlement brings one card from each tile around it.
    if (r.setupStep >= players) {
      const g = geometryOf(t.game);
      for (const tile of g.spots[at].tiles) {
        const terrain = t.game.board.tiles[tile].terrain;
        if (terrain !== 'desert' && rules.bank[TERRAIN_RESOURCE[terrain]] > 0) granted[TERRAIN_RESOURCE[terrain]]++;
      }
      rules = move(rules, 'bank', seat, granted);
    }
    rules = { ...rules, setupSettlement: at, lastBuild: { seat, kind, at, paid, granted } };
    return done({ game, rules }, 'build');
  }

  // The road ends this setup step.
  const step = r.setupStep + 1;
  rules = { ...rules, setupSettlement: null, setupStep: step, lastBuild: null };
  if (step >= rules.setupOrder.length) {
    rules = log({ ...rules, phase: 'main' }, null, 'Setup done. Roll to start.');
    game = { ...game, current: game.firstSeat };
  } else {
    game = { ...game, current: rules.setupOrder[step] };
  }
  return done({ game, rules }, game.current === t.game.current ? 'build' : 'turn');
}

function undo(t: Table, seat: number): Result {
  const r = t.rules;
  const last = r.lastBuild;
  if (!last || last.seat !== seat) return fail('Nothing to undo');
  // Taking back a piece also drops a build that was about to start, such as a setup road.
  let rules = move(move({ ...r, pending: null }, 'bank', seat, last.paid), seat, 'bank', last.granted);
  if (last.kind === 'road') {
    const roads = rules.roads.slice();
    roads[last.at] = null;
    rules = { ...rules, roads };
  } else {
    const buildings = rules.buildings.slice();
    buildings[last.at] = last.kind === 'city' ? { seat, kind: 'settlement' } : null;
    rules = { ...rules, buildings };
    if (r.phase === 'setup') rules = { ...rules, setupSettlement: null };
  }
  const name = PLAYER_NAMES[t.game.colors[seat]];
  return done({ ...t, rules: log({ ...rules, lastBuild: null }, seat, `${name} took back a ${last.kind}`) }, 'undo');
}

// --- Saved games ---------------------------------------------------------------------------

export function isRulesState(r: unknown, game: GameState): r is RulesState {
  if (typeof r !== 'object' || r === null) return false;
  const s = r as RulesState;
  const g = geometryOf(game);
  const n = game.colors.length;
  const seatOk = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
  return (
    s.version === 2 &&
    (s.phase === 'setup' || s.phase === 'main') &&
    Array.isArray(s.setupOrder) &&
    s.setupOrder.length === 2 * n &&
    s.setupOrder.every(seatOk) &&
    Number.isInteger(s.setupStep) &&
    s.setupStep >= 0 &&
    s.setupStep <= 2 * n &&
    (s.setupSettlement === null || (Number.isInteger(s.setupSettlement) && s.setupSettlement >= 0 && s.setupSettlement < g.spots.length)) &&
    Array.isArray(s.hands) &&
    s.hands.length === n &&
    s.hands.every(isHand) &&
    isHand(s.bank) &&
    // No card is ever made or lost.
    RESOURCES.every((res) => s.bank[res] + s.hands.reduce((m, h) => m + h[res], 0) === BANK_EACH) &&
    Array.isArray(s.buildings) &&
    s.buildings.length === g.spots.length &&
    s.buildings.every((b) => b === null || (seatOk(b.seat) && (b.kind === 'settlement' || b.kind === 'city'))) &&
    Array.isArray(s.roads) &&
    s.roads.length === g.paths.length &&
    s.roads.every((v) => v === null || seatOk(v)) &&
    typeof s.rolled === 'boolean' &&
    (s.robber === null ||
      (typeof s.robber === 'object' &&
        ['discard', 'move', 'choose', 'steal'].includes(s.robber.stage) &&
        Array.isArray(s.robber.owed) &&
        s.robber.owed.length === n &&
        Array.isArray(s.robber.victims) &&
        Array.isArray(s.robber.order))) &&
    (s.lastSteal === null || (typeof s.lastSteal === 'object' && RESOURCES.includes(s.lastSteal.card))) &&
    Array.isArray(s.log)
  );
}
