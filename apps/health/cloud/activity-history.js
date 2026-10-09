import { addDays } from '../server/health.js';
import { sharedSnapshot, STORED_METRICS } from './public-data.js';

export const HISTORY_DAYS = 98;
export async function fetchActivityHistory(client, end, backfilled, fetchHealth) {
  const batches = [];
  for (let offset = 0; offset < (backfilled ? 28 : HISTORY_DAYS); offset += 14) {
    batches.push(await fetchHealth(client, addDays(end, -offset), 14, STORED_METRICS));
  }
  return batches;
}
export function mergeActivityHistory(previous, batches, end) {
  const merged = new Map(sharedSnapshot(previous || {}).days.map((row) => [row.date, row]));
  for (const batch of batches) {
    for (const row of sharedSnapshot(batch).days) {
      const old = merged.get(row.date);
      for (const warning of batch.warnings) {
        if (STORED_METRICS.includes(warning.metric)) {
          row[warning.metric] = old?.[warning.metric] ?? null;
        }
      }
      merged.set(row.date, row);
    }
  }
  const cutoff = addDays(end, 1 - HISTORY_DAYS);
  return {
    fetchedAt: batches[0]?.fetchedAt,
    days: [...merged.values()]
      .filter((row) => row.date >= cutoff && row.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
