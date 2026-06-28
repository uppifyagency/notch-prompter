// app.js — orchestration. Builds the composer controls from the presets, drives
// the three reading modes (word tracking / classic / voice-activated) and the
// three displays (pinned to notch / floating / fullscreen).

import {
  FONT_SIZES, FONT_FAMILIES, COLORS, CUE_BRIGHTNESS,
  OVERLAY_MODES, LISTENING_MODES, MIRROR_AXES, SPEECH_LOCALES, LIMITS,
} from './presets.js';
import { Store } from './store.js';
import { SpeechMatcher } from './matcher.js';
import { Recognition, AudioMeter, speechSupported } from './speech.js';
import { Notch } from './notch.js';
import { Prompter } from './prompter.js';
import { splitTextIntoWords, charOffsetForWordProgress, nextProgressFromWheel, clamp, lastSpokenWords, splitIntoPages } from './text.js';
import { extractPptxText } from './pptx.js';

const $ = (id) => document.getElementById(id);

const SAMPLE = `Welcome. This teleprompter reads along with you.

Pick Word Tracking and it follows your voice, lighting each word as you say it. Pick Classic and it scrolls on its own. Pin it to the notch, float it anywhere, or go fullscreen.

Tap the text to jump. Tap anywhere else to pause. When you reach the end, you are done.`;

const store = new Store();
const matcher = new SpeechMatcher();
const notch = new Notch();
const prompter = new Prompter($('scroll'), $('text'), $('wave'));

let recognition = null;
let meter = null;
let words = [];
let totalChar = 0;
let progress = 0;        // word progress for classic / voice-activated
let charCount = 0;
let playing = false;
let loop = 0;
let startedAt = 0;
let elapsedBase = 0;
let lastSpoken = '';
let micMuted = false;
let pages = [''];        // G5 — script split into pages on "---" lines
let pageIndex = 0;
let pageTimer = 0;       // pending auto-advance timeout

/* ---------------------------------------------------- composer controls */

function seg(container, presets, current, onSelect) {
  container.innerHTML = '';
  for (const key of Object.keys(presets)) {
    const b = document.createElement('button');
    b.textContent = presets[key].label;
    b.dataset.key = key;
    b.setAttribute('aria-pressed', String(key === current));
    b.onclick = () => {
      [...container.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      onSelect(key);
    };
    container.appendChild(b);
  }
}

function fillSelect(el, presets, current, onSelect) {
  el.innerHTML = '';
  for (const key of Object.keys(presets)) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = presets[key].label;
    if (key === current) o.selected = true;
    el.appendChild(o);
  }
  el.onchange = (e) => onSelect(e.target.value);
}

