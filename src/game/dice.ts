import type { Rng } from '../board/rng';

export type Dice = [number, number];

/** Uniform random number in [0, 1) from the browser's cryptographic generator, for fair dice. */
export const cryptoRng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

export function rollDie(rng: Rng): number {
  return 1 + Math.floor(rng() * 6);
}

export function rollDice(rng: Rng = cryptoRng): Dice {
  return [rollDie(rng), rollDie(rng)];
}

/** Chance of rolling `total` with two dice. */
export function probability(total: number): number {
  if (total < 2 || total > 12) return 0;
  return (6 - Math.abs(7 - total)) / 36;
}

export const THIEF_NUMBER = 7;
