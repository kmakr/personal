import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivals, msUntilHongKongMidnight, untilText } from '../src/midnight.js';

test('Hong Kong midnight is 16:00 UTC every day', () => {
  assert.equal(msUntilHongKongMidnight(Date.parse('2026-10-10T15:59:00Z')), 60000);
  assert.equal(msUntilHongKongMidnight(Date.parse('2026-10-10T16:00:00Z')), 86400000);
  assert.equal(msUntilHongKongMidnight(Date.parse('2026-10-10T04:00:00Z')), 12 * 3600000);
});

test('arrivals are the days added after the old feed ended', () => {
  const old = [{ date: '2026-09-30' }, { date: '2026-10-01' }];
  const next = [{ date: '2026-10-01' }, { date: '2026-10-02' }];
  assert.deepEqual(arrivals(old, next), ['2026-10-02']);
  assert.deepEqual(arrivals(old, old), []);
  assert.deepEqual(arrivals(undefined, next), []);
  assert.deepEqual(arrivals([], next), []);
});

test('countdown wording', () => {
  assert.equal(untilText(60000), 'in 1 minute');
  assert.equal(untilText(35 * 60000), 'in 35 minutes');
  assert.equal(untilText(70 * 60000), 'in about 1 hour');
  assert.equal(untilText(6.2 * 3600000), 'in about 6 hours');
});
