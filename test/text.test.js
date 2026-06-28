import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitTextIntoWords, normalize, isAnnotation, letterCount, charOffsetForWordProgress, isCJK,
  nextProgressFromWheel, clamp, lastSpokenWords, splitIntoPages, tokenizeForEditor,
} from '../js/text.js';

test('tokenizeForEditor splits text into plain and [bracket] annotation segments', () => {
  assert.deepEqual(tokenizeForEditor('say [pause] then go'), [
    { text: 'say ', annotation: false },
    { text: '[pause]', annotation: true },
    { text: ' then go', annotation: false },
  ]);
});

test('tokenizeForEditor returns one plain segment when there are no annotations', () => {
  assert.deepEqual(tokenizeForEditor('just words'), [{ text: 'just words', annotation: false }]);
});

test('tokenizeForEditor handles adjacent annotations and drops empty gaps', () => {
  assert.deepEqual(tokenizeForEditor('[a][b]'), [
    { text: '[a]', annotation: true },
    { text: '[b]', annotation: true },
  ]);
});

test('tokenizeForEditor treats an unclosed bracket as plain text', () => {
  assert.deepEqual(tokenizeForEditor('[oops no close'), [{ text: '[oops no close', annotation: false }]);
});

test('tokenizeForEditor returns an empty list for empty text', () => {
  assert.deepEqual(tokenizeForEditor(''), []);
});

test('splitTextIntoWords splits on whitespace and newlines', () => {
  assert.deepEqual(splitTextIntoWords('hello   world\nfoo'), ['hello', 'world', 'foo']);
});

test('splitTextIntoWords drops empty tokens', () => {
  assert.deepEqual(splitTextIntoWords('   a  \n\n  b '), ['a', 'b']);
});

test('splitTextIntoWords splits CJK into single glyphs but keeps latin runs grouped', () => {
  assert.deepEqual(splitTextIntoWords('你好world'), ['你', '好', 'world']);
});

test('isCJK recognises Han and Hiragana, rejects Latin', () => {
  assert.equal(isCJK('好'.codePointAt(0)), true);
  assert.equal(isCJK('あ'.codePointAt(0)), true);
  assert.equal(isCJK('a'.codePointAt(0)), false);
});

test('normalize lowercases and strips punctuation but keeps whitespace', () => {
  assert.equal(normalize('Hello, World!'), 'hello world');
});

test('isAnnotation detects brackets and emoji-only tokens', () => {
  assert.equal(isAnnotation('[pause]'), true);
  assert.equal(isAnnotation('👋'), true);
  assert.equal(isAnnotation('hello'), false);
});

test('letterCount counts alphanumerics, min 1', () => {
  assert.equal(letterCount('hi!'), 2);
  assert.equal(letterCount('...'), 1);
});

test('splitIntoPages splits on a "---" line, trims, and drops empty pages', () => {
  assert.deepEqual(splitIntoPages('one\n---\ntwo'), ['one', 'two']);
  assert.deepEqual(splitIntoPages('just one page'), ['just one page']);
  assert.deepEqual(splitIntoPages('a\n\n----\n\nb\n---\nc'), ['a', 'b', 'c']);
});

test('splitIntoPages returns a single empty page for empty input', () => {
  assert.deepEqual(splitIntoPages(''), ['']);
  assert.deepEqual(splitIntoPages('   \n---\n  '), ['']);
});

test('splitIntoPages does not treat a "---" inside a line as a break', () => {
  assert.deepEqual(splitIntoPages('a -- b --- c'), ['a -- b --- c']);
});

test('lastSpokenWords keeps the trailing 5 words by default', () => {
  assert.equal(lastSpokenWords('alpha bravo charlie delta echo foxtrot golf'), 'charlie delta echo foxtrot golf');
  assert.equal(lastSpokenWords('one two three'), 'one two three');
  assert.equal(lastSpokenWords(''), '');
  assert.equal(lastSpokenWords('a b c d e f', 3), 'd e f');
});

test('clamp bounds a value to [lo, hi]', () => {
  assert.equal(clamp(0.15, 0, 0.6), 0.15);
  assert.equal(clamp(-1, 0, 0.6), 0);
  assert.equal(clamp(5, 0, 0.6), 0.6);
});

test('nextProgressFromWheel advances forward on positive delta, proportional to it', () => {
  // 60px of wheel at 30px/word = +2 words
  assert.equal(nextProgressFromWheel(10, 60, 100, 30), 12);
  // twice the delta moves twice as far
  assert.equal(nextProgressFromWheel(10, 120, 100, 30), 14);
});

test('nextProgressFromWheel retreats on negative delta but never below 0', () => {
  assert.equal(nextProgressFromWheel(5, -60, 100, 30), 3);
  assert.equal(nextProgressFromWheel(1, -9000, 100, 30), 0);
});

test('nextProgressFromWheel clamps to the word count', () => {
  assert.equal(nextProgressFromWheel(99, 9000, 100, 30), 100);
});

test('charOffsetForWordProgress maps whole and fractional progress', () => {
  const words = ['ab', 'cde']; // joined "ab cde" → total 6
  assert.equal(charOffsetForWordProgress(0, words, 6), 0);
  assert.equal(charOffsetForWordProgress(1, words, 6), 3);   // "ab" + space
  assert.equal(charOffsetForWordProgress(1.5, words, 6), 4); // + half of "cde" (floor 1)
  assert.equal(charOffsetForWordProgress(99, words, 6), 6);  // clamped to total
});