function swatches(container, current, onSelect) {
  container.innerHTML = '';
  for (const key of Object.keys(COLORS)) {
    const b = document.createElement('button');
    b.className = 'sw';
    b.dataset.key = key;
    b.style.background = COLORS[key].css;
    b.setAttribute('aria-pressed', String(key === current));
    b.setAttribute('aria-label', COLORS[key].label);
    b.onclick = () => {
      [...container.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      onSelect(key);
    };
    container.appendChild(b);
  }
}

function buildComposer() {
  $('script').value = store.get('script');

  seg($('seg-listen'), LISTENING_MODES, store.get('listeningMode'), (k) => {
    store.set('listeningMode', k); $('hint-listen').textContent = LISTENING_MODES[k].desc; reflectMode();
  });
  $('hint-listen').textContent = LISTENING_MODES[store.get('listeningMode')].desc;

  fillSelect($('locale'), SPEECH_LOCALES, store.get('speechLocale'), (k) => store.set('speechLocale', k));

  seg($('seg-overlay'), OVERLAY_MODES, store.get('overlayMode'), (k) => {
    store.set('overlayMode', k); $('hint-overlay').textContent = OVERLAY_MODES[k].desc; reflectMode();
  });
  $('hint-overlay').textContent = OVERLAY_MODES[store.get('overlayMode')].desc;

  seg($('seg-family'), FONT_FAMILIES, store.get('fontFamily'), (k) => store.set('fontFamily', k));
  seg($('seg-size'), FONT_SIZES, store.get('fontSize'), (k) => store.set('fontSize', k));
  seg($('seg-bright'), CUE_BRIGHTNESS, store.get('cueBrightness'), (k) => store.set('cueBrightness', k));
  seg($('seg-mirror'), MIRROR_AXES, store.get('mirrorAxis'), (k) => store.set('mirrorAxis', k));

  swatches($('sw-font'), store.get('fontColor'), (k) => store.set('fontColor', k));
  swatches($('sw-cue'), store.get('cueColor'), (k) => store.set('cueColor', k));

  bindSlider('speed', 'speed-val', 'scrollSpeed', (v) => `${v.toFixed(1)} w/s`);
  bindSlider('notchw', 'nw-val', 'notchWidth', (v) => `${Math.round(v)}px`);
  bindSlider('texth', 'th-val', 'textHeight', (v) => `${Math.round(v)}px`);
  bindSlider('glass', 'glass-val', 'glassOpacity', (v) => `${Math.round(v * 100)}%`);
  setGlassOpacity(store.get('glassOpacity')); // sync CSS var with the stored value up front

  $('mirror').checked = store.get('mirror');
  $('mirror').onchange = (e) => { store.set('mirror', e.target.checked); $('seg-mirror').hidden = !e.target.checked; };
  $('seg-mirror').hidden = !store.get('mirror');

  $('elapsed').checked = store.get('showElapsedTime');
  $('elapsed').onchange = (e) => store.set('showElapsedTime', e.target.checked);

  $('autopage').checked = store.get('autoNextPage');
  $('autopage').onchange = (e) => { store.set('autoNextPage', e.target.checked); $('field-pagedelay').hidden = !e.target.checked; };
  $('field-pagedelay').hidden = !store.get('autoNextPage');
  bindSlider('pagedelay', 'pd-val', 'autoNextPageDelay', (v) => `${Math.round(v)}s`);

  reflectMode();
}

function bindSlider(id, valId, key, fmt) {
  const el = $(id);
  el.value = store.get(key);
  $(valId).textContent = fmt(parseFloat(el.value));
  el.oninput = (e) => {
    const v = parseFloat(e.target.value);
    store.set(key, v);
    $(valId).textContent = fmt(v);
    if (id === 'speed') $('speed2').value = v;
    if (id === 'glass') setGlassOpacity(v);
  };
}

// The reader card's fill opacity. One setter so the slider has an immediate,
// observable effect (no Connascence of Manual Task — C2).
function setGlassOpacity(v) {
  const a = clamp(v, LIMITS.glassOpacity.min, LIMITS.glassOpacity.max);
  document.documentElement.style.setProperty('--glass-opacity', String(a));
}

// Show only the controls that matter for the current display / listening mode.
function reflectMode() {
  const overlay = store.get('overlayMode');
  $('dim-fields').hidden = overlay === 'fullscreen';
  $('field-glass').hidden = overlay === 'fullscreen';   // fullscreen has no card
  // Voice language only applies to the mic-driven mode.
  $('field-locale').hidden = store.get('listeningMode') !== 'wordTracking';
}

/* ---------------------------------------------------- editor tools */

$('script').addEventListener('input', (e) => store.set('script', e.target.value));
$('file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const setScript = (text) => { $('script').value = text; store.set('script', text); };
  const r = new FileReader();
  if (/\.pptx$/i.test(f.name)) {
    // G6 — extract slide text from a PowerPoint deck (one slide = one page).
    r.onload = async () => {
      try { setScript(await extractPptxText(new Uint8Array(r.result))); }
      catch (err) { alert(err.message || 'Could not read this .pptx file.'); }
    };
    r.readAsArrayBuffer(f);
  } else {
    r.onload = () => setScript(r.result);
    r.readAsText(f);
  }
  e.target.value = ''; // allow re-selecting the same file
});
$('sample').onclick = () => { $('script').value = SAMPLE; store.set('script', SAMPLE); };
$('clear').onclick = () => { $('script').value = ''; store.set('script', ''); $('script').focus(); };
$('share').onclick = async () => {
  const t = $('script').value.trim();
  if (!t) return;
  const url = Store.shareLink(t);
  try { await navigator.clipboard.writeText(url); flash($('share'), 'Copied'); }
  catch { prompt('Copy this link:', url); }
};
function flash(btn, msg) {
  const span = btn.querySelector('span');
  const old = span.textContent;
  span.textContent = msg;
  setTimeout(() => { span.textContent = old; }, 1600);
}

