import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechMatcher, editDistance } from '../js/matcher.js';

const SCRIPT = 'the quick brown fox jumps over the lazy dog';

test('editDistance computes Levenshtein distance', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('same', 'same'), 0);
});

test('start initialises source and resets progress', () => {
  const m = new SpeechMatcher();
  const src = m.start(SCRIPT);
  assert.equal(src, SCRIPT);
  assert.equal(m.recognizedCharCount, 0);
});

test('exact speech advances the highlight forward', () => {
  const m = new SpeechMatcher();
  m.start(SCRIPT);
  const after = m.match('the quick brown');
  assert.ok(after > 0, 'should advance');
  assert.ok(after <= SCRIPT.length);
});

test('progress only moves forward, never backward', () => {
  const m = new SpeechMatcher();
  m.start(SCRIPT);
  m.match('the quick brown fox jumps');
  const peak = m.recognizedCharCount;
  m.match('the quick'); // earlier phrase should not rewind
  assert.ok(m.recognizedCharCount >= peak);
});

test('tolerates misrecognised words across incremental partial results', () => {
  const m = new SpeechMatcher();
  m.start(SCRIPT);
  // Speech arrives as growing partial transcripts (as the Web Speech API delivers).
  // "brown"→"browns" and "fox"→"box" are misrecognised but fuzzy-match the script.
  for (const t of ['the', 'the quick', 'the quick browns', 'the quick browns box', 'the quick browns box jumps']) {
    m.match(t);
  }
  assert.ok(m.recognizedCharCount >= 'the quick brown fox'.length - 4, `advanced to ${m.recognizedCharCount}`);
});

test('a single noisy far-ahead transcript is gated by confidence', () => {
  const m = new SpeechMatcher();
  m.start(SCRIPT);
  m.match('the'); // small, allowed
  const before = m.recognizedCharCount;
  // one big jump that does not match the start region should not leap to the end
  m.match('completely unrelated noise');
  assert.ok(m.recognizedCharCount - before <= 15 || m.recognizedCharCount === before);
});

test('jumpTo moves the highlight to an explicit offset', () => {
  const m = new SpeechMatcher();
  m.start(SCRIPT);
  m.jumpTo(10);
  assert.equal(m.recognizedCharCount, 10);
  assert.equal(m.matchStartOffset, 10);
});
