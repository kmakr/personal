import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, fetchHealth, validDate, SCOPES, sleepDate } from '../server/health.js';
const date = { year: 2026, month: 9, day: 22 };
test('keeps missing data separate from measured zero', () => {
  const rows = normalize(
    { steps: [{ civilStartTime: { date }, steps: { countSum: '0' } }] },
    '2026-09-21',
    2,
  );
  assert.equal(rows[0].steps, null);
  assert.equal(rows[1].steps, 0);
  assert.equal(rows[1].hrv, null);
});
test('maps documented daily fields, weighted minutes, and sleep sessions', () => {
  const sleep = (minutes, main) => ({
    sleep: {
      interval: { civilEndTime: { date } },
      summary: { minutesAsleep: String(minutes) },
      metadata: { main },
    },
  });
  const rows = normalize(
    {
      zoneMinutes: [
        {
          civilStartTime: { date },
          activeZoneMinutes: {
            sumInFatBurnHeartZone: '10',
            sumInCardioHeartZone: '20',
          },
        },
      ],
      restingHeartRate: [{ dailyRestingHeartRate: { date, beatsPerMinute: '58' } }],
      hrv: [
        {
          dailyHeartRateVariability: {
            date,
            averageHeartRateVariabilityMilliseconds: 51,
          },
        },
      ],
      sleep: [sleep(30, false), sleep(420, true)],
    },
    '2026-09-22',
    1,
  );
  assert.equal(rows[0].sleepMinutes, 450);
  assert.equal(rows[0].sleep.summary.minutesAsleep, '420');
  assert.equal(rows[0].zoneMinutes, 30);
  assert.equal(rows[0].restingHeartRate, 58);
  assert.equal(rows[0].hrv, 51);
});
test('uses the sleep end offset at a date boundary', () =>
  assert.equal(
    sleepDate({
      interval: { endTime: '2026-09-21T23:00:00Z', endUtcOffset: '28800s' },
    }),
    '2026-09-22',
  ));
test('rejects impossible dates', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-09-22'), true);
  assert.equal(validDate('bad'), false);
});
test('reads all pages, uses closed-open dates and isolates API failures', async () => {
  const calls = [];
  const client = {
    request: async (r) => {
      calls.push(r);
      if (r.url.includes('daily-oxygen')) throw { response: { status: 403 } };
      if (r.url.includes('/sleep/'))
        return {
          data: r.params.pageToken
            ? {
                dataPoints: [
                  {
                    sleep: {
                      interval: { civilEndTime: { date } },
                      summary: { minutesAsleep: '40' },
                    },
                  },
                ],
              }
            : { dataPoints: [], nextPageToken: 'page2' },
        };
      return { data: { rollupDataPoints: [], dataPoints: [] } };
    },
  };
  const result = await fetchHealth(client, '2026-09-22', 7);
  assert.equal(result.days.length, 7);
  assert.equal(result.days[6].sleepMinutes, 40);
  assert.equal(result.warnings[0].status, 403);
  const steps = calls.find((r) => r.url.includes('/steps/'));
  assert.deepEqual(steps.data.range.end.date, {
    year: 2026,
    month: 9,
    day: 23,
  });
  assert.equal(steps.data.dataSourceFamily, 'users/me/dataSourceFamilies/google-wearables');
  assert.ok(calls.find((r) => r.params?.pageToken === 'page2'));
  assert.ok(SCOPES.every((s) => s.endsWith('.readonly')));
});

test('cloud activity fetch never requests sleep or medical measurements', async () => {
  const requests = [];
  await fetchHealth(
    {
      request: async (input) => {
        requests.push(input.url);
        return { data: { rollupDataPoints: [] } };
      },
    },
    '2026-10-07',
    14,
    ['steps', 'zoneMinutes'],
  );
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every((url) =>
      /dataTypes\/(steps|active-zone-minutes)\/dataPoints:dailyRollUp$/.test(url),
    ),
  );
});

test('approved cloud metrics include daily oxygen averages but no other health data', async () => {
  const calls = [];
  const result = await fetchHealth(
    {
      request: async (input) => {
        calls.push(input);
        return {
          data: { dataPoints: [{ dailyOxygenSaturation: { date, averagePercentage: 98.2 } }] },
        };
      },
    },
    '2026-09-22',
    1,
    ['steps', 'zoneMinutes', 'oxygen'],
  );
  assert.equal(calls.length, 3);
  const oxygen = calls.find((input) => input.url.includes('daily-oxygen-saturation'));
  assert.equal(oxygen.method, 'GET');
  assert.ok(oxygen.url.endsWith(':reconcile'));
  assert.equal(result.days[0].oxygen, 98.2);
  assert.ok(!calls.some((input) => /sleep|heart-rate|respiratory/.test(input.url)));
});