/* ---------------------------------------------------- stage */

function applyReaderStyle() {
  const reader = $('reader');
  reader.dataset.mode = store.get('overlayMode');
  const root = document.documentElement.style;
  root.setProperty('--reader-w', `${store.get('notchWidth')}px`);
  root.setProperty('--reader-h', `${store.get('textHeight')}px`);
  root.setProperty('--font-px', `${FONT_SIZES[store.get('fontSize')].pt}px`);
  const axis = MIRROR_AXES[store.get('mirrorAxis')];
  const on = store.get('mirror');
  root.setProperty('--mx', on ? axis.scaleX : 1);
  root.setProperty('--my', on ? axis.scaleY : 1);
  setGlassOpacity(store.get('glassOpacity'));
  $('text').style.fontFamily = FONT_FAMILIES[store.get('fontFamily')].css;

  // floating starts centred unless dragged
  if (reader.dataset.mode === 'floating') {
    reader.style.left = `calc(50% - ${store.get('notchWidth') / 2}px)`;
    reader.style.top = '80px';
  } else {
    reader.style.left = ''; reader.style.top = '';
  }
}

// Load one page's text into the matcher / prompter (G5).
function loadPage(i) {
  pageIndex = i;
  const script = pages[i];
  words = splitTextIntoWords(script);
  totalChar = matcher.start(script).length;
  prompter.setScript(words);
  updatePageIndicator();
}

function updatePageIndicator() {
  const multi = pages.length > 1;
  $('pageind').hidden = !multi;
  if (multi) $('pageind').textContent = `${pageIndex + 1} / ${pages.length}`;
}

// Jump to another page (manual arrows or auto-advance). Resets reading position.
function goToPage(i, autoplay) {
  clearTimeout(pageTimer);
  if (i < 0 || i >= pages.length) return;
  stopPlayback();
  setMicMuted(false);
  loadPage(i);
  progress = 0; charCount = 0; lastSpoken = ''; elapsedBase = 0;
  matcher.jumpTo(0);
  $('done').hidden = true;
  $('status').textContent = 'Ready';
  paint();
  setPlayIcon(false);
  if (autoplay) play();
}

function enter() {
  const full = $('script').value.trim();
  if (!full) { $('script').focus(); return; }

  pages = splitIntoPages(full);
  loadPage(0);

  applyReaderStyle();
  $('composer').hidden = true;
  $('stage').hidden = false;
  $('done').hidden = true;
  $('micwarn').hidden = true;

  const voice = store.get('listeningMode') !== 'classic';
  $('wave').style.display = voice ? '' : 'none';
  $('spoken').style.display = voice ? '' : 'none';
  $('mic').style.display = voice ? '' : 'none';
  $('elapsed-clock').style.display = store.get('showElapsedTime') ? '' : 'none';
  $('speed2').value = store.get('scrollSpeed');

  restart();
  updateNotchHint();
  showControls();
}

function exit() {
  stopPlayback();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('stage').hidden = true;
  $('composer').hidden = false;
}

function restart() {
  stopPlayback();
  setMicMuted(false);
  progress = 0; charCount = 0; lastSpoken = ''; elapsedBase = 0;
  matcher.jumpTo(0);
  paint();
  $('done').hidden = true;
  $('status').textContent = 'Ready';
  setPlayIcon(false);
}

// Start the microphone layer the current mode needs. Extracted so play() and
// un-muting share one path (no duplicated mic setup — CQS Command).
async function startListening(mode) {
  if (mode !== 'classic') {
    meter = new AudioMeter(30);
    await meter.start();
  }
  if (mode === 'wordTracking') {
    matcher.matchStartOffset = matcher.recognizedCharCount;
    recognition = new Recognition({
      onTranscript: (text, isFinal) => {
        lastSpoken = text;
        matcher.match(text);
        if (isFinal) matcher.matchStartOffset = matcher.recognizedCharCount;
      },
      onError: (err) => {
        if (err === 'not-allowed') {
          $('micwarn').hidden = false;
          $('micwarn').textContent = 'Microphone blocked. Allow access in your browser to use voice tracking.';
          pause();
        }
      },
      onState: (on) => $('mic').classList.toggle('live', on && !micMuted),
    });
    recognition.start(store.get('speechLocale'));
  }
}

