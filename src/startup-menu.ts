import { terminalMenuLayout } from './terminal-menu-layout.ts';

export function startupLayout(selected: number, status = '', terminalEnabled = true) {
  const items = ['Editor', terminalEnabled ? 'Terminal' : 'Terminal · Not supported', 'X (Twitter)', 'News'];
  const rows = terminalMenuLayout({ menuId: 'home', items, selected, start: 0 }, value => value || ' ')
    .slice(0, 5).map((row, index) => index ? ({ ...row, yPosition: row.yPosition + 50 }) : row);
  return {
    textObject: [
      { xPosition: 58, yPosition: 15, width: 460, height: 36, textColor: 4, containerID: 8, containerName: 'home-title', content: 'Quiet Terminal', isEventCapture: 0 },
      ...rows,
      ...(terminalEnabled || selected !== 1 ? [{ xPosition: 16, yPosition: 224, width: 530, height: 40, textColor: 2, containerID: 4, containerName: 'home-status', content: status || ' ', isEventCapture: 0 }] : [
        { xPosition: 16, yPosition: 212, width: 540, height: 24, textColor: 2, containerID: 4, containerName: 'home-status', content: 'Not supported in the public build.', isEventCapture: 0 },
        { xPosition: 16, yPosition: 238, width: 540, height: 24, textColor: 2, containerID: 6, containerName: 'home-private-guide', content: 'Guide: github.com/hmmhmmhm/quiet-terminal', isEventCapture: 0 },
      ]),
    ],
    imageObject: [{ xPosition: 16, yPosition: 15, width: 32, height: 28, containerID: 9, containerName: 'home-logo' }],
  };
}

export function startupLogo() {
  const pixels = new Uint8Array(32 * 28);
  const rect = (x: number, y: number, w: number, h: number) => { for (let j = y; j < y + h; j++) pixels.fill(255, j * 32 + x, j * 32 + x + w); };
  rect(3, 3, 4, 4); rect(7, 7, 4, 4); rect(11, 11, 4, 4);
  rect(7, 15, 4, 4); rect(3, 19, 4, 4);
  rect(19, 19, 10, 4);
  return pixels;
}
