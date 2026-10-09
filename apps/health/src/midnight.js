// Days become public at midnight Hong Kong time. Hong Kong has no daylight
// saving time, so that midnight is always 16:00 UTC.
const OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export function msUntilHongKongMidnight(now = Date.now()) {
  return DAY - ((now + OFFSET) % DAY);
}

// Dates in the new feed that are later than anything in the old one.
export function arrivals(previous, next) {
  const last = previous?.at(-1)?.date;
  if (!last || !Array.isArray(next)) return [];
  return next.filter((row) => row.date > last).map((row) => row.date);
}

export function untilText(ms) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? '' : 's'}`;
}