// Tear down all mic capture. The single teardown for pause / stop / mute.
function stopListening() {
  if (recognition) { recognition.stop(); recognition = null; }
  if (meter) { meter.stop(); meter = null; }
  $('mic').classList.remove('live');
}

// Mute = silence the mic without leaving the session. In Word Tracking the
// highlight freezes; in Voice-Activated the scroll pauses; the clock keeps running.
function setMicMuted(on) {
  micMuted = on;
  const m = $('mic');
  m.classList.toggle('muted', on);
  m.setAttribute('aria-pressed', String(on));
  m.setAttribute('aria-label', on ? 'Unmute microphone' : 'Mute microphone');
  m.setAttribute('title', on ? 'Unmute microphone' : 'Mute microphone');
  m.querySelector('use').setAttribute('href', on ? '#i-mic-off' : '#i-mic');
  if (on) {
    stopListening();
  } else if (playing && store.get('listeningMode') !== 'classic') {
    startListening(store.get('listeningMode'));
  }
}

async function play() {
  if (playing) return;
  const mode = store.get('listeningMode');

  if (mode === 'wordTracking' && !speechSupported) {
    $('micwarn').hidden = false;
    $('micwarn').textContent = 'Voice tracking is not supported in this browser. Try Classic mode, or Safari/Chrome.';
    return;
  }

  playing = true;
  setPlayIcon(true);
  startedAt = performance.now();

  if (!micMuted) await startListening(mode);

  $('status').textContent = LISTENING_MODES[mode].label;
  loop = setInterval(frame, 100);
}

function pause() {
  playing = false;
  setPlayIcon(false);
  clearInterval(loop);
  // Accumulate elapsed in every mode (the clock runs in Classic too, where
  // there is no meter — the old meter-guarded version dropped paused time).
  elapsedBase += performance.now() - startedAt;
  stopListening();
  $('status').textContent = 'Paused';
}

function stopPlayback() {
  playing = false;
  clearInterval(loop);
  clearTimeout(pageTimer);
  stopListening();
}

function frame() {
  const mode = store.get('listeningMode');
  const speed = store.get('scrollSpeed');
  const done = totalChar > 0 && charOffsetForWordProgress(progress, words, totalChar) >= totalChar;

  if (mode === 'wordTracking') {
    charCount = matcher.recognizedCharCount;
  } else if (mode === 'classic') {
    if (!done) progress += speed * 0.1;
    charCount = charOffsetForWordProgress(progress, words, totalChar);
  } else { // silencePaused
    if (!done && meter && meter.isSpeaking) progress += speed * 0.1;
    charCount = charOffsetForWordProgress(progress, words, totalChar);
  }

  paint();

  if (store.get('showElapsedTime')) {
    const ms = elapsedBase + (performance.now() - startedAt);
    const s = Math.floor(ms / 1000);
    $('elapsed-clock').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  if (totalChar > 0 && Math.min(charCount, totalChar) >= totalChar) finish();
}

function paint() {
  const mode = store.get('listeningMode');
  prompter.render({
    charCount: Math.min(charCount, totalChar),
    totalCharCount: totalChar,
    wordTracking: mode === 'wordTracking',
    fontColor: COLORS[store.get('fontColor')].css,
    cueColor: COLORS[store.get('cueColor')].css,
    brightness: CUE_BRIGHTNESS[store.get('cueBrightness')],
    levels: meter ? meter.levels : [],
  });
  if ($('spoken').style.display !== 'none') {
    $('spoken').textContent = lastSpokenWords(lastSpoken);
  }
}

function finish() {
  stopPlayback();
  setPlayIcon(false);
  // G5 — auto-advance to the next page after the configured delay.
  if (store.get('autoNextPage') && pageIndex < pages.length - 1) {
    $('status').textContent = `Next page in ${store.get('autoNextPageDelay')}s…`;
    pageTimer = setTimeout(() => goToPage(pageIndex + 1, true), store.get('autoNextPageDelay') * 1000);
    return;
  }
  $('done').hidden = false;
  $('status').textContent = pages.length > 1 ? 'Done (last page)' : 'Done';
}

function setPlayIcon(on) {
  $('play').querySelector('use').setAttribute('href', on ? '#i-pause' : '#i-play');
}

/* ---------------------------------------------------- notch / fullscreen */

function updateNotchHint() {
  const pinned = store.get('overlayMode') === 'pinned';
  notch.measure();
  $('notchhint').hidden = !(pinned && !notch.present);
}
document.addEventListener('fullscreenchange', () => setTimeout(updateNotchHint, 80));

/* ---------------------------------------------------- controls visibility */

let idleTimer = 0;
function showControls() {
  $('stage').classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (playing) $('stage').classList.add('idle'); }, 2600);
}

