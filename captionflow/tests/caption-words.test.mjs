import test from 'node:test';
import assert from 'node:assert/strict';
import { activeWordIndex, wordTimings } from '../src/caption-words.mjs';

test('splits the segment across words in proportion to their length', () => {
  const timings = wordTimings('a bbb', 0, 4);
  assert.deepEqual(timings.map(t => t.word), ['a', 'bbb']);
  assert.equal(timings[0].start, 0);
  assert.ok(Math.abs(timings[0].end - (4 * 2) / 6) < 1e-9);
  assert.ok(Math.abs(timings[1].end - 4) < 1e-9);
});

test('covers the whole segment with contiguous word times', () => {
  const timings = wordTimings('one two three', 2.5, 8.5);
  assert.equal(timings[0].start, 2.5);
  assert.ok(Math.abs(timings.at(-1).end - 8.5) < 1e-9);
  for (let i = 1; i < timings.length; i++) assert.ok(Math.abs(timings[i].start - timings[i - 1].end) < 1e-9);
});

test('finds the word being spoken at a time, and none outside the segment', () => {
  const timings = wordTimings('hello there friend', 0, 6);
  assert.equal(activeWordIndex(timings, 0.1), 0);
  assert.equal(activeWordIndex(timings, timings[1].start + 0.01), 1);
  assert.equal(activeWordIndex(timings, 6), -1);
});

test('handles empty text and zero-length segments', () => {
  assert.deepEqual(wordTimings('   ', 0, 2), []);
  assert.equal(wordTimings('hi', 3, 3)[0].end, 3);
});
