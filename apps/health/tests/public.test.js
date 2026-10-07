import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activitySnapshot,
  publicData,
  readPublicData,
  seal,
  unseal,
} from '../cloud/public-data.js';
import { addDays } from '../server/health.js';
const now = new Date('2026-10-07T04:00:00Z');
const fullWeek = (start, values = {}) =>
  Array.from({ length: 7 }, (_, i) => ({
    date: addDays(start, i),
    steps: 1000,
    zoneMinutes: 10,
    ...values,
  }));
test('publishes only fixed weekly activity totals and no medical or account fields', async () => {
  const input = {
    fetchedAt: '2026-10-07T03:24:11Z',
    email: 'private@example.com',
    tokens: { refresh_token: 'secret' },
    warnings: [{ metric: 'sleep', message: 'private' }],
    days: fullWeek('2026-09-21', {
      hrv: 42,
      restingHeartRate: 60,
      oxygen: 98,
      respiratoryRate: 14,
      sleepMinutes: 400,
      access_token: 'secret',
      sleep: { interval: { startTime: 'private' }, stages: ['private'] },
    }),
  };
  // Simulate a legacy stored snapshot: the response must strip it before a new sync occurs.
  const result = await readPublicData({ get: async () => input }, now);
  assert.deepEqual(result.weeks.at(-1), {
    start: '2026-09-21',
    end: '2026-09-27',
    steps: 7000,
    zoneMinutes: 70,
  });
  assert.deepEqual(Object.keys(result).sort(), ['mode', 'policy', 'weeks']);
  assert.equal(result.weeks.length, 12);
  const text = JSON.stringify(result);
  for (const field of [
    'private',
    'secret',
    'fetchedAt',
    'sleep',
    'restingHeartRate',
    'hrv',
    'oxygen',
    'respiratoryRate',
    'warnings',
    'days',
  ]) {
    assert.ok(!text.includes(field), field);
  }
  for (const row of result.weeks)
    assert.deepEqual(Object.keys(row).sort(), ['end', 'start', 'steps', 'zoneMinutes']);
});
test('waits seven full days after a week ends in Hong Kong time', () => {
  const input = { days: fullWeek('2026-09-28') };
  const before = publicData(input, new Date('2026-10-11T15:59:59Z'));
  assert.equal(before.weeks.at(-1).end, '2026-09-27');
  const after = publicData(input, new Date('2026-10-11T16:00:00Z'));
  assert.deepEqual(after.weeks.at(-1), {
    start: '2026-09-28',
    end: '2026-10-04',
    steps: 7000,
    zoneMinutes: 70,
  });
});
test('does not publish current or incomplete weeks, even if the snapshot contains them', () => {
  const result = publicData({ days: [...fullWeek('2026-09-28'), ...fullWeek('2026-10-05')] }, now);
  assert.ok(result.weeks.every((week) => week.steps === null && week.zoneMinutes === null));
  assert.equal(result.weeks.at(-1).end, '2026-09-27');
});
test('requires all seven measured days per metric and preserves measured zero', () => {
  const rows = fullWeek('2026-09-21', { steps: 0, zoneMinutes: 0 });
  rows[3].zoneMinutes = null;
  const result = publicData({ days: rows }, now).weeks.at(-1);
  assert.equal(result.steps, 0);
  assert.equal(result.zoneMinutes, null);
  assert.equal(publicData({ days: rows.slice(1) }, now).weeks.at(-1).steps, null);
  rows[0].steps = Infinity;
  assert.equal(publicData({ days: rows }, now).weeks.at(-1).steps, null);
});
test('migrates cloud snapshots to activity-only records', () => {
  assert.deepEqual(
    activitySnapshot({
      fetchedAt: 'timestamp',
      tokens: 'secret',
      days: [
        {
          date: '2026-09-21',
          steps: 1,
          zoneMinutes: 2,
          sleep: { secret: true },
          hrv: 3,
        },
        { date: 'invalid', steps: 1 },
      ],
    }),
    { fetchedAt: 'timestamp', days: [{ date: '2026-09-21', steps: 1, zoneMinutes: 2 }] },
  );
});
test('an unconnected feed returns no sample values', async () => {
  const result = await readPublicData({ get: async () => undefined }, now);
  assert.equal(result.weeks.length, 12);
  assert.ok(result.weeks.every((week) => week.steps === null && week.zoneMinutes === null));
});
test('cloud credential encryption round-trips and rejects another key', async () => {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const encrypted = await seal({ refresh_token: 'private-token' }, key);
  assert.ok(!JSON.stringify(encrypted).includes('private-token'));
  assert.deepEqual(await unseal(encrypted, key), {
    refresh_token: 'private-token',
  });
  await assert.rejects(unseal(encrypted, Buffer.alloc(32).toString('base64')));
});
