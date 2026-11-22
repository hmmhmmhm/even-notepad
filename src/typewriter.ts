import { paperLayout } from './paper-layout.ts';
import { armLengths, armTransforms, restingLift, reachableLift, springReturn, stampSamples, type Position } from './typewriter-arm.ts';

// SEC Form 10-K, General Instruction I(2)(a): https://www.sec.gov/about/forms/form10-k.pdf
// The phone receives only paragraph lengths; this fixed excerpt supplies all visible ink.
const report = 'Such registrants may omit the information called for by Item 7, Management’s Discussion and Analysis of Financial Condition and Results of Operations provided that the registrant includes in the Form 10-K a management’s narrative analysis of the results of operations explaining the reasons for material changes in the amount of revenue and expense items between the most recent fiscal year presented and the fiscal year immediately preceding it. Explanations of material changes should include, but not be limited to, changes in the various elements which determine revenue and expense levels such as unit sales volume, prices charged and paid, production levels, production cost variances, labor costs and discretionary spending programs. In addition, the analysis should include an explanation of the effect of any changes in accounting principles and practices or method of application that have a material effect on net income as reported.';
const columns = 44;
const initialRows = 16;
// Flower plate anchors in the mirrored 160 × 258 artwork.
const plateCenterX = 34 / 160;
const plateUpperEdge = 4 / 258;
const stepTime = 32;
const returnTime = 36;
const stampTime = 180;
const liftTime = 13;
const releaseTime = 106;

const reportRows: string[] = [];

for (const word of report.split(' ')) {
  const last = reportRows.length - 1;
  const line = reportRows[last];
  if (line && line.length + word.length + 1 <= columns) reportRows[last] = line + ' ' + word;
  else reportRows.push(word);
}

export function decorativePage(lengths: readonly number[], metrics?: { capacity: number; initial: number }) {
  const rows = reportRows.slice(0, initialRows);
  let reportRow = initialRows;
  let column = 12;

  for (const [index, length] of lengths.entries()) {
    let remaining = length;
    while (remaining > reportRows[reportRow].length - column) {
      rows.push(reportRows[reportRow]);
      remaining -= reportRows[reportRow].length - column;
      reportRow = (reportRow + 1) % reportRows.length;
      column = 0;
    }

    const excerpt = reportRows[reportRow];
    const enter = index < lengths.length - 1;
    rows.push(enter ? excerpt : excerpt.slice(0, column + remaining));
    reportRow = (reportRow + 1) % reportRows.length;
    column = 0;
  }
  const addedRows = rows.length - initialRows - 1;
  const visibleRows = metrics ? Math.min(metrics.capacity, metrics.initial + addedRows) : rows.length;
  return { rows: rows.slice(-visibleRows), line: rows.length };
}