/* ---------------------------------------------------- tap-to-jump + drag */

let dragMoved = false;
$('reader').addEventListener('pointerdown', (e) => {
  if ($('reader').dataset.mode !== 'floating') return;
  const reader = $('reader');
  const startX = e.clientX, startY = e.clientY;
  const rect = reader.getBoundingClientRect();
  dragMoved = false;
  reader.classList.add('dragging');
  const move = (ev) => {
    if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) dragMoved = true;
    reader.style.left = `${rect.left + (ev.clientX - startX)}px`;
    reader.style.top = `${rect.top + (ev.clientY - startY)}px`;
  };
  const up = () => {
    reader.classList.remove('dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

// G4 — mouse-wheel to catch up / rewind reading position (Classic & Voice-Activated).
// Word Tracking is driven by the matcher, so there the wheel scrolls the text natively.
$('scroll').addEventListener('wheel', (e) => {
  if (store.get('listeningMode') === 'wordTracking') return;
  if (!words.length) return;
  e.preventDefault();
  progress = nextProgressFromWheel(progress, e.deltaY, words.length);
  charCount = charOffsetForWordProgress(progress, words, totalChar);
  matcher.jumpTo(charCount);
  paint();
  showControls();
}, { passive: false });

$('scroll').addEventListener('click', (e) => {
  if (dragMoved) { dragMoved = false; return; }
  const w = e.target.closest('.w');
  if (w) {
    const off = parseInt(w.dataset.s, 10);
    matcher.jumpTo(off);
    progress = words.slice(0, [...$('text').children].indexOf(w)).length;
    charCount = off;
    paint();
  } else {
    playing ? pause() : play();
  }
  showControls();
});

/* ---------------------------------------------------- wiring */

// G2 — mute/unmute the mic from the reader (voice modes only).
$('mic').addEventListener('click', () => {
  if (store.get('listeningMode') === 'classic') return;
  setMicMuted(!micMuted);
  showControls();
});
$('mic').addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); $('mic').click(); }
});

$('start').onclick = enter;
$('exit').onclick = exit;
$('restart').onclick = () => { restart(); showControls(); };
$('play').onclick = () => { playing ? pause() : play(); showControls(); };
$('full').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('stage').requestFullscreen?.().catch(() => {});
};
$('speed2').oninput = (e) => {
  const v = parseFloat(e.target.value);
  store.set('scrollSpeed', v);
  $('speed').value = v;
  $('speed-val').textContent = `${v.toFixed(1)} w/s`;
};
$('stage').addEventListener('pointermove', showControls);

document.addEventListener('keydown', (e) => {
  if ($('stage').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); showControls(); }
  if (e.code === 'Escape' && !document.fullscreenElement) exit();
  if (e.code === 'ArrowRight' && pageIndex < pages.length - 1) { e.preventDefault(); goToPage(pageIndex + 1, playing); showControls(); }
  if (e.code === 'ArrowLeft' && pageIndex > 0) { e.preventDefault(); goToPage(pageIndex - 1, playing); showControls(); }
});

buildComposer();
