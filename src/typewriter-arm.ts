// Coordinates are relative to the carriage artwork (160 × 258).
type Point = [number, number];
export type Position = { lift: number; offset?: number; spring?: boolean };
const lowerPin: Point = [66, 202];
const platePin: Point = [54, 62];
export const restingLift = .29;
const restSpan = Math.hypot(platePin[0] - lowerPin[0], platePin[1] + restingLift * 258 - lowerPin[1]);
const linkLength = restSpan / (2 * Math.sin(20 * Math.PI / 180));
export const armLengths = [linkLength, linkLength];
const reach = armLengths[0] + armLengths[1] - 1;
const verticalReach = Math.sqrt(reach ** 2 - (lowerPin[0] - platePin[0]) ** 2);
const highestLift = (lowerPin[1] - platePin[1] - verticalReach) / 258;

export function reachableLift(lift: number) {
  return Math.max(lift, highestLift);
}

export function armPose(lift: number) {
  const [baseX, baseY] = lowerPin;
  const tip: Point = [platePin[0], platePin[1] + lift * 258];
  const dx = tip[0] - baseX;
  const dy = tip[1] - baseY;
  const span = Math.hypot(dx, dy);
  const ux = dx / span;
  const uy = dy / span;
  const [lower, upper] = armLengths;
  // Intersect the two link circles and keep the elbow on the rail side.
  const along = (lower ** 2 - upper ** 2 + span ** 2) / (2 * span);
  const bend = Math.sqrt(Math.max(0, lower ** 2 - along ** 2));
  const elbow: Point = [baseX + along * ux - bend * uy, baseY + along * uy + bend * ux];
  return { base: lowerPin, elbow, tip };
}

function translate(x: number, y: number) {
  return 'translate(' + x / 160 * 100 + '%, ' + y / 258 * 100 + '%)';
}

function rotateLink(start: Point, end: Point) {
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  return translate(...start) + ' rotate(' + angle + 'rad)';
}

export function armTransforms(lift: number) {
  const { base, elbow, tip } = armPose(lift);
  return [rotateLink(base, elbow), rotateLink(elbow, tip), translate(...elbow)];
}

// Critically damped response with its finite tail eased to zero velocity.
const damping = 5.5;
const tail = Math.exp(-damping);
const tailVelocity = damping ** 2 * tail;
const springRange = 1 - (1 + damping) * tail - tailVelocity / 3;

function springProgress(progress: number) {
  const time = damping * progress;
  const response = 1 - (1 + time) * Math.exp(-time);
  return (response - tailVelocity * progress ** 3 / 3) / springRange;
}

export function springReturn(lift: number, offset = 0): [Position, ...Position[]] {
  const remaining = 1 - offset;
  // A single recoil stays inside the return path and never folds past the resting angle.
  const recoil = Math.min(.004, (restingLift - lift) * .035);
  const start = { lift, offset, spring: true };
  if (recoil <= 0) return [start, { lift: restingLift }];
  return [
    start,
    { lift: restingLift - recoil * .2, offset: offset + remaining * .7, spring: true },
    { lift: restingLift - recoil, offset: offset + remaining * .84, spring: true },
    { lift: restingLift },
  ];
}

export function stampSamples(positions: readonly [Position, ...Position[]], duration: number) {
  const first = { offset: 0, lift: positions[0].lift };
  const samples = [first];
  for (let index = 1; index < positions.length; index++) {
    const start = positions[index - 1];
    const end = positions[index];
    const offset = start.offset ?? 0;
    const width = (end.offset ?? 1) - offset;
    const steps = start.lift === end.lift ? 1 : Math.max(1, Math.ceil(width * duration / 3));
    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      const motion = start.spring ? springProgress(progress) : progress;
      samples.push({
        offset: step === steps ? (end.offset ?? 1) : offset + width * progress,
        lift: step === steps ? end.lift : start.lift + (end.lift - start.lift) * motion,
      });
    }
  }
  return samples;
}
