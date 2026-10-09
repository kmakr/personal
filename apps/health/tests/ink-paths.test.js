import test from 'node:test';
import assert from 'node:assert/strict';
import { roots, beatIntervals, spiral, ROOT_DEPTH } from '../src/ink-paths.js';

test('roots grow deeper with sleep and branch by stage', () => {
  assert.equal(roots({ date: '2026-09-21', sleepMinutes: null, sleepStages: null }), null);
  const short = roots({ date: '2026-09-21', sleepMinutes: 240, sleepStages: null });
  const long = roots({
    date: '2026-09-21',
    sleepMinutes: 480,
    sleepStages: { deep: 100, light: 240, rem: 100, awake: 30 },
  });
  assert.ok(long.depth > short.depth && long.depth <= ROOT_DEPTH);
  assert.ok(long.width > short.width);
  assert.equal(long.branches.filter((b) => b.kind === 'light').length, 4);
  assert.equal(long.branches.filter((b) => b.kind === 'rem').length, 5);
  assert.equal(long.breaks, 3);
  // Sleep past ten hours stays at full depth.
  assert.equal(roots({ date: '2026-09-21', sleepMinutes: 900 }).depth, ROOT_DEPTH);
});

test('beats keep the resting pulse on average and vary with HRV', () => {
  const steady = beatIntervals(60, 0);
  assert.ok(steady.every((gap) => gap === 1000));
  const loose = beatIntervals(60, 50);
  const mean = loose.reduce((a, b) => a + b, 0) / loose.length;
  assert.ok(Math.abs(mean - 1000) < 60);
  assert.ok(Math.max(...loose) - Math.min(...loose) > 200);
  assert.deepEqual(beatIntervals(60, 50), loose);
});

test('the spiral puts the newest day on the outside and skips empty values', () => {
  const days = Array.from({ length: 84 }, (_, i) => ({ date: `d${i}`, v: i % 2 ? 1 : null }));
  const points = spiral(
    days,
    (day) => day.v,
    () => null,
  );
  const distance = (p) => Math.hypot(p.x - 150, p.y - 150);
  assert.ok(distance(points.at(-1)) > distance(points[0]));
  assert.equal(Math.round(points.at(-1).x), 150);
  assert.equal(points[0].dot, null);
  assert.ok(points.at(-1).dot > points[1].dot);
});
