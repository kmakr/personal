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
      metrics: ['steps', 'zoneMinutes', 'oxygen'],
    });
    assert.equal(calls.at(-1).end, backfilled ? '2026-09-23' : '2026-07-15');
  }
});
test('merge preserves failed measurements, strips unapproved medical data, and retains only the date window', () => {
  const result = mergeActivityHistory(
    {
      days: [
        { date: '2026-07-01', steps: 10 },
        { date: '2026-07-02', steps: 20 },
        { date: '2026-10-06', steps: 100, zoneMinutes: 8, oxygen: 97.5, hrv: 44 },
        { date: '2026-10-08', steps: 30 },
      ],
    },
    [
      {
        fetchedAt: 'now',
        warnings: [{ metric: 'zoneMinutes' }, { metric: 'oxygen' }],
        days: [
          { date: '2026-10-06', steps: 200, zoneMinutes: null, oxygen: 99 },
          { date: '2026-10-07', steps: 0, zoneMinutes: null },
        ],
      },
    ],
    '2026-10-07',
  );
  assert.deepEqual(result.days, [
    { date: '2026-07-02', steps: 20, zoneMinutes: null, oxygen: null },
    { date: '2026-10-06', steps: 200, zoneMinutes: 8, oxygen: 97.5 },
    { date: '2026-10-07', steps: 0, zoneMinutes: null, oxygen: null },
  ]);
});
