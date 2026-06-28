import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../js/presets.js';

// We own the storage boundary, so we fake it (a Fake, not a mock): an in-memory
// localStorage + a minimal location. store.js reads these at construction time.
function installFakes(initial = {}) {
  const map = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  globalThis.location = { search: '', origin: 'http://x', pathname: '/' };
  return map;
}

test('Store.reset restores every setting to DEFAULTS but keeps the user script', async () => {
  const map = installFakes();
  const { Store } = await import('../js/store.js?reset1');
  const s = new Store();
  s.set('fontColor', 'green');
  s.set('scrollSpeed', 7);
  s.set('script', 'my talk');

  s.reset();

  assert.equal(s.get('fontColor'), DEFAULTS.fontColor);
  assert.equal(s.get('scrollSpeed'), DEFAULTS.scrollSpeed);
  assert.equal(s.get('script'), 'my talk', 'content is preserved across a settings reset');
  // persisted: a fresh Store reads the reset values back
  const s2 = new Store();
  assert.equal(s2.get('fontColor'), DEFAULTS.fontColor);
});

test('Store.reset produces a deep-independent copy (mutation does not leak into DEFAULTS)', async () => {
  installFakes();
  const { Store } = await import('../js/store.js?reset2');
  const s = new Store();
  s.reset();
  s.set('fontColor', 'pink');
  assert.equal(DEFAULTS.fontColor, 'white', 'DEFAULTS stays untouched');
});
