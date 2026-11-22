import { marked, type Token, type Tokens } from 'marked';
import { graphemes } from './viewport.ts';

function decodeEntities(text: string) {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (raw, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? raw;
    const value = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : raw;
  });
}

function inline(tokens: Token[] = []): string {
  return tokens.map(token => {
    if (token.type === 'link') return inline(token.tokens) + (token.href ? ` (${token.href})` : '');
    if (token.type === 'image') return token.text || '';
    if (token.type === 'br') return '\n';
    if (token.type === 'html') return token.text.replace(/<[^>]*>/g, '');
    const children = 'tokens' in token && Array.isArray(token.tokens) ? token.tokens : undefined;
    const text = 'text' in token && typeof token.text === 'string' ? token.text : '';
    return children ? inline(children) : token.type === 'codespan' ? text : decodeEntities(text);
  }).join('');
}
function blocks(tokens: Token[] = []): string {
  const output = [];
  for (const token of tokens) {
    if (token.type === 'space' || token.type === 'def') continue;
    if (token.type === 'list') {
      token.items.forEach((item: Tokens.ListItem, i: number) => {
        const label = token.ordered ? `${(token.start || 1) + i}. ` : '• ';
        const content = blocks(item.tokens).replace(/\n/g, '\n  ');
        output.push(label + (item.task ? item.checked ? '[x] ' : '[ ] ' : '') + content);
      });
    } else if (token.type === 'blockquote') output.push(blocks(token.tokens));
    else if (token.type === 'table') {
      const cells = (row: Tokens.TableCell[]) => row.map(cell => inline(cell.tokens)).join(' · ');
      output.push(cells(token.header), ...token.rows.map(cells));
    } else if (token.type === 'hr') output.push('────────');
    else if (token.type === 'html') output.push(token.text.replace(/<[^>]*>/g, ''));
    else {
      const children = 'tokens' in token && Array.isArray(token.tokens) ? token.tokens : undefined;
      const text = 'text' in token && typeof token.text === 'string' ? token.text : '';
      output.push(children ? inline(children) : text);
    }
  }
  return output.filter(Boolean).join('\n');
}

// The glasses render plain text, so parse Markdown and keep its readable content.
export function plainMarkdown(value: unknown) {
  return blocks(marked.lexer(String(value || ''), { gfm: true })).trim();
}

type Message = { text: string; role: string };
type Cache = { source: string; role: string; text: string; wrapped: string[] };
const cached = new WeakMap<Message, Cache>();
const measurement = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
if (measurement) measurement.font = '20px sans-serif';
const defaultWidth = (text: string) => measurement ? measurement.measureText(text).width : graphemes(text).reduce((n, c) => n + (/^[\x20-\x7e]$/.test(c) ? 11 : 20), 0);
export function fitLine(text: string, measure: (text: string) => number = defaultWidth, { reserveCursor = false } = {}) {
  const output = [];
  for (const paragraph of text.split('\n')) {
    let part = '', bytes = 0;
    for (const cluster of graphemes(paragraph).flatMap(c => new TextEncoder().encode(c).length > 150 ? Array.from(c) : [c])) {
      const size = new TextEncoder().encode(cluster).length;
      if (part && (measure(part + cluster) + (reserveCursor ? measure('|') : 0) > 510 || bytes + size > (reserveCursor ? 149 : 150))) { output.push(part); part = ''; bytes = 0; }
      part += cluster; bytes += size;
    }
    output.push(part);
  }
  return output;
}
export function terminalLines(messages: readonly Message[], measure: (text: string) => number = defaultWidth) {
  const lines = [];
  for (const message of messages) {
    const prior = cached.get(message);
    const text = prior?.source === message.text ? prior.text : message.role === 'tool' ? String(message.text || '') : plainMarkdown(message.text);
    if (!text) continue;
    const prefix = message.role === 'tool' ? '' : '> ';
    let wrapped = measure === defaultWidth && prior?.source === message.text && prior.role === message.role ? prior.wrapped : null;
    if (!wrapped) wrapped = fitLine(prefix + text, measure);
    if (measure === defaultWidth) cached.set(message, { source: message.text, role: message.role, text, wrapped });
    for (const part of wrapped) lines.push({ text: part, dim: message.role === 'tool' });
  }
  return lines.length ? lines : [{ text: 'New session', dim: false }];
}
