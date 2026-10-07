export const SCOPES = ['activity_and_fitness', 'sleep', 'health_metrics_and_measurements'].map(
  (s) => `https://www.googleapis.com/auth/googlehealth.${s}.readonly`,
);
export const number = (v) =>
  v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
export function dateKey(d) {
  return d?.year && d?.month && d?.day
    ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
    : null;
}
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function validDate(s) {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
function civil(date) {
  const [year, month, day] = date.split('-').map(Number);
  return { date: { year, month, day }, time: {} };
}
export function sleepDate(s) {
  return (
    dateKey(s.interval?.civilEndTime?.date) ||
    (s.interval?.endTime
      ? new Date(
          Date.parse(s.interval.endTime) + Number.parseFloat(s.interval.endUtcOffset || '0') * 1000,
        )
          .toISOString()
          .slice(0, 10)
      : null)
  );
}
export function normalize(raw, start, days) {
  const rows = Array.from({ length: days }, (_, i) => ({
    date: addDays(start, i),
    steps: null,
    zoneMinutes: null,
    restingHeartRate: null,
    hrv: null,
    oxygen: null,
    respiratoryRate: null,
    sleepMinutes: null,
    sleep: null,
  }));
  const byDate = new Map(rows.map((d) => [d.date, d]));
  for (const p of raw.steps || []) {
    const r = byDate.get(dateKey(p.civilStartTime?.date));
    if (r) r.steps = number(p.steps?.countSum);
  }
  for (const p of raw.zoneMinutes || []) {
    const r = byDate.get(dateKey(p.civilStartTime?.date));
    const z = p.activeZoneMinutes;
    if (r && z) {
      const values = ['sumInFatBurnHeartZone', 'sumInCardioHeartZone', 'sumInPeakHeartZone'].map(
        (k) => number(z[k]),
      );
      r.zoneMinutes = values.some((v) => v !== null)
        ? values.reduce((a, b) => a + (b ?? 0), 0)
        : null;
    }
  }
  for (const [key, field, value] of [
    ['restingHeartRate', 'dailyRestingHeartRate', 'beatsPerMinute'],
    ['hrv', 'dailyHeartRateVariability', 'averageHeartRateVariabilityMilliseconds'],
    ['oxygen', 'dailyOxygenSaturation', 'averagePercentage'],
    ['respiratoryRate', 'dailyRespiratoryRate', 'breathsPerMinute'],
  ]) {
    for (const p of raw[key] || []) {
      const v = p[field];
      const r = byDate.get(dateKey(v?.date));
      if (r) r[key] = number(v[value]);
    }
  }
  for (const p of raw.sleep || []) {
    const s = p.sleep;
    if (!s) continue;
    const r = byDate.get(sleepDate(s));
    if (!r) continue;
    const mins = number(s.summary?.minutesAsleep);
    if (mins !== null) r.sleepMinutes = (r.sleepMinutes ?? 0) + mins;
    if (
      !r.sleep ||
      (s.metadata?.main && !r.sleep.metadata?.main) ||
      (!!s.metadata?.main === !!r.sleep.metadata?.main &&
        (mins ?? 0) > (number(r.sleep.summary?.minutesAsleep) ?? 0))
    )
      r.sleep = s;
  }
  return rows;
}
export async function fetchHealth(client, endDate, days) {
  const start = addDays(endDate, 1 - days),
    end = addDays(endDate, 1);
  const raw = {},
    warnings = [];
  const specs = [
    ['steps', 'steps', true],
    ['zoneMinutes', 'active-zone-minutes', true],
    ['sleep', 'sleep', false],
    ['restingHeartRate', 'daily-resting-heart-rate', false],
    ['hrv', 'daily-heart-rate-variability', false],
    ['oxygen', 'daily-oxygen-saturation', false],
    ['respiratoryRate', 'daily-respiratory-rate', false],
  ];
  await Promise.all(
    specs.map(async ([key, type, rollup]) => {
      try {
        let token;
        const seen = new Set();
        const points = [];
        do {
          const field =
            type === 'sleep'
              ? 'sleep.interval.civil_end_time'
              : `${type.replaceAll('-', '_')}.date`;
          const url = `https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints${rollup ? ':dailyRollUp' : ':reconcile'}`;
          const result = await client.request({
            url,
            method: rollup ? 'POST' : 'GET',
            timeout: 20000,
            ...(rollup
              ? {
                  data: {
                    range: { start: civil(start), end: civil(end) },
                    windowSizeDays: 1,
                    dataSourceFamily: 'users/me/dataSourceFamilies/google-wearables',
                    ...(token ? { pageToken: token } : {}),
                  },
                }
              : {
                  params: {
                    filter: `${field} >= "${start}" AND ${field} < "${end}"`,
                    dataSourceFamily: 'users/me/dataSourceFamilies/google-wearables',
                    pageSize: type === 'sleep' ? 25 : 1000,
                    ...(token ? { pageToken: token } : {}),
                  },
                }),
          });
          points.push(...(result.data[rollup ? 'rollupDataPoints' : 'dataPoints'] || []));
          token = result.data.nextPageToken;
          if (token && seen.has(token)) throw new Error('Repeated page token');
          if (token) seen.add(token);
          if (seen.size > 100) throw new Error('Page limit exceeded');
        } while (token);
        raw[key] = points;
      } catch (e) {
        const status = e.response?.status;
        warnings.push({
          metric: key,
          status: status || 502,
          message:
            status === 403
              ? 'Access denied. Check the API and read permissions.'
              : status === 401
                ? 'Sign in again to restore access.'
                : status === 429
                  ? 'Google request limit reached. Try again later.'
                  : 'Data could not be loaded. Try again.',
        });
      }
    }),
  );
  return {
    mode: 'live',
    days: normalize(raw, start, days),
    warnings,
    fetchedAt: new Date().toISOString(),
    source: 'Google and Fitbit wearable devices',
  };
}
