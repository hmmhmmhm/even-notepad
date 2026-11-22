import { wrapReply } from './terminal-replies.ts';

export function terminalMenuLayout(menu: { start: number; selected: number; items: readonly string[]; menuId: string | number }, label: (value: string) => string, status = '') {
  const rows = Array.from({ length: 6 }, (_, i) => {
    const position = menu.start + i;
    const selected = position === menu.selected;
    return {
      xPosition: 16, yPosition: 12 + i * 38, width: 536, height: 36,
      borderWidth: selected ? 1 : 0, borderColor: 4, borderRadius: 5,
      paddingLength: 3, textColor: selected ? 4 : 2,
      containerID: 30 + i,
      containerName: 'pm-row-' + i,
      content: label(menu.items[position] || ''), isEventCapture: 0,
    };
  });
  const capture = { xPosition: 0, yPosition: 0, width: 576, height: 280, borderWidth: 0, containerID: 5, containerName: 'pm-' + menu.menuId, content: ' ', isEventCapture: 1 };
  return [capture, ...rows, { xPosition: 16, yPosition: 246, width: 530, height: 30, textColor: 3, containerID: 4, containerName: 'terminal-status', content: status || ' ', isEventCapture: 0 }];
}

export function replyMenuLayout(menu: { selected: number; items: readonly string[]; menuId: string }, status = '') {
  const top = 12, bottom = 246, gap = 2, maxRows = 6;
  const items = menu.items.map(text => {
    const lines = wrapReply(text);
    return { content: lines.join('\n'), height: 36 + (lines.length - 1) * 28 };
  });
  let start = menu.selected, end = start + 1;
  let used = items[start].height;
  // Keep a full selected reply in frame and show as many adjacent choices as fit.
  while (start > 0 && end - start < maxRows && used + items[start - 1].height + gap <= bottom - top) {
    used += items[--start].height + gap;
  }
  while (end < items.length && end - start < maxRows && used + items[end].height + gap <= bottom - top) {
    used += items[end++].height + gap;
  }
  let yPosition = top;
  const rows = items.slice(start, end).map((item, index) => {
    const selected = start + index === menu.selected;
    const row = {
      xPosition: 16, yPosition, width: 536, height: item.height,
      borderWidth: selected ? 1 : 0, borderColor: 4, borderRadius: 5, paddingLength: 3,
      textColor: selected ? 4 : 2, containerID: 30 + index, containerName: 'pm-row-' + index,
      content: item.content, isEventCapture: 0,
    };
    yPosition += row.height + gap;
    return row;
  });
  return [
    { xPosition: 0, yPosition: 0, width: 576, height: 280, borderWidth: 0, containerID: 5, containerName: 'pm-' + menu.menuId, content: ' ', isEventCapture: 1 },
    ...rows,
    { xPosition: 16, yPosition: bottom, width: 530, height: 30, textColor: 3, containerID: 4, containerName: 'terminal-status', content: status || ' ', isEventCapture: 0 },
  ];
}
