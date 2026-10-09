export function calendarMonths(days) {
  return [...new Set(days.map((row) => row.date.slice(0, 7)))];
}
// Open on the newest month with a week of shared days, so a new month does not
// open as one plant beside empty weeks.
export function defaultMonth(days) {
  const months = calendarMonths(days);
  const latest = months.at(-1);
  const shared = days.filter((row) => row.date.startsWith(latest)).length;
  return shared < 7 && months.length > 1 ? months.at(-2) : latest;
}
export function calendarCells(days, month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return [];
  const [year, number] = month.split('-').map(Number);
  if (number < 1 || number > 12) return [];
  const first = new Date(Date.UTC(year, number - 1, 1));
  const padding = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const records = new Map(days.map((row) => [row.date, row]));
  const cells = Array.from({ length: padding }, () => null);
  for (let day = 1; day <= length; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ date, row: records.get(date) || null });
  }
  while (cells.length % 7) cells.push(null);
  // Drop whole weeks before the first or after the last shared date; they would
  // hold only placeholders.
  const firstDate = days[0]?.date;
  const last = days.at(-1)?.date;
  const outside = (week) =>
    week.every((cell) => !cell || cell.date < firstDate || cell.date > last);
  while (last && cells.length > 7 && outside(cells.slice(0, 7))) cells.splice(0, 7);
  while (last && cells.length > 7 && outside(cells.slice(-7))) cells.splice(-7);
  return cells;
}
// Weeks from the first one holding a shared record. Earlier weeks would be empty.
export function seasonWeeks(weeks, firstDate) {
  if (!Array.isArray(weeks) || !firstDate) return [];
  return weeks.filter((week) => week.end >= firstDate);
}
