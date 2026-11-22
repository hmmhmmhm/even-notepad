import { terminalMenuLayout } from './terminal-menu-layout.ts';

export function startupLayout(selected: number, status = '') {
  const rows = terminalMenuLayout({ menuId: 'home', items: ['Editor', 'Terminal', 'X (Twitter)', 'News'], selected, start: 0 }, value => value || ' ')
    .slice(0, 5).map((row, index) => index ? ({ ...row, yPosition: row.yPosition + 50 }) : row);
  return {
    textObject: [
      { xPosition: 58, yPosition: 15, width: 460, height: 36, textColor: 4, containerID: 8, containerName: 'home-title', content: 'Quiet Terminal', isEventCapture: 0 },
      ...rows,
      { xPosition: 16, yPosition: 224, width: 530, height: 40, textColor: 2, containerID: 4, containerName: 'home-status', content: status || ' ', isEventCapture: 0 },
    ],
    imageObject: [{ xPosition: 16, yPosition: 15, width: 32, height: 28, containerID: 9, containerName: 'home-logo' }],
  };
}

export function startupLogo() {
  const pixels = new Uint8Array(32 * 28);
  const rect = (x: number, y: number, w: number, h: number) => { for (let j = y; j < y + h; j++) pixels.fill(255, j * 32 + x, j * 32 + x + w); };
  rect(1, 1, 5, 26); rect(6, 6, 5, 5); rect(6, 16, 5, 5);
  rect(11, 1, 20, 5); rect(11, 11, 20, 5); rect(11, 22, 20, 5);
  return pixels;
}
