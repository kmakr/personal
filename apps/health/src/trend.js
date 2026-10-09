// A plain-language step trend over rolling four-week windows. Calendar months
// would always compare a partly shared month, because the current day is never shared.
const WINDOW = 28;
const round = (value) => (Math.round(value / 100) * 100).toLocaleString('en-GB');

function average(rows) {
  const values = rows.map((row) => row.steps).filter((value) => value != null);
  if (!values.length) return { average: null, recorded: 0 };
  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    recorded: values.length,
  };
}

// days: the public window, oldest first, ending on the last shared date.
export function stepTrend(days) {
  const current = average(days.slice(-WINDOW));
  if (current.recorded < 7) return null;
  // Compare only when both windows have at least half their days recorded.
  const before = average(days.slice(-2 * WINDOW, -WINDOW));
  const comparable = current.recorded >= 14 && before.recorded >= 14;
  return { ...current, previous: comparable ? before.average : null };
}

export function trendSentence(trend) {
  if (!trend) return '';
  const now = `About ${round(trend.average)} steps a day`;
  if (trend.previous == null)
    return trend.recorded === WINDOW
      ? `${now} over the last four weeks.`
      : `${now}, from ${trend.recorded} recorded days in the last four weeks.`;
  const change = trend.previous ? (trend.average - trend.previous) / trend.previous : 1;
  if (Math.abs(change) < 0.05)
    return `${now} over the last four weeks, about the same as the four weeks before.`;
  return `${now} over the last four weeks, ${change > 0 ? 'up' : 'down'} from ${round(trend.previous)} the four weeks before.`;
}
