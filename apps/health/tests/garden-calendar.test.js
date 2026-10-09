import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarCells, calendarMonths, defaultMonth } from '../src/garden-calendar.js';

test('calendar starts Monday and keeps unshared dates separate from missing records', () => {
  const days = [
    { date: '2026-09-01', steps: null, zoneMinutes: null },
    { date: '2026-09-29', steps: 0, zoneMinutes: 0 },
  ];
  const cells = calendarCells(days, '2026-09');
  assert.equal(cells.length, 35);
  assert.equal(cells[0], null);
  assert.deepEqual(cells[1], { date: '2026-09-01', row: days[0] });
  assert.equal(cells.find((cell) => cell?.date === '2026-09-29').row.steps, 0);
  assert.deepEqual(
    cells.find((cell) => cell?.date === '2026-09-30'),
    { date: '2026-09-30', row: null },
  );
});
test('calendar handles leap years and month navigation across the year boundary', () => {
  assert.equal(calendarCells([], '2024-02').filter(Boolean).length, 29);
  assert.equal(calendarCells([], '2025-02').filter(Boolean).length, 28);
  assert.deepEqual(
    calendarMonths([{ date: '2025-12-31' }, { date: '2026-01-01' }, { date: '2026-01-02' }]),
    ['2025-12', '2026-01'],
  );
  assert.deepEqual(calendarCells([], undefined), []);
});
test('calendar drops future weeks and opens on a month with a week of shared days', () => {
  const september = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  }));
  const days = [...september, { date: '2026-10-01' }];
  // 1 Oct is a Thursday: one week remains, and 2–4 Oct stay unshared in it.
  const cells = calendarCells(days, '2026-10');
  assert.equal(cells.length, 7);
  assert.deepEqual(cells.at(-1), { date: '2026-10-04', row: null });
  assert.equal(defaultMonth(days), '2026-09');
  assert.equal(defaultMonth(days.slice(-1)), '2026-10');
  const week = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-0${i + 1}` }));
  assert.equal(defaultMonth([...september, ...week]), '2026-10');
});
test('calendar drops weeks before the first shared date', () => {
  const days = ['2026-09-17', '2026-09-18'].map((date) => ({ date }));
  // 17 Sep is a Thursday, so only the week of 14–20 Sep remains.
  const cells = calendarCells(days, '2026-09');
  assert.equal(cells.length, 7);
  assert.deepEqual(cells[0], { date: '2026-09-14', row: null });
});
