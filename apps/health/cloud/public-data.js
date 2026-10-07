import { addDays, validDate } from '../server/health.js';

export const PUBLIC_POLICY = {
  version: 3,
  metrics: ['steps', 'zoneMinutes', 'oxygen'],
  aggregation: 'daily-and-calendar-week',
  weekStartsOn: 'Monday',
  delayDays: 7,
  timeZone: 'Asia/Hong_Kong',
};
const numeric = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function hongKongDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PUBLIC_POLICY.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
// Retain only the three measurements approved for public sharing.
export function sharedSnapshot(data) {
  return {
    fetchedAt: data.fetchedAt,
    days: (data.days || [])
      .filter((row) => validDate(row.date))
      .map((row) => ({
        date: row.date,
        steps: numeric(row.steps),
        zoneMinutes: numeric(row.zoneMinutes),
        oxygen: numeric(row.oxygen) !== null && row.oxygen <= 100 ? row.oxygen : null,
      })),
  };
}
export function publicData(data, now = new Date()) {
  const date = hongKongDate(now);
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = addDays(date, -((dayOfWeek + 6) % 7));
  // Last eligible Sunday ends at midnight seven full days before this Monday.
  const lastEndExclusive = addDays(monday, -7);
  const records = new Map(sharedSnapshot(data).days.map((row) => [row.date, row]));
  const weeks = Array.from({ length: 12 }, (_, index) => {
    const start = addDays(lastEndExclusive, (index - 12) * 7);
    const rows = Array.from({ length: 7 }, (_, offset) => records.get(addDays(start, offset)));
    const totals = Object.fromEntries(
      ['steps', 'zoneMinutes'].map((metric) => {
        const values = rows.map((row) => numeric(row?.[metric]));
        // Weekly totals remain complete; daily records can be shown independently.
        return [
          metric,
          values.every((value) => value !== null)
            ? values.reduce((sum, value) => sum + value, 0)
            : null,
        ];
      }),
    );
    return { start, end: addDays(start, 6), ...totals };
  });
  // A day must end, then wait seven full days. At Oct 7 midnight, Sep 29 is eligible.
  const dayEndExclusive = addDays(date, -PUBLIC_POLICY.delayDays);
  const days = Array.from({ length: 84 }, (_, index) => {
    const day = addDays(dayEndExclusive, index - 84);
    return records.get(day) || { date: day, steps: null, zoneMinutes: null, oxygen: null };
  });
  return { mode: 'live', policy: PUBLIC_POLICY, weeks, days };
}
export async function readPublicData(storage, now = new Date()) {
  const snapshot = await storage.get('snapshot');
  // Always apply the policy at the response boundary, including to legacy snapshots.
  return publicData(snapshot || { days: [] }, now);
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
