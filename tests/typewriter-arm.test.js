import assert from 'node:assert/strict';
import test from 'node:test';
import { armLengths, armPose, armTransforms, restingLift, reachableLift, springReturn, stampSamples } from '../src/typewriter-arm.ts';

const distance = ([x, y], [u, v]) => Math.hypot(x - u, y - v);

test('both links keep their length and share the elbow through stamping and rebound', () => {
  for (let lift = -.16; lift <= restingLift + .011; lift += .001) {
    const { base, elbow, tip } = armPose(lift);
    assert.deepEqual(base, [66, 202]);
    assert.equal(tip[0], 54);
    assert.ok(Math.abs(distance(base, elbow) - armLengths[0]) < 1e-9);
    assert.ok(Math.abs(distance(elbow, tip) - armLengths[1]) < 1e-9);
    for (const part of armTransforms(lift)) assert.doesNotMatch(part, /scale|skew/);
  }
  assert.ok(armPose(restingLift).elbow[0] > armPose(-.147).elbow[0]);
  const { base, elbow, tip } = armPose(restingLift);
  const span = distance(base, tip);
  const angle = 2 * Math.asin(span / (2 * distance(base, elbow))) * 180 / Math.PI;
  assert.ok(Math.abs(angle - 40) < 1e-9);
  assert.equal(reachableLift(-.147), -.147);
  const limit = armPose(reachableLift(-1));
  assert.ok(Math.abs(distance(limit.elbow, limit.tip) - armLengths[1]) < 1e-9);
});

test('stamp samples keep the complete 74ms contact and include intermediate rigid poses', () => {
  const positions = [
    { lift: restingLift, spring: true },
    { lift: -.147, offset: 32 / 180 },
    { lift: -.147, offset: 106 / 180, spring: true },
    { lift: restingLift },
  ];
  const samples = stampSamples(positions, 180);
  const contact = samples.filter(sample => sample.lift === -.147);
  assert.ok(Math.abs((contact.at(-1).offset - contact[0].offset) * 180 - 74) < 1e-9);
  assert.deepEqual(samples.at(-1), { offset: 1, lift: restingLift });
  assert.ok(samples.slice(1).every((sample, i) =>
    sample.lift === samples[i].lift || (sample.offset - samples[i].offset) * 180 <= 3.001));
  assert.equal(contact.length, 2);
});

test('the spring accelerates, then settles with one small recoil inside the stroke limits', () => {
  const contact = .147;
  const samples = stampSamples(springReturn(contact), 74);
  const speeds = samples.slice(1).map((sample, index) => {
    const previous = samples[index];
    return (sample.lift - previous.lift) / (sample.offset - previous.offset);
  });
  const reverse = speeds.map(speed => Math.sign(speed)).filter(Boolean)
    .filter((direction, index, directions) => direction !== directions[index - 1]);
  assert.deepEqual(reverse, [1, -1, 1]);
  assert.ok(speeds[0] < Math.max(...speeds));
  assert.ok(speeds.at(-1) < Math.max(...speeds));
  assert.ok(samples.every(({ lift }) => lift >= contact && lift <= restingLift));
  assert.ok(samples.filter(({ offset }) => offset >= .7).every(({ lift }) => restingLift - lift <= .004 + 1e-9));
  assert.deepEqual(samples.at(-1), { offset: 1, lift: restingLift });
});
