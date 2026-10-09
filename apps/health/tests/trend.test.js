import test from 'node:test';
import assert from 'node:assert/strict';
import { stepTrend, trendSentence } from '../src/trend.js';

const days = (steps) => steps.map((value, i) => ({ date: `d${i}`, steps: value }));
const empty = (length) => Array.from({ length }, () => null);

test('trend needs a week of recorded days and skips missing ones', () => {
  assert.equal(stepTrend(days([...empty(80), 1, 2, 3, 4, 5, 6])), null);
  const trend = stepTrend(days([...empty(73), ...Array(11).fill(12100)]));
  assert.deepEqual(trend, { average: 12100, recorded: 11, previous: null });
  assert.equal(
    trendSentence(trend),
    'About 12,100 steps a day, from 11 recorded days in the last four weeks.',
  );
});

test('trend compares four-week windows only when both are half recorded', () => {
  const up = stepTrend(days([...empty(28), ...Array(28).fill(8000), ...Array(28).fill(9640)]));
  assert.equal(
    trendSentence(up),
    'About 9,600 steps a day over the last four weeks, up from 8,000 the four weeks before.',
  );
  const steady = stepTrend(days([...Array(28).fill(10000), ...Array(28).fill(10300)]));
  assert.match(trendSentence(steady), /about the same as the four weeks before\.$/);
  const down = stepTrend(days([...Array(28).fill(10000), ...Array(28).fill(7000)]));
  assert.match(trendSentence(down), /down from 10,000/);
  // Thirteen recorded days before is too few to compare against.
  const sparse = stepTrend(days([...empty(15), ...Array(13).fill(5000), ...Array(28).fill(9000)]));
  assert.equal(sparse.previous, null);
  assert.equal(trendSentence(sparse), 'About 9,000 steps a day over the last four weeks.');
  // Zero is a real value and does not divide by zero.
  assert.match(
    trendSentence(stepTrend(days([...Array(28).fill(0), ...Array(28).fill(500)]))),
    /up from 0/,
  );
});
