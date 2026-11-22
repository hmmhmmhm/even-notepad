import { drawNews, type NewsState } from './news-hud.ts';
import { createTiledHudDisplay } from './tiled-hud-display.ts';

export const { layout: newsLayout, sendFrame: sendNewsFrame } = createTiledHudDisplay('news', 'News');

export function createNewsFrame(state: NewsState, index: number, page: number, locale = 'ko') {
  const canvas = document.createElement('canvas');
  canvas.width = 576;
  canvas.height = 288;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D Canvas unavailable');
  const pages = drawNews(context, state, index, page, locale);
  return { canvas, pages };
}
