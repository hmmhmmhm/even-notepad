export function createTiledHudDisplay(prefix: string, label: string) {
  const tileWidth = 288, tileHeight = 144;
  const tiles = ['TL', 'TR', 'BL', 'BR'].map((corner, index) => ({
    xPosition: (index % 2) * tileWidth, yPosition: Math.floor(index / 2) * tileHeight,
    width: tileWidth, height: tileHeight, containerID: 2 + index, containerName: prefix + '-' + corner,
  }));
  const layout = {
    containerTotalNum: tiles.length + 1, imageObject: tiles,
    textObject: [{ xPosition: 0, yPosition: 0, width: 576, height: 288,
      borderWidth: 0, paddingLength: 0, containerID: 1, containerName: prefix + '-frame', content: ' ', isEventCapture: 1 }],
  };

  async function sendFrame(canvas: HTMLCanvasElement, send: (tile: { containerID: number; containerName: string; imageData: Uint8Array }) => Promise<string>, isCurrent: () => boolean) {
    const tile = document.createElement('canvas');
    tile.width = tileWidth; tile.height = tileHeight;
    const context = tile.getContext('2d');
    if (!context) throw new Error('2D Canvas unavailable');
    for (const { xPosition, yPosition, containerID, containerName } of tiles) {
      if (!isCurrent()) return;
      context.drawImage(canvas, xPosition, yPosition, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
      const pixels = context.getImageData(0, 0, tileWidth, tileHeight);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const intensity = Math.round((299 * pixels.data[i] + 587 * pixels.data[i + 1] + 114 * pixels.data[i + 2]) / 1000);
        const level = intensity <= 64 ? 0 : intensity <= 168 ? 128 : intensity <= 231 ? 208 : 255;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = level;
      }
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => tile.toBlob(resolve, 'image/png'));
      if (!blob) throw Error(label + " image encoding failed");
      const imageData = new Uint8Array(await blob.arrayBuffer());
      if (!isCurrent()) return;
      if (await send({ containerID, containerName, imageData }) !== 'success') throw Error(label + " image update failed");
    }
  }
  return { layout, sendFrame };
}
