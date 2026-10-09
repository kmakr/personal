import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedSnapshot, publicData, readPublicData, seal, unseal } from '../cloud/public-data.js';
import { addDays } from '../server/health.js';
const now = new Date('2026-09-30T04:00:00Z');
const empty = {
  steps: null,
  zoneMinutes: null,
  sleepMinutes: null,
  sleepStages: null,
  restingHeartRate: null,
  hrv: null,
  oxygen: null,
  respiratoryRate: null,
};
const fullWeek = (start, values = {}) =>
  Array.from({ length: 7 }, (_, i) => ({
    date: addDays(start, i),
    steps: 1000,
    zoneMinutes: 10,
    oxygen: 98,
    ...values,
  }));
const night = {
  interval: { startTime: '2026-09-20T23:41:00Z', endTime: '2026-09-21T07:02:00Z' },
  summary: {
    minutesAsleep: '400',
    stagesSummary: [
      { type: 'DEEP', minutes: '80' },
      { type: 'LIGHT', minutes: '220' },
      { type: 'REM', minutes: '100' },
      { type: 'AWAKE', minutes: '41' },
    ],
  },
  stages: [{ type: 'DEEP', startTime: '2026-09-21T00:10:00Z' }],
};
test('publishes approved daily measurements and strips all other personal fields', async () => {
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
      sleep: night,
    }),
  };
  const result = await readPublicData({ get: async () => input }, now);
  assert.deepEqual(result.weeks.at(-1), {
    start: '2026-09-21',
    end: '2026-09-27',
    steps: 7000,
    zoneMinutes: 70,
    breathingRate: 14,
  });
  assert.deepEqual(Object.keys(result).sort(), ['days', 'mode', 'policy', 'weeks']);
  assert.deepEqual(
    result.days.find((row) => row.date === '2026-09-21'),
    {
      date: '2026-09-21',
      steps: 1000,
      zoneMinutes: 10,
      sleepMinutes: 400,
      sleepStages: { deep: 80, light: 220, rem: 100, awake: 41 },
      restingHeartRate: 60,
      hrv: 42,
      oxygen: 98,
    },
  );
  assert.equal(result.policy.version, 7);
  // Sleep times and the stage sequence never leave, only the four stage totals.
  for (const field of [
    'private',
    'secret',
    'fetchedAt',
    'respiratoryRate',
    'warnings',
    'T23:41',
    'T07:02',
    'T00:10',
    'interval',
    'summary',
  ])
    assert.ok(!JSON.stringify(result).includes(field), field);
  for (const row of result.days)
    assert.deepEqual(Object.keys(row).sort(), [
      'date',
      'hrv',
      'oxygen',
      'restingHeartRate',
      'sleepMinutes',
      'sleepStages',
      'steps',
      'zoneMinutes',
    ]);
  for (const row of result.weeks)
    assert.deepEqual(Object.keys(row).sort(), [
      'breathingRate',
      'end',
      'start',
      'steps',
      'zoneMinutes',
    ]);
});
test('breathing rate is public only as a rounded weekly average of at least four nights', () => {
  const rows = fullWeek('2026-09-21', { respiratoryRate: null });
  [13.2, 14.1, 15.4].forEach((value, i) => (rows[i].respiratoryRate = value));
  assert.equal(publicData({ days: rows }, now).weeks.at(-1).breathingRate, null);
  rows[3].respiratoryRate = 14.6;
  const result = publicData({ days: rows }, now);
  // (13.2 + 14.1 + 15.4 + 14.6) / 4 = 14.325
  assert.equal(result.weeks.at(-1).breathingRate, 14);
  // Daily rows never carry it, even though it is stored per day.
  for (const row of result.days)
    assert.ok(!('respiratoryRate' in row) && !('breathingRate' in row));
  // Implausible readings are ignored rather than averaged in.
  rows[4].respiratoryRate = 300;
  rows[5].respiratoryRate = 2;
  assert.equal(publicData({ days: rows }, now).weeks.at(-1).breathingRate, 14);
});
test('a day is shared once it ends at Hong Kong midnight, never while it is under way', () => {
  const input = { days: fullWeek('2026-09-28') };
  const before = publicData(input, new Date('2026-09-30T15:59:59Z'));
  assert.equal(before.days.at(-1).date, '2026-09-29');
  const after = publicData(input, new Date('2026-09-30T16:00:00Z'));
  assert.equal(after.days.at(-1).date, '2026-09-30');
  assert.equal(after.days.at(-1).steps, 1000);
  assert.ok(!before.days.some((row) => row.date >= '2026-09-30'));
});
test('a week is shared once its Sunday ends', () => {
  const input = { days: fullWeek('2026-09-28') };
  assert.equal(publicData(input, new Date('2026-10-04T15:59:59Z')).weeks.at(-1).end, '2026-09-27');
  assert.equal(publicData(input, new Date('2026-10-04T16:00:00Z')).weeks.at(-1).steps, 7000);
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
        { date: '2026-09-21', steps: 1, zoneMinutes: 2, oxygen: 98.4, hrv: 3, email: 'x' },
        {
          date: '2026-09-22',
          steps: Infinity,
          zoneMinutes: -1,
          oxygen: 101,
          hrv: 900,
          restingHeartRate: 4,
          sleepMinutes: 2000,
          sleepStages: { deep: -5, rem: 'x' },
        },
        { date: 'invalid', steps: 1 },
      ],
    }),
    {
      fetchedAt: 'timestamp',
      days: [
        { ...empty, date: '2026-09-21', steps: 1, zoneMinutes: 2, oxygen: 98.4, hrv: 3 },
        { ...empty, date: '2026-09-22' },
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
