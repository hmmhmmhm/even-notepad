import { graphemes } from './viewport.ts';
import { fitLine } from './terminal-format.ts';

type Measure = (text: string) => number;
type Cursor = { lines: string[]; row: number; column: number };
export function editorLines(text: string, measure?: Measure) {
  return fitLine(text, measure);
}

let cachedCursor: { text: string; offset: number; measure?: Measure; value: Cursor } | undefined;
export function editorCursor(text: string, offset: number, measure?: Measure) {
  if (cachedCursor?.text === text && cachedCursor.offset === offset && cachedCursor.measure === measure) return cachedCursor.value;
  const rows = cachedCursor?.text === text && cachedCursor.measure === measure ? cachedCursor.value.lines : fitLine(text, measure, { reserveCursor: true });
  const result = (row: number, column: number) => {
    const value = { lines: rows, row, column };
    cachedCursor = { text, offset, measure, value };
    return value;
  };
  const target = Math.max(0, Math.min(text.length, offset));
  let start = 0;
  for (let row = 0; row < rows.length; row++) {
    const end = start + rows[row].length;
    const hardBreak = text[end] === '\n';
    if (target < end || (target === end && (hardBreak || row === rows.length - 1))) {
      let column = 0;
      for (const part of graphemes(rows[row])) {
        if (column + part.length > target - start) break;
        column += part.length;
      }
      return result(row, column);
    }
    start = end + (hardBreak ? 1 : 0);
  }
  return result(rows.length - 1, (rows.at(-1)?.length ?? 0));
}

export function editorDisplay(text: string, offset: number, showCursor: boolean, measure?: Measure) {
  if (!text) return [{ text: showCursor ? '| Start typing…' : 'Start typing…', dim: true }];
  const { lines, row, column } = editorCursor(text, offset, measure);
  return lines.map((line, index) => ({ text: showCursor && index === row ? line.slice(0, column) + '|' + line.slice(column) : line, dim: false }));
}

let cachedFooter: { name: string; text: string; measure: Measure; value: string } | undefined;
export function editorFooter(name: string, text: string, measure: Measure) {
  if (cachedFooter?.name === name && cachedFooter.text === text && cachedFooter.measure === measure) return cachedFooter.value;
  const counts = `${graphemes(text).length} chars · ${text.trim() ? text.trim().split(/\s+/u).length : 0} words`;
  const chars = graphemes((name || 'UNTITLED.md').replace(/\s+/gu, ' '));
  const encoder = new TextEncoder();
  const fits = (value: string) => measure(value) <= 505 && encoder.encode(value).length <= 150;
  let label = chars.join('');
  if (!fits(`${label}   ${counts}`)) {
    while (chars.length && !fits(`${chars.join('')}…   ${counts}`)) chars.pop();
    label = chars.join('') + '…';
  }
  const value = `${label}   ${counts}`;
  cachedFooter = { name, text, measure, value };
  return value;
}
