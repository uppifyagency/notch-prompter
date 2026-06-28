import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPage, removePage, movePage, joinPages, pagePreview } from '../js/pages.js';
import { splitIntoPages } from '../js/text.js';

test('pagePreview shows a 1-based number and the first line, truncated', () => {
  assert.equal(pagePreview('Hello world\nsecond line', 0), '1. Hello world');
  assert.equal(pagePreview('', 2), '3. (empty)');
  assert.equal(pagePreview('aaaaaaaa', 0, 4), '1. aaaa');
});

test('addPage appends an empty page by default, returning a new array', () => {
  const a = ['one'];
  const b = addPage(a);
  assert.deepEqual(b, ['one', '']);
  assert.deepEqual(a, ['one'], 'input is not mutated');
});

test('addPage inserts at a given index with optional text', () => {
  assert.deepEqual(addPage(['a', 'c'], 1, 'b'), ['a', 'b', 'c']);
  assert.deepEqual(addPage(['a', 'b'], 0, 'z'), ['z', 'a', 'b']);
});

test('removePage drops the page at the index without mutating the input', () => {
  const a = ['a', 'b', 'c'];
  assert.deepEqual(removePage(a, 1), ['a', 'c']);
  assert.deepEqual(a, ['a', 'b', 'c']);
});

test('removePage never empties the deck — removing the last page yields one blank page', () => {
  assert.deepEqual(removePage(['only'], 0), ['']);
});

test('movePage reorders a page from one position to another', () => {
  assert.deepEqual(movePage(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(movePage(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
});

test('joinPages and splitIntoPages round-trip for trimmed non-empty pages', () => {
  const pages = ['first page', 'second\nwith two lines', 'third'];
  assert.deepEqual(splitIntoPages(joinPages(pages)), pages);
});
