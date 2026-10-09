// Geometry for the sleep roots, the heartbeat, and the twelve-week spiral. Pure,
// so tests can check it without a browser.

// Roots hang from the ground line (y = 0) in a 48-wide box. Ten hours asleep
// reaches the full depth. Deep sleep thickens the taproot, light sleep grows
// side roots, REM grows fine ones, and time awake breaks the taproot.
export const ROOT_DEPTH = 100;
export function roots(row) {
  const stages = row.sleepStages || {};
  const asleep =
    row.sleepMinutes ??
    (['deep', 'light', 'rem'].some((stage) => stages[stage] != null)
      ? (stages.deep || 0) + (stages.light || 0) + (stages.rem || 0)
      : null);
  if (asleep == null || asleep <= 0) return null;
  const depth = 12 + (Math.min(asleep, 600) / 600) * (ROOT_DEPTH - 12);
  const deepShare = Math.min((stages.deep || 0) / asleep, 0.35) / 0.35;
  const branches = [];
  for (const [kind, every, length] of [
    ['light', 60, 10],
    ['rem', 20, 5.5],
  ]) {
    const n = Math.min(10, Math.round((stages[kind] || 0) / every));
    for (let k = 0; k < n; k++) {
      const y = 5 + ((k + (kind === 'rem' ? 0.75 : 0.25)) / n) * (depth - 12);
      // Light roots start on the left, REM on the right, then alternate.
      const side = (k + (kind === 'rem' ? 1 : 0)) % 2 ? 1 : -1;
      const reach = length + (k % 3) * (kind === 'rem' ? 1.2 : 2);
      branches.push({
        kind,
        d: `M24 ${y.toFixed(1)} q${(side * reach * 0.55).toFixed(1)} 1.5 ${(side * reach).toFixed(1)} ${(reach * 0.7).toFixed(1)}`,
      });
    }
  }
  return {
    depth,
    width: 1.1 + deepShare * 3.4,
    taproot: `M24 0 Q${row.date.slice(-1) % 2 ? 21 : 27} ${(depth / 2).toFixed(1)} 24 ${depth.toFixed(1)}`,
    // One break in the taproot for every ten minutes awake, at most six.
    breaks: Math.min(6, Math.round((stages.awake || 0) / 10)),
    branches,
  };
}

// The gaps between heartbeats, in milliseconds, at a resting pulse. Real beat
// gaps vary by roughly the HRV figure; that is too small to see, so the spread
// is exaggerated four times. A fixed sequence keeps every visit the same.
export const HRV_EXAGGERATION = 4;
export function beatIntervals(restingHeartRate, hrv = 0, count = 16) {
  const base = 60000 / restingHeartRate;
  return Array.from({ length: count }, (_, i) => {
    const wobble = Math.sin(i * 12.9898) * 43758.5453;
    const unit = (wobble - Math.floor(wobble)) * 2 - 1;
    return Math.round(base + unit * (hrv || 0) * HRV_EXAGGERATION);
  });
}

export const SPIRAL = { size: 300, outer: 138, inner: 36, turns: 3 };

// days: oldest first. The newest day sits on the outer edge; older days drift
// inward toward the portal at the centre, four weeks to a turn.
// dot and haze: functions returning 0 to 1 for a day, or null to leave it out.
export function spiral(days, dot, haze) {
  const { size, outer, inner, turns } = SPIRAL;
  const centre = size / 2;
  const last = Math.max(1, days.length - 1);
  return days.map((day, i) => {
    const radius = inner + (i / last) * (outer - inner);
    const angle = -Math.PI / 2 + (i - last) * ((turns * 2 * Math.PI) / last);
    // Dots shrink toward the centre, where the spiral's turns sit closer.
    const scale = 0.45 + 0.55 * (radius / outer);
    const size = dot(day);
    const cloud = haze(day);
    return {
      date: day.date,
      x: centre + radius * Math.cos(angle),
      y: centre + radius * Math.sin(angle),
      dot: size == null ? null : (1.3 + size * 3.6) * scale,
      haze: cloud == null ? null : (3 + cloud * 8) * scale,
    };
  });
}
