import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileKind, scriptFilename } from '../js/files.js';

test('scriptFilename slugifies the first line into a .txt name', () => {
  assert.equal(scriptFilename('My Great Talk!\nrest'), 'my-great-talk.txt');
  assert.equal(scriptFilename('  Hello,  World  '), 'hello-world.txt');
});

test('scriptFilename falls back to "script.txt" for empty or symbol-only input', () => {
  assert.equal(scriptFilename(''), 'script.txt');
  assert.equal(scriptFilename('   \n  '), 'script.txt');
  assert.equal(scriptFilename('!!!'), 'script.txt');
});

test('scriptFilename caps the slug length', () => {
  assert.equal(scriptFilename('a'.repeat(80)), `${'a'.repeat(40)}.txt`);
});

test('fileKind recognises a .pptx deck by extension, case-insensitive', () => {
  assert.equal(fileKind('Deck.pptx', ''), 'pptx');
  assert.equal(fileKind('DECK.PPTX', ''), 'pptx');
});

test('fileKind recognises a .pptx deck by MIME even without the extension', () => {
  assert.equal(
    fileKind('deck', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    'pptx',
  );
});

test('fileKind recognises Keynote files (so we can guide the user to export)', () => {
  assert.equal(fileKind('Talk.key', ''), 'keynote');
  assert.equal(fileKind('talk', 'application/vnd.apple.keynote'), 'keynote');
});

test('fileKind treats .txt, .md and any text/* MIME as plain text', () => {
  assert.equal(fileKind('script.txt', ''), 'text');
  assert.equal(fileKind('notes.md', ''), 'text');
  assert.equal(fileKind('whatever', 'text/markdown'), 'text');
});

test('fileKind returns "unknown" for unsupported files', () => {
  assert.equal(fileKind('photo.png', 'image/png'), 'unknown');
  assert.equal(fileKind('', ''), 'unknown');
});
