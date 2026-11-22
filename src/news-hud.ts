// SANDEVISTAN news HUD. License in news/SANDEVISTAN-LICENSE.txt.
import { COLOR, drawEmptyState, drawFrame, drawHeader, drawText, wrapHudText } from "./x-hud.ts";
import { isSupportedLocale, resolveLocale } from "./news/i18n/locale-registry.ts";
import newsCopy from "./news-hud-copy.json";

type PhoneLocale = keyof typeof newsCopy;
type NewsItem = { title: string; summary?: string; publishedAt?: number };
export type NewsState = { status: string; value?: readonly NewsItem[] };
const WIDTH = 576;

function translateHud(locale: PhoneLocale, key: keyof typeof newsCopy.en): string {
  return newsCopy[locale][key];
}

function measuredPrefixLength(
  value: string,
  measure: (value: string) => number,
  maxWidth: number,
): number {
  const characters = [...value];
  let length = 0;
  for (let index = 1; index <= characters.length; index += 1) {
    if (measure(characters.slice(0, index).join("")) > maxWidth) break;
    length = index;
  }
  return length;
}

function measuredTruncatedLine(
  value: string,
  measure: (value: string) => number,
  maxWidth: number,
): string {
  const ellipsis = "…";
  if (measure(ellipsis) > maxWidth) return "";
  const characters = [...value];
  let length = 0;
  for (let index = 1; index <= characters.length; index += 1) {
    const candidate = `${characters.slice(0, index).join("").trimEnd()}${ellipsis}`;
    if (measure(candidate) > maxWidth) break;
    length = index;
  }
  return `${characters.slice(0, length).join("").trimEnd()}${ellipsis}`;
}

