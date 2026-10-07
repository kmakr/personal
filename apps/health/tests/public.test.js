import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedSnapshot, publicData, readPublicData, seal, unseal } from '../cloud/public-data.js';
import { addDays } from '../server/health.js';
const now = new Date('2026-10-07T04:00:00Z');
const fullWeek = (start, values = {}) =>
  Array.from({ length: 7 }, (_, i) => ({
    date: addDays(start, i),
    steps: 1000,
    zoneMinutes: 10,
    oxygen: 98,
    ...values,
  }));
test('publishes approved daily measurements and strips all other personal and medical fields', async () => {
  const input = {
    fetchedAt: 'private',
    email: 'private',
    tokens: { refresh_token: 'secret' },
    warnings: [{ message: 'private' }],
    days: fullWeek('2026-09-21', {
      hrv: 42,
      restingHeartRate: 60,
      respiratoryRate: 14,
      sleepMinutes: 400,
      access_token: 'secret',
      sleep: { stages: ['private'] },
    }),
  };
  const result = await readPublicData({ get: async () => input }, now);
  assert.deepEqual(result.weeks.at(-1), {
    start: '2026-09-21',
    end: '2026-09-27',
    steps: 7000,
    zoneMinutes: 70,
  });
  assert.deepEqual(Object.keys(result).sort(), ['days', 'mode', 'policy', 'weeks']);
  assert.deepEqual(
    result.days.find((row) => row.date === '2026-09-21'),
    { date: '2026-09-21', steps: 1000, zoneMinutes: 10 },
  );
  assert.equal(result.policy.version, 4);
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
  ])
    assert.ok(!JSON.stringify(result).includes(field), field);
  for (const row of result.days)
    assert.deepEqual(Object.keys(row).sort(), ['date', 'steps', 'zoneMinutes']);
  for (const row of result.weeks)
    assert.deepEqual(Object.keys(row).sort(), ['end', 'start', 'steps', 'zoneMinutes']);
});
test('daily disclosure waits seven full days after the day ends at Hong Kong midnight', () => {
  const input = { days: fullWeek('2026-09-28') };
  const before = publicData(input, new Date('2026-10-07T15:59:59Z'));
  assert.equal(before.days.at(-1).date, '2026-09-29');
  const after = publicData(input, new Date('2026-10-07T16:00:00Z'));
  assert.equal(after.days.at(-1).date, '2026-09-30');
  assert.equal(after.days.at(-1).steps, 1000);
  assert.ok(!before.days.some((row) => row.date >= '2026-09-30'));
});
test('weekly disclosure still waits seven full days after the week ends', () => {
  const input = { days: fullWeek('2026-09-28') };
  assert.equal(publicData(input, new Date('2026-10-11T15:59:59Z')).weeks.at(-1).end, '2026-09-27');
  assert.equal(publicData(input, new Date('2026-10-11T16:00:00Z')).weeks.at(-1).steps, 7000);
});
test('recent and old records cannot enter the fixed 84-day daily window', () => {
  const result = publicData({ days: [...fullWeek('2026-10-01'), ...fullWeek('2026-06-01')] }, now);
  assert.equal(result.days.length, 84);
  assert.equal(result.days[0].date, '2026-07-08');
  assert.equal(result.days.at(-1).date, '2026-09-29');
  assert.ok(result.days.every((row) => row.steps === null && row.zoneMinutes === null));
});
test('partial weeks keep daily values while totals require seven measured days; zero is valid', () => {
  const rows = fullWeek('2026-09-21', { steps: 0, zoneMinutes: 0 });
  rows[3].zoneMinutes = null;
  const result = publicData({ days: rows }, now);
  assert.equal(result.weeks.at(-1).steps, 0);
  assert.equal(result.weeks.at(-1).zoneMinutes, null);
  assert.equal(result.days.find((row) => row.date === '2026-09-21').zoneMinutes, 0);
  assert.equal(result.days.find((row) => row.date === '2026-09-24').zoneMinutes, null);
});
test('snapshot strips unapproved fields and rejects invalid measurements and dates', () => {
  assert.deepEqual(
    sharedSnapshot({
      fetchedAt: 'timestamp',
      tokens: 'secret',
      days: [
        { date: '2026-09-21', steps: 1, zoneMinutes: 2, oxygen: 98.4, hrv: 3 },
        { date: '2026-09-22', steps: Infinity, zoneMinutes: -1, oxygen: 101 },
        { date: 'invalid', steps: 1 },
      ],
    }),
    {
      fetchedAt: 'timestamp',
      days: [
        { date: '2026-09-21', steps: 1, zoneMinutes: 2 },
        { date: '2026-09-22', steps: null, zoneMinutes: null },
      ],
    },
  );
});
test('an unconnected feed contains no sample measurements', async () => {
  const result = await readPublicData({ get: async () => undefined }, now);
  assert.equal(result.days.length, 84);
  assert.ok(result.days.every((row) => row.steps === null && row.zoneMinutes === null));
});
test('cloud credential encryption round-trips and rejects another key', async () => {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const encrypted = await seal({ refresh_token: 'private-token' }, key);
  assert.ok(!JSON.stringify(encrypted).includes('private-token'));
  assert.deepEqual(await unseal(encrypted, key), { refresh_token: 'private-token' });
  await assert.rejects(unseal(encrypted, Buffer.alloc(32).toString('base64')));
});
