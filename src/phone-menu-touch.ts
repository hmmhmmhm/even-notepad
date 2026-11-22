type Timer = ReturnType<typeof setTimeout>;
type Start = { x: number; y: number; originX: number; originY: number; moved: boolean; context: string; scope: string; identity: string; timer: Timer | null; tapExpired?: boolean };
type Pending = { context: string; identity: string; x: number; y: number; timer: Timer | null; heldAt?: number };
type Options = {
  active: (event?: TouchEvent) => boolean; context?: () => string; scope?: () => string; identity?: () => string;
  move: (direction: number) => void; choose: () => void; back?: () => void; onTap?: (event: TouchEvent) => void;
  delay?: number; chatDelay?: number; maxHold?: number; trace?: (message: string) => void;
};
export function watchPhoneMenuTouch(target: Window, { active, context = () => 'menu', scope = context, identity = context, move, choose, back = () => {}, onTap = () => {}, delay = 500, chatDelay = 800, maxHold = 600, trace = () => {} }: Options) {
  let start: Start | null = null, pending: Pending | null = null;
  let lastTap: { context: string; time: number; x: number; y: number } | null = null;
  const radius = (mode: string) => mode === 'chat' ? 120 : 72;
  function cancelPending() { if (pending?.timer != null) clearTimeout(pending.timer); pending = null; }
  function clearStart() { if (start?.timer != null) clearTimeout(start.timer); start = null; }
  target.addEventListener('touchstart', event => {
    const enabled = active(event);
    trace('start ' + context() + ' ' + (enabled ? 'ok' : 'blocked') + ' n=' + event.touches.length);
    if (!enabled || event.touches.length !== 1) { clearStart(); cancelPending(); return; }
    const touch = event.touches[0];
    if (lastTap && lastTap.context === context()) {
      const gap = Date.now() - lastTap.time;
      const distance = Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y);
      trace('gap ' + gap + 'ms ' + (distance <= 72 ? 'near' : distance <= 120 ? 'mid' : 'far'));
    }
    if (pending && pending.context === context() && pending.identity === identity() && Math.hypot(touch.clientX - pending.x, touch.clientY - pending.y) <= radius(pending.context)) {
      if (pending.timer != null) clearTimeout(pending.timer); pending.heldAt = Date.now(); trace('second start');
    }
    clearStart();
    start = { x: touch.clientX, y: touch.clientY, originX: touch.clientX, originY: touch.clientY, moved: false, context: context(), scope: scope(), identity: identity(), timer: null };
    start.timer = setTimeout(() => { if (start) start.tapExpired = true; cancelPending(); }, maxHold);
  }, { capture: true, passive: true });
  target.addEventListener('touchmove', event => {
    if (!start || !active() || event.touches.length !== 1) return;
    if (start.scope !== scope()) { clearStart(); cancelPending(); return; }
    const touch = event.touches[0];
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.hypot(touch.clientX - start.originX, touch.clientY - start.originY) > 12) { start.moved = true; if (start.timer != null) clearTimeout(start.timer); start.timer = null; cancelPending(); }
    if (start.context !== context() || Math.abs(dy) < 28 || Math.abs(dy) <= Math.abs(dx)) return;
    if (event.cancelable) event.preventDefault();
    move(dy < 0 ? -1 : 1);
    start.x = touch.clientX; start.y = touch.clientY;
  }, { capture: true, passive: false });
  target.addEventListener('touchend', event => {
    if (!start) { trace('end without start'); return; }
    const end = event.changedTouches?.[0];
    const displaced = end && Math.hypot(end.clientX - start.originX, end.clientY - start.originY) > 12;
    const tap = active() && context() === start.context && scope() === start.scope && identity() === start.identity && !start.moved && !start.tapExpired && !displaced;
    const tapped = start; clearStart();
    if (!tap) { trace('end ignored'); cancelPending(); return; }
    if (tapped.context !== 'menu') onTap(event);
    lastTap = { context: tapped.context, time: Date.now(), x: tapped.originX, y: tapped.originY };
    if (pending && pending.identity === tapped.identity && pending.context === tapped.context && Math.hypot(tapped.originX - pending.x, tapped.originY - pending.y) <= radius(pending.context)) {
      if (pending.heldAt && Date.now() - pending.heldAt > 500) { cancelPending(); if (event.cancelable) event.preventDefault(); return; }
      cancelPending();
      if (event.cancelable) event.preventDefault();
      trace('double back'); back(); return;
    }
    cancelPending();
    if (tapped.context === 'menu' && event.cancelable) event.preventDefault();
    const item: Pending = { context: tapped.context, identity: tapped.identity, x: tapped.originX, y: tapped.originY, timer: null };
    item.timer = setTimeout(() => {
      if (pending !== item) return;
      pending = null;
      if (active() && context() === item.context && identity() === item.identity && item.context === 'menu') { trace('single choose'); choose(); } else trace('single expired');
    }, item.context === 'chat' ? chatDelay : delay);
    pending = item;
  }, { capture: true, passive: false });
  target.addEventListener('touchcancel', () => { trace('touch cancel'); clearStart(); cancelPending(); }, { capture: true, passive: true });
  cancelPending.isPending = () => Boolean(pending || (start && !start.moved && !start.tapExpired));
  return cancelPending;
}