function requiredElement(selector: string, parent: ParentNode = document): HTMLElement {
  const element = parent.querySelector<HTMLElement>(selector);
  if (!element) throw new Error('Missing typewriter element: ' + selector);
  return element;
}
export function mountTypewriter(reportEdit?: (action: string, count: number) => void) {
  const stage = requiredElement('.stage');
  const machine = requiredElement('.machine-art');
  const sheet = requiredElement('.machine');
  const print = requiredElement('.print');
  const carriage = requiredElement('.carriage');
  const head = requiredElement('.striking-head', carriage);
  const links = [...carriage.querySelectorAll<HTMLElement>('.striking-arm, .arm-joint')];
  const glow = requiredElement('.carriage-glow', carriage);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const viewport = window.visualViewport;
  const lengths = [0];
  let previous = decorativePage(lengths);
  let metrics: { capacity: number; initial: number } | undefined;
  let strikes: Animation[] = [];
  let held: { contactTime: number } | undefined;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let feed: Animation | undefined;
  let travel: Animation | undefined;

  function headTarget(row: Element | null): { left: string; lift?: number } {
    if (!row) return { left: carriage.style.left };
    const paper = machine.getBoundingClientRect();
    if (!paper.width) return { left: carriage.style.left };
    const text = row.firstChild;
    let glyph;
    if (text instanceof CharacterData && text.length) {
      const range = document.createRange();
      range.setStart(text, text.length - 1);
      range.setEnd(text, text.length);
      glyph = range.getBoundingClientRect();
    }

    // Park at the center of the first monospace cell on a blank line.
    const centerX = glyph ? glyph.left + glyph.width / 2
      : row.getBoundingClientRect().left + parseFloat(getComputedStyle(row).fontSize) * .3;
    const frame = carriage.getBoundingClientRect();
    const left = (centerX - paper.left - frame.width * plateCenterX) / paper.width * 100 + '%';
    if (!glyph || !frame.height) return { left };

    // Bring the upper face just above the cell so the stamp stays on the current row.
    const inkTop = glyph.top - glyph.height * .08 - frame.top;
    return { left, lift: reachableLift(inkTop / frame.height - plateUpperEdge) };
  }

  function placeHead() {
    const target = headTarget(print.lastElementChild);
    carriage.style.left = target.left;
    return target.lift;
  }

  function animateStamp(positions: readonly [Position, ...Position[]], timing: KeyframeAnimationOptions & { duration: number }) {
    const headFrames: Keyframe[] = [];
    const linkFrames: Keyframe[][] = links.map(() => []);
    for (const { offset, lift } of stampSamples(positions, timing.duration)) {
      headFrames.push({ offset, transform: 'translateY(' + lift * 100 + '%)' });
      armTransforms(lift).forEach((transform, index) => linkFrames[index].push({ offset, transform }));
    }
    return [head.animate(headFrames, timing), glow.animate(headFrames, timing),
      ...links.map((link, index) => link.animate(linkFrames[index], timing))];
  }

  function stopStamp() {
    clearTimeout(releaseTimer);
    releaseTimer = undefined;
    held = undefined;
    for (const strike of strikes) strike.cancel();
  }

  function release(force = false) {
    if (!held) {
      if (force && releaseTimer) stopStamp();
      return;
    }
    if (force) {
      stopStamp();
      return;
    }

    const elapsed = Number(strikes[0].currentTime ?? 0);
    const { contactTime } = held;
    held = undefined;
    function returnToRest() {
      const height = carriage.getBoundingClientRect().height;
      const lift = height ? new DOMMatrixReadOnly(getComputedStyle(head).transform).f / height : restingLift;
      stopStamp();
      if (!motion.matches && height) {
        strikes = animateStamp(springReturn(lift), { duration: 74 });
      }
    }

    // A release before contact is a tap. Complete the existing short stamping pulse.
    if (elapsed < contactTime) releaseTimer = setTimeout(returnToRest, contactTime + 74 - elapsed);
    else returnToRest();
  }

  function setRows(rows: readonly string[]) {
    print.replaceChildren(...rows.map(text => {
      const row = document.createElement('span');
      row.textContent = text;
      return row;
    }));
  }

  function resize() {
    stopStamp();
    const height = viewport?.height ?? innerHeight;
    const width = viewport?.width ?? innerWidth;
    stage.style.setProperty('--visible-height', height + 'px');
    const layout = paperLayout(width, height);
    sheet.dataset.layout = layout;
    const sheetHeight = sheet.getBoundingClientRect().height;
    const artHeight = machine.getBoundingClientRect().height;
    const rowHeight = print.lastElementChild?.getBoundingClientRect().height ?? 0;
    if (rowHeight) {
      const paperTop = sheetHeight * (layout === 'tall' ? .028 : .043) + sheet.getBoundingClientRect().width * .14;
      const paperBottom = sheetHeight - artHeight * .13;
      const strikeLine = sheetHeight - parseFloat(getComputedStyle(print).bottom);
      metrics = {
        initial: Math.max(1, Math.round((paperBottom - paperTop) * .4 / rowHeight)),
        capacity: Math.max(1, Math.floor((strikeLine - paperTop) / rowHeight)),
      };
      previous = decorativePage(lengths, metrics);
      feed?.cancel();
      travel?.cancel();
      setRows(previous.rows);
    }
    placeHead();
  }
  viewport?.addEventListener('resize', resize);
  window.addEventListener('resize', resize);
  motion.addEventListener('change', resize);
  carriage.style.setProperty('--link-width', armLengths[0] / 160 * 100 + '%');
  carriage.style.setProperty('--rest-offset', restingLift * 100 + '%');
  armTransforms(restingLift).forEach((transform, index) => {
    links[index].style.transform = transform;
  });
  setRows(previous.rows);
  resize();

  function edit(action: string, count = 1, hold = false) {
    const enter = action === 'enter';
    const shouldStrike = action === 'strike';
    if (enter) lengths.push(0);
    else if (action === 'strike') lengths[lengths.length - 1]++;
    else {
      for (let remaining = count; remaining > 0; remaining--) {
        const last = lengths.length - 1;
        if (lengths[last]) lengths[last]--;
        else if (last) lengths.pop();
        else break;
      }
    }

    const page = decorativePage(lengths, metrics);
    const newLine = page.line > previous.line;
    const changed = page.line !== previous.line || page.rows.join('\n') !== previous.rows.join('\n');
    previous = page;

    const animateMotion = !motion.matches;
    const frameHeight = animateMotion && (shouldStrike || enter) ? carriage.getBoundingClientRect().height : 0;
    const headFrom = frameHeight ? new DOMMatrixReadOnly(getComputedStyle(head).transform).f / frameHeight : 0;
    let strikeLift;
    stopStamp();
    if (changed) {
      const from = getComputedStyle(carriage).left;
      feed?.cancel();
      travel?.cancel();
      setRows(page.rows);
      strikeLift = placeHead();
      if (newLine && animateMotion) {
        const lastRow = print.lastElementChild;
        const height = lastRow instanceof HTMLElement ? lastRow.offsetHeight : 0;
        const start = { left: from };
        const end = { left: carriage.style.left };
        const lift = 'translateY(' + height + 'px)';
        if (enter) {
          const completedLine = lastRow?.previousElementSibling ?? null;
          travel = carriage.animate([
            { ...start, easing: 'ease-out' },
            { left: headTarget(completedLine).left, offset: .3, easing: 'ease-in-out' },
            end,
          ], { duration: 240 });
          feed = print.animate([{ transform: lift }, { transform: 'none' }],
            { duration: 167, delay: 73, fill: 'backwards', easing: 'ease-out' });
        } else {
          travel = carriage.animate([start, end], { duration: returnTime, easing: 'ease-out' });
          feed = print.animate([{ transform: lift }, { transform: 'none' }],
            { duration: returnTime, easing: 'ease-out' });
        }
      } else if (animateMotion) {
        travel = carriage.animate([{ left: from }, { left: carriage.style.left }],
          { duration: stepTime, easing: 'ease-out' });
      }
    }

    if (shouldStrike && strikeLift !== undefined && frameHeight) {
      const duration = hold ? releaseTime : stampTime;
      const delay = newLine ? returnTime - stepTime : 0;
      const movement: [Position, ...Position[]] = [
        // Rebound from the current pose when a newer keystroke interrupts the hold.
        { lift: headFrom, spring: true },
        { lift: restingLift, offset: liftTime / duration, spring: true },
        { lift: strikeLift, offset: stepTime / duration },
        ...(hold ? [{ lift: strikeLift, offset: 1 }] : springReturn(strikeLift, releaseTime / duration)),
      ];
      const timing: KeyframeAnimationOptions & { duration: number } = { duration, delay, fill: hold ? 'both' : 'backwards' };
      strikes = animateStamp(movement, timing);
      if (hold) held = { contactTime: stepTime + delay };
    } else if (enter && frameHeight) {
      strikes = animateStamp(springReturn(headFrom), { duration: 75 });
    }

    reportEdit?.(action, count);
  }
  function resetPaper(paragraphLengths: readonly number[]) {
    stopStamp();
    feed?.cancel();
    travel?.cancel();
    lengths.length = 0;
    for (const length of paragraphLengths) lengths.push(length);
    previous = decorativePage(lengths, metrics);
    setRows(previous.rows);
    placeHead();
  }
  return { edit, release, resetPaper };
}
