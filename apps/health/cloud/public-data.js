const metrics = [
  'steps',
  'zoneMinutes',
  'restingHeartRate',
  'hrv',
  'oxygen',
  'respiratoryRate',
  'sleepMinutes',
];
const numeric = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const minutes = (v) =>
  v !== undefined && v !== null && Number.isFinite(Number(v)) ? String(Number(v)) : undefined;
export function publicData(data) {
  return {
    mode: 'live',
    source: 'Theo’s Google and Fitbit wearable devices',
    fetchedAt: data.fetchedAt,
    warnings: (data.warnings || []).map((w) => ({
      metric: w.metric,
      status: w.status,
      message: w.message,
    })),
    days: data.days.map((row) => {
      const result = {
        date: row.date,
        ...Object.fromEntries(metrics.map((k) => [k, numeric(row[k])])),
        sleep: null,
      };
      if (row.sleep) {
        const s = row.sleep;
        result.sleep = {
          interval: {
            startTime: s.interval?.startTime,
            endTime: s.interval?.endTime,
            startUtcOffset: s.interval?.startUtcOffset,
            endUtcOffset: s.interval?.endUtcOffset,
          },
          summary: {
            minutesAsleep: minutes(s.summary?.minutesAsleep),
            stagesSummary: (s.summary?.stagesSummary || []).map((v) => ({
              type: v.type,
              minutes: minutes(v.minutes),
            })),
          },
          stages: (s.stages || []).map((v) => ({
            type: v.type,
            startTime: v.startTime,
            endTime: v.endTime,
          })),
        };
      }
      return result;
    }),
  };
}
export async function seal(value, keyText) {
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(keyText), (c) => c.charCodeAt(0)),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  return { iv: Array.from(iv), bytes: Array.from(bytes) };
}
export async function unseal(value, keyText) {
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(keyText), (c) => c.charCodeAt(0)),
    'AES-GCM',
    false,
    ['decrypt'],
  );
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(value.iv) },
        key,
        new Uint8Array(value.bytes),
      ),
    ),
  );
}
