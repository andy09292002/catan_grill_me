import type { ResourceTerrain } from '../board/generate';
import { drawIcon, TERRAIN_COLORS } from '../render/art';
import { RESOURCE_NAMES, TERRAIN_RESOURCE, type Resource } from '../rules/engine';
import { el } from '../ui/dom';

// Resource cards for the phone, drawn with the same terrain art as the board.

export const RESOURCE_TERRAIN = Object.fromEntries(
  (Object.entries(TERRAIN_RESOURCE) as [ResourceTerrain, Resource][]).map(([t, r]) => [r, t]),
) as Record<Resource, ResourceTerrain>;

const artCache = new Map<string, string>();

/** The card's picture as an image URL, drawn once per resource and size. */
function cardArt(res: Resource, px: number): string {
  const key = `${res}@${px}`;
  let url = artCache.get(key);
  if (!url) {
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(px * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    drawIcon(ctx, RESOURCE_TERRAIN[res], px / 2, px / 2, px / 56);
    url = c.toDataURL();
    artCache.set(key, url);
  }
  return url;
}

/** A full card, as held in the hand. */
export function card(res: Resource, extra: Record<string, string> = {}): HTMLElement {
  const [light, dark] = TERRAIN_COLORS[RESOURCE_TERRAIN[res]];
  return el(
    'div',
    { class: 'card', style: `--card-light:${light};--card-dark:${dark}`, ...extra },
    el('img', { src: cardArt(res, 64), alt: '', draggable: 'false' }),
    el('span', { class: 'card-name' }, RESOURCE_NAMES[res]),
  );
}

/** A small chip with the card's picture and a count, for costs and trades. */
export function chip(res: Resource, count: number): HTMLElement {
  const [light] = TERRAIN_COLORS[RESOURCE_TERRAIN[res]];
  return el(
    'span',
    { class: 'res-chip', style: `--card-light:${light}`, title: RESOURCE_NAMES[res] },
    el('img', { src: cardArt(res, 28), alt: RESOURCE_NAMES[res] }),
    count > 1 ? `${count}` : null,
  );
}
