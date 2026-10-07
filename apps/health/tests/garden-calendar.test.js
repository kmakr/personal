import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarCells, calendarMonths } from '../src/garden-calendar.js';

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
