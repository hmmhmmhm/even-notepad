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
