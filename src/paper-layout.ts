export function paperLayout(width: number, height: number) {
  return width > 0 && height > 0 && height >= width * 3 / 2 ? 'tall' : 'compact';
}
