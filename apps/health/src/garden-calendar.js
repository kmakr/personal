export function calendarMonths(days) {
  return [...new Set(days.map((row) => row.date.slice(0, 7)))];
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
  return cells;
}
