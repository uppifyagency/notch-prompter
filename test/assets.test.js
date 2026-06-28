import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../js/presets.js';

const root = fileURLToPath(new URL('..', import.meta.url));

// A4 (#56): the About version must not drift from package.json.
test('APP_VERSION mirrors package.json version', () => {
  const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));
  assert.equal(APP_VERSION, pkg.version);
});

// A1 (#50): the "Dyslexia" typeface must be bundled, not silently fall back.
test('OpenDyslexic is bundled and declared via @font-face', () => {
  assert.ok(existsSync(root + 'fonts/OpenDyslexic3-Regular.ttf'), 'font file is present');
  const css = readFileSync(root + 'css/app.css', 'utf8');
  assert.match(css, /@font-face/, 'css declares an @font-face');
  assert.match(css, /OpenDyslexic3/, 'the @font-face is for OpenDyslexic3');
  assert.match(css, /fonts\/OpenDyslexic3-Regular\.ttf/, 'it points at the bundled file');
});
