import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDeviceId, audioInputs } from '../js/devices.js';

const mk = (deviceId, label, kind = 'audioinput') => ({ deviceId, label, kind });

test('audioInputs keeps only audio input devices', () => {
  const list = [mk('a', 'Mic A'), mk('cam', 'Cam', 'videoinput'), mk('b', 'Mic B')];
  assert.deepEqual(audioInputs(list).map((d) => d.deviceId), ['a', 'b']);
});

test('pickDeviceId returns the saved device when it still exists', () => {
  const list = [mk('a', 'Mic A'), mk('b', 'Mic B')];
  assert.equal(pickDeviceId(list, 'b'), 'b');
});

test('pickDeviceId falls back to the first audio input when the saved id is gone', () => {
  const list = [mk('a', 'Mic A'), mk('b', 'Mic B')];
  assert.equal(pickDeviceId(list, 'ghost'), 'a');
});

test('pickDeviceId returns the first audio input when nothing is saved', () => {
  const list = [mk('cam', 'Cam', 'videoinput'), mk('a', 'Mic A')];
  assert.equal(pickDeviceId(list, ''), 'a');
});

test('pickDeviceId returns empty string when there are no audio inputs', () => {
  assert.equal(pickDeviceId([mk('cam', 'Cam', 'videoinput')], 'x'), '');
  assert.equal(pickDeviceId([], ''), '');
});
