import { drawX, type XHudPost } from './x-hud.ts';
export { clearXImages } from './x-hud.ts';

import { createTiledHudDisplay } from './tiled-hud-display.ts';
export const { layout: xLayout, sendFrame: sendXFrame } = createTiledHudDisplay('x', 'X');

export function createXFrame(posts: readonly XHudPost[], index: number, page: number, message: string, offset = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 576; canvas.height = 288;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D Canvas unavailable');
  const pages = drawX(context, { value: posts, status: posts.length ? 'fresh' : 'unavailable', message, offset }, index, navigator.language, page);
  return { canvas, pages };
}
