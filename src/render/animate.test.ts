import { describe, expect, it } from 'vitest';
import type { Terrain } from '../board/generate';
import { defaultPrefs, loadPrefs, PREFS_KEY, savePrefs, type AnimationLevel } from '../game/prefs';
import {
  ICON_RADIUS,
  ICON_SPOTS,
  ICON_UNITS,
  phaseFor,
  pickSwing,
  roomAt,
  SAFE_RADIUS,
  sheepWander,
  sway,
  TOKEN_CLEARANCE,
  TREE_SWAY_DEG,
  WHEAT_SWAY_DEG,
  WORKER_SPOT,
} from './animate';
import { FrameBudget } from './perf';

const LEVELS: AnimationLevel[] = ['full', 'calm', 'off'];
const TIMES = Array.from({ length: 2000 }, (_, i) => i * 0.0371);

describe('icon spots', () => {
  it('keep every icon inside the safe circle, clear of corners, edges and the token', () => {
    const terrains = Object.keys(ICON_RADIUS) as (Terrain | 'worker')[];
    ICON_SPOTS.forEach((spot, i) => {
      for (const terrain of terrains) {
        if (terrain === 'worker' && i !== WORKER_SPOT) continue;
        const r = ICON_RADIUS[terrain] / ICON_UNITS;
        const d = Math.hypot(spot.x, spot.y);
        expect(d + r, `${terrain} at spot ${i} reaches the edge`).toBeLessThanOrEqual(SAFE_RADIUS);
        expect(d - r, `${terrain} at spot ${i} covers the token`).toBeGreaterThanOrEqual(TOKEN_CLEARANCE);
      }
    });
  });
});

describe('motion', () => {
  it('keeps wandering sheep inside the room at their spot', () => {
    ICON_SPOTS.forEach((spot, i) => {
      const room = roomAt(spot, ICON_RADIUS.pasture);
      for (const t of TIMES) {
        const m = sheepWander(t, phaseFor(7, i), 'full', room);
        expect(Math.hypot(m.x, m.y)).toBeLessThanOrEqual(room + 1e-9);
      }
    });
  });

  it('only walks sheep at Full', () => {
    for (const level of ['calm', 'off'] as const) {
      for (const t of TIMES.slice(0, 50)) expect(sheepWander(t, 0.3, level, 10)).toMatchObject({ x: 0, y: 0 });
    }
    expect(TIMES.some((t) => sheepWander(t, 0.3, 'full', 10).x !== 0)).toBe(true);
  });

  it('sways trees and wheat within their limits, gently at Calm and not at all when Off', () => {
    for (const [maxDeg, phase] of [
      [TREE_SWAY_DEG, 0.1],
      [WHEAT_SWAY_DEG, 0.6],
    ]) {
      const peak = (level: AnimationLevel) => Math.max(...TIMES.map((t) => Math.abs(sway(t, phase, level, maxDeg))));
      expect(peak('full')).toBeLessThanOrEqual(maxDeg);
      expect(peak('full')).toBeGreaterThan(maxDeg * 0.5);
      expect(peak('calm')).toBeLessThanOrEqual(maxDeg / 2);
      expect(peak('calm')).toBeGreaterThan(0);
      expect(peak('off')).toBe(0);
    }
  });

  it('swings the pickaxe between raised and striking only at Full', () => {
    const angles = TIMES.map((t) => pickSwing(t, 0.2, 'full').angle);
    expect(Math.min(...angles)).toBeGreaterThanOrEqual(-1.26);
    expect(Math.max(...angles)).toBeLessThanOrEqual(0.46);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(1.5);
    expect(TIMES.some((t) => pickSwing(t, 0.2, 'full').chips > 0)).toBe(true);
    for (const level of ['calm', 'off'] as const) expect(pickSwing(3.3, 0.2, level)).toEqual({ angle: -0.5, chips: 0 });
  });

  it('gives icons different, stable phases', () => {
    const phases = new Set<number>();
    for (let tile = 0; tile < 30; tile++) {
      for (let spot = 0; spot < 5; spot++) {
        const p = phaseFor(tile, spot);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(1);
        expect(phaseFor(tile, spot)).toBe(p);
        phases.add(Math.round(p * 1000));
      }
    }
    expect(phases.size).toBeGreaterThan(100);
  });

  it.each(LEVELS)('never returns NaN at %s', (level) => {
    for (const t of TIMES) {
      expect(Number.isFinite(sway(t, 0.5, level, 9))).toBe(true);
      const m = sheepWander(t, 0.5, level, 6);
      expect(Number.isFinite(m.x) && Number.isFinite(m.y)).toBe(true);
      expect(Number.isFinite(pickSwing(t, 0.5, level).angle)).toBe(true);
    }
  });
});

describe('animation preference', () => {
  const store = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it('defaults to Full, or Calm when the device asks for reduced motion', () => {
    expect(defaultPrefs(false).animation).toBe('full');
    expect(defaultPrefs(true).animation).toBe('calm');
  });

  it('remembers the chosen level and ignores junk', () => {
    const s = store();
    expect(loadPrefs(s, defaultPrefs(false))).toEqual({ animation: 'full' });
    savePrefs({ animation: 'off' }, s);
    expect(loadPrefs(s, defaultPrefs(false))).toEqual({ animation: 'off' });
    s.setItem(PREFS_KEY, '{"animation":"wild"}');
    expect(loadPrefs(s, defaultPrefs(false))).toEqual({ animation: 'full' });
    s.setItem(PREFS_KEY, 'not json');
    expect(loadPrefs(s, defaultPrefs(true))).toEqual({ animation: 'calm' });
  });
});

describe('FrameBudget', () => {
  it('trips once when a full window of frames averages over budget', () => {
    const budget = new FrameBudget(14, 10);
    for (let i = 0; i < 9; i++) expect(budget.record(40)).toBe(false);
    expect(budget.record(40)).toBe(true);
    expect(budget.record(40)).toBe(false);
  });

  it('catches a device far over budget before the window fills', () => {
    const budget = new FrameBudget(14, 90, 20);
    for (let i = 0; i < 19; i++) expect(budget.record(100)).toBe(false);
    expect(budget.record(100)).toBe(true);
  });

  it('waits for the full window when only a little over budget', () => {
    const budget = new FrameBudget(14, 90, 20);
    for (let i = 0; i < 89; i++) expect(budget.record(20)).toBe(false);
    expect(budget.record(20)).toBe(true);
  });

  it('ignores the odd slow frame', () => {
    const budget = new FrameBudget(14, 10);
    for (let i = 0; i < 100; i++) expect(budget.record(i % 10 === 0 ? 50 : 5)).toBe(false);
  });

  it('starts over after a reset', () => {
    const budget = new FrameBudget(14, 3);
    [30, 30, 30].forEach((ms) => budget.record(ms));
    budget.reset();
    expect(budget.record(30)).toBe(false);
    expect(budget.record(30)).toBe(false);
    expect(budget.record(30)).toBe(true);
  });
});
