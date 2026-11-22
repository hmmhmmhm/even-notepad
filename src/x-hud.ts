/*! Sandevistan X HUD
MIT License

Copyright (c) 2026 hmmhmmhm

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export const COLOR = {
  background: "#000000",
  primary: "#ffffff",
  secondary: "#d0d0d0",
  dim: "#808080",
} as const;

export type FastCanvasColor =
  typeof COLOR[keyof typeof COLOR];
export type FastCanvasPoint = readonly [number, number];

export function drawText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: FastCanvasColor = COLOR.primary,
  weight: "normal" | "bold" = "normal",
) {
  context.fillStyle = color;
  context.font = `${weight} ${size}px "SFMono-Regular", Consolas, monospace`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(value, x, y);
}

export function drawFrame(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: FastCanvasColor = COLOR.dim,
) {
  const corner = 18;
  const right = x + width;
  const bottom = y + height;
  context.fillStyle = color;
  context.fillRect(x, y, corner, 1);
  context.fillRect(x, y, 1, corner);
  context.fillRect(right - corner, y, corner, 1);
  context.fillRect(right - 1, y, 1, corner);
  context.fillRect(x, bottom - 1, corner, 1);
  context.fillRect(x, bottom - corner, 1, corner);
  context.fillRect(right - corner, bottom - 1, corner, 1);
  context.fillRect(right - 1, bottom - corner, 1, corner);
}
function hudUnits(value: string): number {
  return [...value].reduce(
    (total, character) =>
      total + (/^[\x00-\x7f]$/.test(character) ? 1 : 2),
    0,
  );
}

function prefixLength(value: string, maxUnits: number): number {
  let used = 0;
  let length = 0;
  for (const character of value) {
    const units = /^[\x00-\x7f]$/.test(character) ? 1 : 2;
    if (used + units > maxUnits) break;
    used += units;
    length += 1;
  }
  return length;
}

function truncatedLine(value: string, maxUnits: number): string {
  const ellipsisUnits = 2;
  if (maxUnits < ellipsisUnits) return "";
  const characters = [...value];
  const length = prefixLength(value, maxUnits - ellipsisUnits);
  return `${characters.slice(0, length).join("").trimEnd()}…`;
}

export function wrapHudText(
  value: string,
  maxUnits: number,
  maxLines: number,
): readonly string[] {
  let remaining = value.replace(/\s+/g, " ").trim();
  if (!remaining || maxUnits <= 0 || maxLines <= 0) return [];

  const lines: string[] = [];
  while (remaining && lines.length < maxLines) {
    if (hudUnits(remaining) <= maxUnits) {
      lines.push(remaining);
      break;
    }
    if (lines.length === maxLines - 1) {
      const line = truncatedLine(remaining, maxUnits);
      if (line) lines.push(line);
      break;
    }

    const characters = [...remaining];
    const length = prefixLength(remaining, maxUnits);
    const candidate = characters.slice(0, length).join("");
    const wordBoundary = candidate.lastIndexOf(" ");
    const nextIsBoundary = characters[length] === " ";
    const breakAt = nextIsBoundary
      ? length
      : wordBoundary > 0
        ? [...candidate.slice(0, wordBoundary)].length
        : length;
    const line = characters.slice(0, breakAt).join("").trim();
    if (line) lines.push(line);
    remaining = characters.slice(
      nextIsBoundary || wordBoundary > 0 ? breakAt + 1 : breakAt,
    ).join("").trimStart();
  }
  return lines;
}

export function drawHeader(
  context: CanvasRenderingContext2D,
  title: string,
  counter?: string,
) {
  context.fillStyle = COLOR.background;
  context.fillRect(0, 0, WIDTH, 38);
  drawText(context, title, 14, 10, 16, COLOR.primary, "bold");
  if (counter) {
    context.font = 'bold 13px "SFMono-Regular", Consolas, monospace';
    const width = context.measureText(counter).width;
    drawText(
      context,
      counter,
      Math.max(300, 562 - width),
      11,
      13,
      COLOR.secondary,
      "bold",
    );
  }
  context.fillStyle = COLOR.dim;
  context.fillRect(14, 36, 548, 1);
}

export function drawEmptyState(
  context: CanvasRenderingContext2D,
  headline: string,
  detail: string,
) {
  drawText(context, headline, 36, 84, 30, COLOR.primary, "bold");
  for (const [index, line] of wrapHudText(detail, 50, 3).entries()) {
    drawText(context, line, 38, 136 + index * 25, 17, COLOR.secondary, "bold");
  }
}

const WIDTH = 576;
function compactPosition(index: number, count: number): string {
  const width = Math.max(2, String(Math.max(0, count)).length);
  const current = count > 0 ? Math.min(index, count - 1) + 1 : 0;
  return `${String(current).padStart(width, "0")}/${
    String(count).padStart(width, "0")
  }`;
}

const xImages = new Map<string, HTMLImageElement>();
const X_IMAGE_LIMIT = 48;
export function clearXImages() { xImages.clear(); }

function loadXImage(url: string): HTMLImageElement | undefined {
  const cached = xImages.get(url);
  if (cached) { xImages.delete(url); xImages.set(url, cached); return cached; }
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => window.dispatchEvent(new Event("sandevistan-x-image-ready"));
  image.src = import.meta.env.DEV && url.startsWith('/src/assets/') ? url : `https://sandevistan-x-relay.hmmhmmhm.workers.dev/media?url=${encodeURIComponent(url)}`;
  xImages.set(url, image);
  if (xImages.size > X_IMAGE_LIMIT) {
    const oldest = xImages.keys().next().value;
    if (oldest !== undefined) xImages.delete(oldest);
  }
  return image;
}

function drawXMetricIcon(
  context: CanvasRenderingContext2D,
  kind: "reply" | "repost" | "like" | "quote",
  x: number,
  y: number,
) {
  context.fillStyle = COLOR.secondary;
  if (kind === "reply") {
    context.fillRect(x, y, 16, 3); context.fillRect(x, y, 3, 12);
    context.fillRect(x + 13, y, 3, 12); context.fillRect(x + 4, y + 9, 9, 3);
    context.fillRect(x + 3, y + 12, 4, 3);
  } else if (kind === "repost") {
    context.fillRect(x + 2, y + 2, 11, 3); context.fillRect(x + 10, y, 6, 7);
    context.fillRect(x + 3, y + 11, 11, 3); context.fillRect(x, y + 9, 6, 7);
  } else if (kind === "like") {
    context.fillRect(x + 2, y, 5, 4); context.fillRect(x + 10, y, 5, 4);
    context.fillRect(x, y + 3, 17, 6); context.fillRect(x + 3, y + 8, 11, 4);
    context.fillRect(x + 6, y + 12, 5, 3);
  } else {
    context.fillRect(x, y, 5, 7); context.fillRect(x + 7, y, 5, 7);
    context.fillRect(x + 3, y + 5, 5, 6); context.fillRect(x + 10, y + 5, 5, 6);
  }
}

function drawXMetric(
  context: CanvasRenderingContext2D,
  kind: "reply" | "repost" | "like" | "quote",
  value: number,
  x: number,
  y: number,
) {
  drawXMetricIcon(context, kind, x, y);
  drawText(context, String(value), x + 23, y - 1, 15, COLOR.secondary, "bold");
}

function paginateText(value: string, width: number, capacity: number) {
  let remaining = value.replace(/\s+/g, " ").trim();
  const pages: string[][] = [];
  while (remaining) {
    const lines = wrapHudText(remaining, width, capacity);
    pages.push([...lines]);
    for (const [index, line] of lines.entries()) {
      const consumed = index === capacity - 1 && line.endsWith("…") && line !== remaining
        ? line.slice(0, -1) : line;
      remaining = remaining.slice(consumed.length).trimStart();
    }
  }
  return pages;
}

export type XHudPost = {
  author: string; username: string; text: string; avatarUrl?: string; imageUrl?: string; createdAt?: string;
  repostedFrom?: { name: string }; quotedPost?: { author: string; text: string };
  metrics?: { replies: number; reposts: number; likes: number; quotes: number };
};
type XHudState = { status: string; value?: readonly XHudPost[]; offset?: number; message?: string };

export function drawX(context: CanvasRenderingContext2D, state: XHudState, index: number, locale: string, page = 0) {
  context.imageSmoothingEnabled = false;
  context.fillStyle = COLOR.background;
  context.fillRect(0, 0, WIDTH, 288);
  const posts = state.value ?? [];
  const post = state.status === "fresh" || state.status === "stale" ? posts[Math.min(index, posts.length - 1)] : undefined;
  const offset = state.offset ?? 0;
  drawHeader(context, state.status === "fresh" ? "X // HOME" : "X // UNAVAILABLE", post ? compactPosition(index + offset, posts.length + offset) : "00/00");
  drawFrame(context, 14, 44, 548, 204);
  if (!post) { drawEmptyState(context, "X timeline unavailable", state.message || "Check your X token and plan."); return 1; }
  const authorY = post.repostedFrom ? 72 : 52;
  if (post.repostedFrom) drawText(context, `REPOSTED · ${post.repostedFrom.name}`, 30, 52, 11, COLOR.dim, "bold");
  const avatar = post.avatarUrl ? loadXImage(post.avatarUrl) : undefined;
  if (avatar?.complete && avatar.naturalWidth > 0) {
    context.drawImage(avatar, 28, authorY, 28, 28);
  } else {
    context.fillStyle = COLOR.secondary;
    context.fillRect(28, authorY, 28, 28);
    drawText(context, post.author.slice(0, 1).toUpperCase(), 36, authorY + 5, 15, COLOR.background, "bold");
  }
  drawText(context, post.author, 66, authorY, 17, COLOR.primary, "bold");
  drawText(context, `@${post.username}`, 66, authorY + 19, 12, COLOR.secondary, "bold");
  const image = post.imageUrl ? loadXImage(post.imageUrl) : undefined;
  const imageVisible = Boolean(image?.complete && image.naturalWidth > 0);
  if (imageVisible && image) {
    context.filter = "grayscale(1) contrast(2.4) brightness(1.18)";
    context.drawImage(image, 346, 92, 194, 106);
    context.filter = "none";
  }
  const textY = authorY + 36;
  const quote = post.quotedPost;
  const width = imageVisible ? 25 : 48;
  const capacity = quote ? (imageVisible ? 2 : 3) : (imageVisible ? 4 : 6);
  const bodyPages = paginateText(post.text, width, capacity);
  const quotePages = quote ? paginateText(quote.text, imageVisible ? 24 : 43, 3) : [];
  const pages = Math.max(1, bodyPages.length, quotePages.length);
  const current = Math.max(0, Math.min(page, pages - 1));
  const textLines = bodyPages[current] ?? [];
  textLines.forEach((line, lineIndex) => drawText(context, line, 28, textY + lineIndex * 22, 19, COLOR.primary, "bold"));
  if (quote && quotePages[current]) {
    const quoteY = textY + textLines.length * 22 + 4;
    context.fillStyle = COLOR.dim;
    context.fillRect(28, quoteY, imageVisible ? 300 : 500, 1);
    drawText(context, `QUOTE · ${quote.author}`, 28, quoteY + 6, 12, COLOR.secondary, "bold");
    quotePages[current].forEach((line, lineIndex) => (
      drawText(context, line, 28, quoteY + 21 + lineIndex * 16, 13, COLOR.primary, "bold")
    ));
  }
  const metrics = post.metrics;
  const day = post.createdAt ? new Date(post.createdAt).toLocaleDateString(locale) : "";
  context.fillStyle = COLOR.background;
  context.fillRect(0, 254, WIDTH, 34);
  context.fillStyle = COLOR.dim;
  context.fillRect(14, 254, 548, 1);
  drawText(context, day, 20, 267, 12, COLOR.secondary, "bold");
  drawXMetric(context, "reply", metrics?.replies ?? 0, 150, 264);
  drawXMetric(context, "repost", metrics?.reposts ?? 0, 238, 264);
  drawXMetric(context, "like", metrics?.likes ?? 0, 326, 264);
  drawXMetric(context, "quote", metrics?.quotes ?? 0, 414, 264);
  return pages;
}

