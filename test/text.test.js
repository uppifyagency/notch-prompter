import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitTextIntoWords, normalize, isAnnotation, letterCount, charOffsetForWordProgress, isCJK,
} from '../js/text.js';

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

test('charOffsetForWordProgress maps whole and fractional progress', () => {
  const words = ['ab', 'cde']; // joined "ab cde" → total 6
  assert.equal(charOffsetForWordProgress(0, words, 6), 0);
  assert.equal(charOffsetForWordProgress(1, words, 6), 3);   // "ab" + space
  assert.equal(charOffsetForWordProgress(1.5, words, 6), 4); // + half of "cde" (floor 1)
  assert.equal(charOffsetForWordProgress(99, words, 6), 6);  // clamped to total
});
