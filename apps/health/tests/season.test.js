import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonWeeks } from '../src/season.js';

test('season starts with the week of the first shared record', () => {
  const weeks = [
    { start: '2026-09-07', end: '2026-09-13', steps: null },
    { start: '2026-09-14', end: '2026-09-20', steps: null },
    { start: '2026-09-21', end: '2026-09-27', steps: 96077 },
  ];
  assert.deepEqual(seasonWeeks(weeks, '2026-09-17'), weeks.slice(1));
  assert.deepEqual(seasonWeeks(weeks, '2026-09-21'), weeks.slice(2));
  assert.deepEqual(seasonWeeks(undefined, '2026-09-21'), []);
  assert.deepEqual(seasonWeeks(weeks, undefined), []);
});
