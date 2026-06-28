import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertAtCaret, initDictation, reduceDictation } from '../js/dictation.js';

test('insertAtCaret splices a chunk at the caret and advances the caret past it', () => {
  assert.deepEqual(insertAtCaret('Hello world', 5, ','), { text: 'Hello, world', caret: 6 });
  assert.deepEqual(insertAtCaret('', 0, 'hi'), { text: 'hi', caret: 2 });
  assert.deepEqual(insertAtCaret('ab', 99, 'c'), { text: 'abc', caret: 3 }); // caret clamps to end
  assert.deepEqual(insertAtCaret('ab', -5, 'X'), { text: 'Xab', caret: 1 }); // and to start
});

test('dictation replaces interim text on each update (base stays fixed until commit)', () => {
  let s = initDictation('Hello ', 6);
  s = reduceDictation(s, 'world', false);
  assert.equal(s.text, 'Hello world');
  assert.equal(s.caret, 11);
  // a corrected interim overwrites the previous one rather than appending
  s = reduceDictation(s, 'word', false);
  assert.equal(s.text, 'Hello word');
  assert.equal(s.caret, 10);
});

test('a final result commits the segment and leaves a trailing space for the next one', () => {
  let s = initDictation('Hello ', 6);
  s = reduceDictation(s, 'word.', true);
  assert.equal(s.text, 'Hello word. ');
  assert.equal(s.caret, 12);
  // the next segment starts after the committed text + space
  s = reduceDictation(s, 'Next', false);
  assert.equal(s.text, 'Hello word. Next');
  assert.equal(s.caret, 16);
});

test('an empty final result does not add a stray separator', () => {
  let s = initDictation('hi', 2);
  s = reduceDictation(s, '', true);
  assert.equal(s.text, 'hi');
  assert.equal(s.caret, 2);
});
