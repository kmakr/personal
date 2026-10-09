import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fieldNotes } from '../src/field-notes.js';

const rows = [
  { date: '2026-09-26', steps: 21173, zoneMinutes: 90 },
  { date: '2026-09-27', steps: 9000, zoneMinutes: 240 },
  { date: '2026-09-28', steps: null, zoneMinutes: null },
  { date: '2026-09-29', steps: 1768, zoneMinutes: 62 },
];

test('field notes describe the garden in plain sentences', () => {
  const notes = fieldNotes(rows, rows[3], { start: '2026-09-21', breathingRate: 15 });
  assert.deepEqual(notes, [
    '3 of 4 days recorded, 31,941 steps between them: about 10,600 a day.',
    'The tallest grew on Saturday 26 Sept, at 21,173 steps.',
    '392 active minutes in all. The wind blew hardest on Sunday 27 Sept, with 240.',
    'The moth rests on Tuesday 29 Sept, the newest day: 1,768 steps and 62 active minutes. It breathes 15 times a minute, my average for the week of Monday 21 Sept.',
  ]);
});

test('a complete week counts plants, and one day skips comparisons', () => {
  const week = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-09-2${i + 1}`,
    steps: 1000,
    zoneMinutes: null,
  }));
  assert.match(fieldNotes(week, null, null)[0], /^Seven plants, 7,000 steps/);
  assert.deepEqual(fieldNotes([rows[0]], rows[0], null), [
    'One plant, 21,173 steps.',
    'The moth rests on Saturday 26 Sept, the newest day: 21,173 steps and 90 active minutes.',
  ]);
  assert.deepEqual(
    fieldNotes([{ date: '2026-09-26', steps: null, zoneMinutes: null }], null, null),
    [],
  );
});
