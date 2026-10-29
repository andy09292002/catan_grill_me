import { describe, expect, it } from 'vitest';
import { ways } from './rolls';

describe('roll chart', () => {
  it('expects totals the way two fair dice make them: a peak at 7', () => {
    const all = Array.from({ length: 11 }, (_, i) => ways(i + 2));
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]);
    expect(all.reduce((a, b) => a + b)).toBe(36);
  });
});
