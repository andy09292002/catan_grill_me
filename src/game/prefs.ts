// Device preferences that outlive any single game.

export type AnimationLevel = 'full' | 'calm' | 'off';

export const ANIMATION_LEVELS: AnimationLevel[] = ['full', 'calm', 'off'];

export interface Prefs {
  animation: AnimationLevel;
}

export const PREFS_KEY = 'hex-board/prefs';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Full unless the device asks for reduced motion, in which case Calm. */
export function defaultPrefs(reducedMotion = prefersReducedMotion()): Prefs {
  return { animation: reducedMotion ? 'calm' : 'full' };
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function loadPrefs(store: KeyValueStore | null = defaultStore(), fallback: Prefs = defaultPrefs()): Prefs {
  try {
    const raw = store?.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return { animation: ANIMATION_LEVELS.includes(p.animation as AnimationLevel) ? p.animation! : fallback.animation };
  } catch {
    return fallback;
  }
}

export function savePrefs(prefs: Prefs, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not saved; the choice still applies until the app closes.
  }
}
