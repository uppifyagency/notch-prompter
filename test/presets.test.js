import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FONT_SIZES, FONT_FAMILIES, COLORS, CUE_BRIGHTNESS, LISTENING_MODES,
  MIRROR_AXES, LIMITS, DEFAULTS,
} from '../js/presets.js';

test('font size presets match Textream point sizes', () => {
  assert.equal(FONT_SIZES.xs.pt, 14);
  assert.equal(FONT_SIZES.sm.pt, 16);
  assert.equal(FONT_SIZES.lg.pt, 20);
  assert.equal(FONT_SIZES.xl.pt, 24);
});

test('six font colors are available', () => {
  assert.deepEqual(Object.keys(COLORS), ['white', 'yellow', 'green', 'blue', 'pink', 'orange']);
});

test('four font families including dyslexia', () => {
  assert.deepEqual(Object.keys(FONT_FAMILIES), ['sans', 'serif', 'mono', 'dyslexia']);
});

test('cue brightness opacities match Textream', () => {
  assert.equal(CUE_BRIGHTNESS.dim.unread, 0.2);
  assert.equal(CUE_BRIGHTNESS.bright.read, 1.0);
});

test('three listening modes', () => {
  assert.deepEqual(Object.keys(LISTENING_MODES), ['wordTracking', 'classic', 'silencePaused']);
});

test('mirror axes flip the correct scale factors', () => {
  assert.deepEqual([MIRROR_AXES.horizontal.scaleX, MIRROR_AXES.horizontal.scaleY], [-1, 1]);
  assert.deepEqual([MIRROR_AXES.vertical.scaleX, MIRROR_AXES.vertical.scaleY], [1, -1]);
  assert.deepEqual([MIRROR_AXES.both.scaleX, MIRROR_AXES.both.scaleY], [-1, -1]);
});

test('limits and defaults are consistent', () => {
  assert.equal(LIMITS.notchWidth.default, 340);
  assert.equal(LIMITS.scrollSpeed.default, 3);
  assert.equal(DEFAULTS.listeningMode, 'wordTracking');
  assert.equal(DEFAULTS.overlayMode, 'pinned');
});
