import { describe, expect, it } from 'vitest';
import { generateBoard, restoreBoard, saveBoard } from '../board/generate';
import { createRng } from '../board/rng';
import { probability, rollDice } from './dice';
import { defaultColors, nextFreeColor, seatAngle, seatDirection, seatEdge, type PlayerColor } from './players';
import { createGame, currentAngle, HISTORY_LIMIT, nextTurn, recordRoll, rollCounts, type GameState } from './state';
import { loadGame, saveGame, STORAGE_KEY } from './storage';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const newGame = (players = 3, firstSeat = 0): GameState =>
  createGame({ colors: defaultColors(players), firstSeat, size: 19, mode: 'balanced', seed: 99 });

describe('dice', () => {
  it('rolls each total with the expected frequency', () => {
    const rng = createRng(2024);
    const n = 72000;
    const counts = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const [a, b] = rollDice(rng);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(6);
      counts.set(a + b, (counts.get(a + b) ?? 0) + 1);
    }
    for (let total = 2; total <= 12; total++) {
      expect((counts.get(total) ?? 0) / n).toBeCloseTo(probability(total), 2);
    }
  });

  it('gives probabilities that sum to 1 and peak at 7', () => {
    const all = Array.from({ length: 11 }, (_, i) => probability(i + 2));
    expect(all.reduce((a, b) => a + b)).toBeCloseTo(1, 10);
    expect(Math.max(...all)).toBe(probability(7));
    expect(probability(1)).toBe(0);
  });
});

describe('seats', () => {
  it('spreads seats evenly clockwise from the bottom edge', () => {
    expect([0, 1, 2].map((s) => seatAngle(s, 3))).toEqual([0, 120, 240]);
    expect([0, 1, 2, 3].map((s) => seatAngle(s, 4))).toEqual([0, 90, 180, 270]);
    const left = seatDirection(90);
    expect(left.x).toBeCloseTo(-1);
    expect(left.y).toBeCloseTo(0);
    expect(seatDirection(0).y).toBeCloseTo(1);
  });

  it('finds where each seat meets the screen edge', () => {
    expect(seatEdge(0, 1920, 1080)).toMatchObject({ side: 'bottom', point: { x: 960, y: 1080 } });
    const left = seatEdge(90, 1920, 1080);
    expect(left.side).toBe('left');
    expect(left.point.x).toBeCloseTo(0);
    expect(left.point.y).toBeCloseTo(540);
    expect(seatEdge(180, 1920, 1080).side).toBe('top');
    expect(seatEdge(270, 1920, 1080).side).toBe('right');
    for (let a = 0; a < 360; a += 15) {
      const { point } = seatEdge(a, 1920, 1080);
      const onEdge =
        Math.abs(point.x) < 1e-6 || Math.abs(point.x - 1920) < 1e-6 || Math.abs(point.y) < 1e-6 || Math.abs(point.y - 1080) < 1e-6;
      expect(onEdge).toBe(true);
    }
  });

  it('taps through colors without repeating one another seat uses', () => {
    const colors: PlayerColor[] = ['red', 'blue', 'white'];
    expect(nextFreeColor(colors, 0)).toBe('orange');
    expect(nextFreeColor(['red', 'blue', 'orange'], 0)).toBe('white');
    expect(nextFreeColor(['brown', 'red', 'blue'], 0)).toBe('white');
    const all = defaultColors(6);
    expect(nextFreeColor(all, 2)).toBe('white');
  });
});

describe('turns', () => {
  it('starts with the chosen first player and wraps around the table', () => {
    let game = newGame(3, 2);
    expect(game.current).toBe(2);
    game = nextTurn(game);
    expect(game.current).toBe(0);
    expect(game.turn).toBe(2);
    game = nextTurn(nextTurn(game));
    expect(game.current).toBe(2);
    expect(game.turn).toBe(4);
  });

  it('turns text to face the current player', () => {
    let game = newGame(3, 0);
    expect(currentAngle(game)).toBe(0);
    game = nextTurn(game);
    expect(currentAngle(game)).toBe(120);
    game = nextTurn(game);
    expect(currentAngle(game)).toBe(240);
  });

  it('records rolls newest first and keeps a capped history', () => {
    let game = newGame();
    game = recordRoll(game, { total: 8, dice: [3, 5] });
    game = recordRoll(game, { total: 6, dice: null });
    expect(game.lastRoll).toEqual({ total: 6, dice: null });
    expect(game.history.map((r) => r.total)).toEqual([6, 8]);
    expect(rollCounts(game).get(8)).toBe(1);
    expect(rollCounts(game).get(2)).toBe(0);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) game = recordRoll(game, { total: 7, dice: [3, 4] });
    expect(game.history).toHaveLength(HISTORY_LIMIT);
  });

  it('does not change the original state', () => {
    const game = newGame();
    nextTurn(game);
    recordRoll(game, { total: 8, dice: [4, 4] });
    expect(game.current).toBe(0);
    expect(game.history).toEqual([]);
  });
});

describe('saving', () => {
  it('restores exactly the same game', () => {
    const store = memoryStore();
    let game = nextTurn(recordRoll(newGame(4, 1), { total: 9, dice: [4, 5] }));
    game = recordRoll(game, { total: 11, dice: null });
    saveGame(game, store);
    expect(loadGame(store)).toEqual(game);
  });

  it('redraws the saved board tile for tile, with harbors on the same edges', () => {
    const board = generateBoard({ size: 30, mode: 'balancedPlus', seed: 5 });
    const restored = restoreBoard(saveBoard(board));
    expect(restored.tiles).toEqual(board.tiles);
    expect(restored.harbors.map((h) => [h.kind, h.edge.mid])).toEqual(board.harbors.map((h) => [h.kind, h.edge.mid]));
  });

  it('ignores missing, corrupt or invalid saves', () => {
    const store = memoryStore();
    expect(loadGame(store)).toBeNull();
    store.setItem(STORAGE_KEY, '{not json');
    expect(loadGame(store)).toBeNull();

    const game = newGame();
    const tamper = (change: (g: GameState) => void) => {
      const copy: GameState = JSON.parse(JSON.stringify(game));
      change(copy);
      store.setItem(STORAGE_KEY, JSON.stringify(copy));
      return loadGame(store);
    };
    expect(tamper((g) => ((g as { version: number }).version = 2))).toBeNull();
    expect(tamper((g) => (g.current = 3))).toBeNull();
    expect(tamper((g) => (g.colors = ['red', 'red', 'blue']))).toBeNull();
    expect(tamper((g) => g.board.tiles.pop())).toBeNull();
    expect(tamper((g) => (g.history = [{ total: 8, dice: [1, 1] }]))).toBeNull();
    expect(tamper(() => {})).toEqual(game);
  });

  it('keeps playing when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {},
    };
    expect(() => saveGame(newGame(), broken)).not.toThrow();
    expect(loadGame(broken)).toBeNull();
  });
});
