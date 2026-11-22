const VISIBLE_LINES = 6;
const LINE_WIDTH = 24;
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
export function graphemes(text: string) { return segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text); }
export function makeLines(text: string) {
  const result = [];
  for (const paragraph of text.split('\n')) {
    const chars = graphemes(paragraph).flatMap(part => new TextEncoder().encode(part).length > 150 ? Array.from(part) : [part]);
    if (!chars.length) { result.push(''); continue; }
    let line = '';
    let count = 0;
    let bytes = 0;
    for (const char of chars) {
      const size = new TextEncoder().encode(char).length;
      if (count >= LINE_WIDTH || bytes + size > 150) { result.push(line); line = ''; count = 0; bytes = 0; }
      line += char; count++; bytes += size;
    }
    if (line) result.push(line);
  }
  return result;
}
export function makeTerminalLines(text: string) {
  const result = [];
  for (const paragraph of text.split('\n')) {
    let line = '', columns = 0, bytes = 0;
    for (const cluster of graphemes(paragraph).flatMap(part => new TextEncoder().encode(part).length > 150 ? Array.from(part) : [part])) {
      const size = new TextEncoder().encode(cluster).length;
      const width = /^[\x20-\x7e]$/.test(cluster) ? 1 : 2;
      if (columns + width > 48 || bytes + size > 150) { result.push(line); line = ''; columns = 0; bytes = 0; }
      line += cluster; columns += width; bytes += size;
    }
    result.push(line);
  }
  return result;
}
export function scrollPosition(lines: readonly string[], first: number, delta: number, count = VISIBLE_LINES) { return Math.max(0, Math.min(Math.max(0, lines.length - count), first + delta)); }
export function viewport(lines: readonly string[], first: number, count = VISIBLE_LINES) {
  const position = scrollPosition(lines, first, 0, count);
  const visible = lines.slice(position, position + count);
  return { lines: visible, text: visible.join('\n'), position, max: Math.max(0, lines.length - count) };
}
export function scrollbar(position: number, max: number) {
  const slot = max ? Math.round((position / max) * (VISIBLE_LINES - 1)) : 0;
  return Array.from({ length: VISIBLE_LINES }, (_, i) => i === slot ? '│' : '\u00a0').join('\n');
}
