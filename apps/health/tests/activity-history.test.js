import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchActivityHistory, mergeActivityHistory } from '../cloud/activity-history.js';

test('initial history covers 98 days in bounded approved-measurement requests; later syncs use 28', async () => {
  for (const [backfilled, count] of [
    [false, 7],
    [true, 2],
  ]) {
    const calls = [];
    await fetchActivityHistory({}, '2026-10-07', backfilled, async (_, end, days, metrics) => {
      calls.push({ end, days, metrics });
      return { days: [], warnings: [] };
    });
    assert.equal(calls.length, count);
    assert.deepEqual(calls[0], {
      end: '2026-10-07',
      days: 14,
      metrics: [
        'steps',
        'zoneMinutes',
        'sleep',
        'restingHeartRate',
        'hrv',
        'oxygen',
        'respiratoryRate',
      ],
    });
    assert.equal(calls.at(-1).end, backfilled ? '2026-09-23' : '2026-07-15');
  }
});
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
test('merge preserves failed measurements, keeps only stage totals, and retains the date window', () => {
  const stages = { deep: 60, light: 200, rem: 90, awake: 30 };
  const result = mergeActivityHistory(
    {
      days: [
        { date: '2026-07-01', steps: 10 },
        { date: '2026-07-02', steps: 20 },
        {
          date: '2026-10-06',
          steps: 100,
          zoneMinutes: 8,
          oxygen: 97.5,
          hrv: 44,
          sleepMinutes: 350,
          sleepStages: stages,
        },
        { date: '2026-10-08', steps: 30 },
      ],
    },
    [
      {
        fetchedAt: 'now',
        warnings: [{ metric: 'zoneMinutes' }, { metric: 'sleep' }],
        days: [
          { date: '2026-10-06', steps: 200, zoneMinutes: null, oxygen: 99, sleep: null },
          { date: '2026-10-07', steps: 0, zoneMinutes: null, sleep: { interval: {} } },
        ],
      },
    ],
    '2026-10-07',
  );
  assert.deepEqual(result.days, [
    { ...empty, date: '2026-07-02', steps: 20 },
    {
      ...empty,
      date: '2026-10-06',
      steps: 200,
      zoneMinutes: 8,
      oxygen: 99,
      sleepMinutes: 350,
      sleepStages: stages,
    },
    { ...empty, date: '2026-10-07', steps: 0 },
  ]);
});
