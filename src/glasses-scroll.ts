import { scrollPosition } from './viewport.ts';

const FAST_SCROLL_GAP_MS = 120;
const FAST_SCROLL_EVENTS = 3;

export function createGlassesScroll() {
  let lastInput: { direction: number; time: number; count: number } | undefined;

  return {
    move(lines: readonly string[], first: number, direction: number, now = performance.now(), visibleCount = 6) {
      const isContinued = lastInput?.direction === direction && now - lastInput.time <= FAST_SCROLL_GAP_MS;
      const count = isContinued && lastInput ? Math.min(lastInput.count + 1, FAST_SCROLL_EVENTS) : 1;
      const steps = count === FAST_SCROLL_EVENTS ? 2 : 1;
      const next = scrollPosition(lines, first, direction * steps, visibleCount);
      const atBoundary = scrollPosition(lines, next, direction, visibleCount) === next;
      lastInput = atBoundary ? undefined : { direction, time: now, count };
      return next;
    },
    reset() {
      lastInput = undefined;
    },
  };
}