export function wrapHudTextByWidth(
  value: string,
  measure: (value: string) => number,
  maxWidth: number,
  maxLines: number,
): readonly string[] {
  let remaining = value.replace(/\s+/g, " ").trim();
  if (!remaining || maxWidth <= 0 || maxLines <= 0) return [];

  const lines: string[] = [];
  while (remaining && lines.length < maxLines) {
    if (measure(remaining) <= maxWidth) {
      lines.push(remaining);
      break;
    }
    if (lines.length === maxLines - 1) {
      const line = measuredTruncatedLine(remaining, measure, maxWidth);
      if (line) lines.push(line);
      break;
    }

    const characters = [...remaining];
    const length = measuredPrefixLength(remaining, measure, maxWidth);
    if (length <= 0) break;
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

export const FAST_NEWS_SUMMARY_FONT =
  'bold 21px "SFMono-Regular", Consolas, monospace';

export function paginateFastNewsSummary(
  context: CanvasRenderingContext2D,
  summary: string | undefined,
  locale: PhoneLocale = "ko",
): readonly (readonly string[])[] {
  context.font = FAST_NEWS_SUMMARY_FONT;
  const fallback = translateHud(locale, "noSummary");
  const lines = wrapHudTextByWidth(
    summary ?? fallback,
    (value) => context.measureText(value).width,
    528,
    Number.MAX_SAFE_INTEGER,
  );
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 4) {
    pages.push([...lines.slice(index, index + 4)]);
  }
  return pages.length > 0 ? pages : [[fallback]];
}

function formatPosition(
  index: number,
  count: number,
): string {
  const current = count > 0 ? Math.min(index, count - 1) + 1 : 0;
  return `${String(current).padStart(2, "0")} / ${
    String(count).padStart(2, "0")
  }`;
}

function formatPublished(
  publishedAt: number | undefined,
  locale: PhoneLocale,
): string {
  if (publishedAt === undefined) {
    return translateHud(locale, "publishedUnknown");
  }
  const date = new Date(publishedAt);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}.${day} ${hour}:${minute}`;
}

function drawFooter(
  context: CanvasRenderingContext2D,
  first: string,
  second?: string,
  back = "DOUBLE TAP // BACK",
) {
  context.fillStyle = COLOR.background;
  context.fillRect(0, 254, WIDTH, 34);
  context.fillStyle = COLOR.dim;
  context.fillRect(14, 254, 548, 1);
  drawText(context, first, 14, 268, 10, COLOR.secondary, "bold");
  if (second) {
    drawText(context, second, 196, 268, 10, COLOR.secondary, "bold");
  }
  context.font = 'bold 10px "SFMono-Regular", Consolas, monospace';
  const backWidth = context.measureText(back).width;
  drawText(
    context,
    back,
    Math.max(196, 562 - backWidth),
    268,
    10,
    COLOR.primary,
    "bold",
  );
}

function newsLabel(state: NewsState) {
  if (state.status === "fresh") return "NEWS // LIVE";
  if (state.status === "stale") return "NEWS // STALE";
  if (state.status === "loading") return "NEWS // LOADING";
  return "NEWS // UNAVAILABLE";
}

function compactPosition(index: number, count: number): string {
  const width = Math.max(2, String(Math.max(0, count)).length);
  const current = count > 0 ? Math.min(index, count - 1) + 1 : 0;
  return `${String(current).padStart(width, "0")}/${
    String(count).padStart(width, "0")
  }`;
}

export function drawNews(
  context: CanvasRenderingContext2D,
  state: NewsState,
  selectedIndex: number,
  selectedPage: number,
  language = "ko",
) {
  const resolved = isSupportedLocale(language) ? language : resolveLocale(language);
  const locale: PhoneLocale = typeof resolved === "string" && Object.hasOwn(newsCopy, resolved)
    ? Object.keys(newsCopy).find((key): key is PhoneLocale => key === resolved && key in newsCopy) ?? "en"
    : "en";
  context.imageSmoothingEnabled = false;
  context.fillStyle = COLOR.background;
  context.fillRect(0, 0, WIDTH, 288);
  const items = state.value ?? [];
  const index = Math.min(Math.max(0, selectedIndex), Math.max(0, items.length - 1));
  const item = (state.status === "fresh" || state.status === "stale")
    ? items[index]
    : undefined;
  const pages = item
    ? paginateFastNewsSummary(context, item.summary, locale)
    : [[translateHud(locale, "noSummary")]];
  const page = Math.min(
    Math.max(0, selectedPage),
    Math.max(0, pages.length - 1),
  );
  drawHeader(
    context,
    translateHud(locale, newsLabel(state)),
    item
      ? `${compactPosition(index, items.length)} · P${page + 1}/${pages.length}`
      : formatPosition(index, items.length),
  );
  drawFrame(context, 14, 44, 548, 204);
  if (!item) {
    const loading = state.status === "loading";
    drawEmptyState(
      context,
      translateHud(locale, loading ? "newsLoading" : "newsUnavailable"),
      translateHud(locale, loading ? "newsWaiting" : "retryConnected"),
    );
    drawFooter(context, translateHud(locale, "SCROLL // TEXT / ARTICLES"), undefined, translateHud(locale, "backHint"));
    return 1;
  }

  const titleLines = wrapHudText(item.title, 36, 2);
  titleLines.forEach((line, lineIndex) => {
    drawText(
      context,
      line,
      32,
      54 + lineIndex * 31,
      25,
      COLOR.primary,
      "bold",
    );
  });
  const summaryLines = pages[page];
  summaryLines.forEach((line, lineIndex) => {
    drawText(
      context,
      line,
      24,
      118 + lineIndex * 25,
      21,
      lineIndex === 0 ? COLOR.secondary : COLOR.primary,
      "bold",
    );
  });
  drawText(
    context,
    formatPublished(item.publishedAt, locale),
    34,
    230,
    10,
    COLOR.dim,
    "bold",
  );
  drawFooter(context, translateHud(locale, "SCROLL // TEXT / ARTICLES"), undefined, translateHud(locale, "backHint"));
  return pages.length;
}
