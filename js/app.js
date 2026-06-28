// app.js — orchestration. Builds the composer controls from the presets, drives
// the three reading modes (word tracking / classic / voice-activated) and the
// three displays (pinned to notch / floating / fullscreen).

import {
  FONT_SIZES, FONT_FAMILIES, COLORS, CUE_BRIGHTNESS,
  OVERLAY_MODES, LISTENING_MODES, MIRROR_AXES, SPEECH_LOCALES, LIMITS, APP_VERSION,
} from './presets.js';
import { Store } from './store.js';
import { SpeechMatcher } from './matcher.js';
import { Recognition, AudioMeter, speechSupported } from './speech.js';
import { Notch } from './notch.js';
import { Prompter } from './prompter.js';
import { splitTextIntoWords, charOffsetForWordProgress, nextProgressFromWheel, clamp, lastSpokenWords, splitIntoPages, tokenizeForEditor } from './text.js';
import { extractPptxText } from './pptx.js';
import { fileKind, scriptFilename } from './files.js';
import { addPage, removePage, movePage, joinPages, pagePreview } from './pages.js';
import { pickDeviceId, audioInputs } from './devices.js';
import { initDictation, reduceDictation } from './dictation.js';

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
let readPages = new Set(); // B3 — page indices completed this session (read badges)
let pageTimer = 0;       // pending auto-advance timeout
let pageCountdown = 0;   // live "next page in Ns" ticker (#27)
function clearPageTimers() { clearTimeout(pageTimer); clearInterval(pageCountdown); }

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
  renderPagesBar();
  renderEditorHighlight();
  renderPreview();
  refreshMicDevices();
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
  // Classic mode has no microphone, so the mic picker is irrelevant there.
  $('field-mic').hidden = store.get('listeningMode') === 'classic';
}

// Populate the microphone picker from the browser's device list (B1 / #30).
// Labels are only revealed after mic permission, so they may be generic until then.
async function refreshMicDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) { $('field-mic').hidden = true; return; }
  let inputs = [];
  try { inputs = audioInputs(await navigator.mediaDevices.enumerateDevices()); } catch { return; }
  const sel = $('mic-device');
  const chosen = pickDeviceId(inputs, store.get('micId'));
  sel.replaceChildren(...inputs.map((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId;
    o.textContent = d.label || `Microphone ${i + 1}`;
    if (d.deviceId === chosen) o.selected = true;
    return o;
  }));
  if (chosen !== store.get('micId')) store.set('micId', chosen);
  sel.onchange = (e) => store.set('micId', e.target.value);
}

/* ---------------------------------------------------- editor tools */

// Single write path for the script: textarea + persistence + page-bar + highlight.
function setScript(text) {
  $('script').value = text;
  store.set('script', text);
  renderPagesBar();
  renderEditorHighlight();
}
$('script').addEventListener('input', (e) => { store.set('script', e.target.value); renderPagesBar(); renderEditorHighlight(); });

// B5 (#29) — paint the annotation-highlight backdrop from the textarea content.
const editorHl = $('script-hl');
function renderEditorHighlight() {
  editorHl.replaceChildren(...tokenizeForEditor($('script').value).map((s) => {
    if (!s.annotation) return document.createTextNode(s.text);
    const span = document.createElement('span');
    span.className = 'ann';
    span.textContent = s.text;
    return span;
  }));
  editorHl.scrollTop = $('script').scrollTop;
}
$('script').addEventListener('scroll', () => { editorHl.scrollTop = $('script').scrollTop; });

// #53 — live settings preview: a mini prompter reusing the real Prompter renderer,
// reflecting font / size / colors / cue brightness as you change them.
const previewPrompter = new Prompter($('pv-scroll'), $('pv-text'), null);
const PV_WORDS = splitTextIntoWords('Read with you, word by word. [breathe] Calm, clear, on cue.');
const PV_TOTAL = PV_WORDS.join(' ').length;
previewPrompter.setScript(PV_WORDS);
function renderPreview() {
  const txt = $('pv-text');
  txt.style.fontFamily = FONT_FAMILIES[store.get('fontFamily')].css;
  txt.style.fontSize = `${FONT_SIZES[store.get('fontSize')].pt}px`;
  previewPrompter.render({
    charCount: 12,                       // a low value: current word stays near the top (no autoscroll)
    totalCharCount: PV_TOTAL,
    wordTracking: true,
    fontColor: COLORS[store.get('fontColor')].css,
    cueColor: COLORS[store.get('cueColor')].css,
    brightness: CUE_BRIGHTNESS[store.get('cueBrightness')],
    levels: [],
  });
}
// Visual settings funnel through clicks (segments/swatches) and slider input.
$('composer').addEventListener('click', renderPreview);
$('composer').addEventListener('input', renderPreview);
// Load a dropped or picked file into the editor, routing by its kind (files.js).
function loadFile(f) {
  if (!f) return;
  const kind = fileKind(f.name, f.type);
  if (kind === 'keynote') {
    alert('Keynote (.key) files can’t be read directly. In Keynote, export your slides as '
      + 'PowerPoint (.pptx) and drop that here.');
    return;
  }
  if (kind === 'unknown') {
    alert('Unsupported file. Drop a .txt, .md or .pptx file.');
    return;
  }
  const r = new FileReader();
  if (kind === 'pptx') {
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
}
$('file').addEventListener('change', (e) => {
  loadFile(e.target.files[0]);
  e.target.value = ''; // allow re-selecting the same file
});
// Drag-and-drop onto the composer (#34) — same routing as the file picker.
const composer = $('composer');
composer.addEventListener('dragover', (e) => { e.preventDefault(); composer.classList.add('dropping'); });
composer.addEventListener('dragleave', (e) => { if (e.target === composer) composer.classList.remove('dropping'); });
composer.addEventListener('drop', (e) => {
  e.preventDefault();
  composer.classList.remove('dropping');
  loadFile(e.dataTransfer.files[0]);
});
$('sample').onclick = () => setScript(SAMPLE);
// B6 (#35) — save the script to a .txt file (Open is already covered by the file picker).
$('savefile').onclick = () => {
  const t = $('script').value;
  if (!t.trim()) return;
  const url = URL.createObjectURL(new Blob([t], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url; a.download = scriptFilename(t);
  a.click();
  URL.revokeObjectURL(url);
};
$('clear').onclick = () => { setScript(''); $('script').focus(); };

/* ------------------------------------------------ page manager (#24) */
// The textarea string stays the single source of truth: we split it into a deck,
// transform with the pure ops (pages.js), then join back. Read-status badges are
// a stage-time concept (see B3) and intentionally not shown in the composer.
const pagesBar = $('pages-bar');
function deck() { return splitIntoPages($('script').value); }

// A new page needs placeholder text: splitIntoPages drops empty pages, so an
// empty new page would vanish on the round-trip. The placeholder is then selected
// so the user types straight over it.
$('addpage').onclick = () => {
  const d = deck();
  setScript(joinPages(addPage(d, d.length, 'New page')));
  selectPage('New page');
};

function renderPagesBar() {
  const d = deck();
  pagesBar.hidden = d.length <= 1;       // nothing to manage with a single page
  if (pagesBar.hidden) { pagesBar.replaceChildren(); return; }
  pagesBar.replaceChildren(...d.map((page, i) => pageChip(page, i, d.length)));
}

function pageChip(page, i, total) {
  const chip = document.createElement('div');
  chip.className = 'page-chip';
  const label = document.createElement('button');
  label.className = 'page-label';
  label.textContent = pagePreview(page, i);
  label.title = 'Select this page in the editor';
  label.onclick = () => selectPage(page);
  const up = chipBtn('▲', 'Move up', i > 0, () => setScript(joinPages(movePage(deck(), i, i - 1))));
  const down = chipBtn('▼', 'Move down', i < total - 1, () => setScript(joinPages(movePage(deck(), i, i + 1))));
  const del = chipBtn('✕', 'Delete page', true, () => setScript(joinPages(removePage(deck(), i))));
  chip.append(label, up, down, del);
  return chip;
}

function chipBtn(glyph, title, enabled, onClick) {
  const b = document.createElement('button');
  b.className = 'chip-btn';
  b.textContent = glyph;
  b.title = title;
  b.disabled = !enabled;
  if (enabled) b.onclick = onClick;
  return b;
}

// Best-effort navigation: select the page's text in the textarea so it can be edited in place.
function selectPage(page) {
  const ta = $('script');
  const at = ta.value.indexOf(page.trim());
  if (at < 0) return;
  ta.focus();
  ta.setSelectionRange(at, at + page.trim().length);
}

/* -------------------------------------------- dictation into editor (#28) */
// Reuses the Recognition engine, folding transcripts through the pure reducer
// (dictation.js) into the textarea at the caret.
let dictation = null;       // reducer state while dictating, else null
let dictateRec = null;      // the active Recognition, else null
$('dictate').onclick = () => (dictateRec ? stopDictation() : startDictation());

function startDictation() {
  if (!speechSupported) { alert('Voice dictation needs Chrome or Safari.'); return; }
  const ta = $('script');
  dictation = initDictation(ta.value, ta.selectionStart ?? ta.value.length);
  dictateRec = new Recognition({
    onTranscript: (text, isFinal) => {
      dictation = reduceDictation(dictation, text, isFinal);
      ta.value = dictation.text;
      ta.setSelectionRange(dictation.caret, dictation.caret);
      store.set('script', dictation.text);
      renderPagesBar();
      renderEditorHighlight();
    },
    onError: (err) => {
      if (err === 'not-allowed' || err === 'unsupported') {
        stopDictation();
        alert('Microphone blocked or unsupported. Allow access, or use Chrome/Safari.');
      }
    },
  });
  dictateRec.start(store.get('speechLocale'));
  setDictateUI(true);
  ta.focus();
}

function stopDictation() {
  if (dictateRec) { dictateRec.stop(); dictateRec = null; }
  dictation = null;
  setDictateUI(false);
}

function setDictateUI(on) {
  const b = $('dictate');
  b.classList.toggle('recording', on);
  b.querySelector('span').textContent = on ? 'Stop' : 'Dictate';
}
$('share').onclick = async () => {
  const t = $('script').value.trim();
  if (!t) return;
  const url = Store.shareLink(t);
  try { await navigator.clipboard.writeText(url); flash($('share'), 'Copied'); }
  catch { prompt('Copy this link:', url); }
};
// A3 (#54) — reset preferences to defaults (keeping the script); reload to re-render cleanly.
$('reset').onclick = () => {
  if (!confirm('Reset all settings to defaults? Your script is kept.')) return;
  store.reset();
  location.reload();
};
// A4 (#56) — About dialog.
$('about-version').textContent = `v${APP_VERSION}`;
$('about').onclick = () => $('about-dlg').showModal();
$('about-close').onclick = () => $('about-dlg').close();
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
  clearPageTimers();
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

// B3 (#26) — stage page-picker: jump to any page, with read badges + current marker.
$('pagepick-btn').onclick = () => openPagePicker();
function openPagePicker() {
  const dlg = $('pagepick');
  const wasPlaying = playing;
  dlg.replaceChildren(...pages.map((page, i) => {
    const item = document.createElement('button');
    item.className = 'pp-item';
    if (i === pageIndex) item.classList.add('current');
    if (readPages.has(i)) item.classList.add('read');
    const dot = document.createElement('span');
    dot.className = 'pp-dot';
    const label = document.createElement('span');
    label.textContent = pagePreview(page, i);
    item.append(dot, label);
    item.onclick = () => { dlg.close(); goToPage(i, wasPlaying); };
    return item;
  }));
  dlg.showModal();
}

function enter() {
  const full = $('script').value.trim();
  if (!full) { $('script').focus(); return; }

  pages = splitIntoPages(full);
  readPages = new Set();
  $('pagepick-btn').hidden = pages.length <= 1;
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
    await meter.start(store.get('micId'));
    // After permission, labels become available — refresh the picker for next time.
    refreshMicDevices();
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
  clearPageTimers();
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
  readPages.add(pageIndex);   // B3 — this page has been read through
  // G5/#27 — auto-advance to the next page after the configured delay, with a
  // visible per-second countdown (not just a static label).
  if (store.get('autoNextPage') && pageIndex < pages.length - 1) {
    let left = store.get('autoNextPageDelay');
    $('status').textContent = `Next page in ${left}s…`;
    pageCountdown = setInterval(() => {
      left -= 1;
      if (left > 0) $('status').textContent = `Next page in ${left}s…`;
    }, 1000);
    pageTimer = setTimeout(() => goToPage(pageIndex + 1, true), left * 1000);
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

// #9 — drag the bottom handle to resize the reader height (clamped to limits, persisted).
$('reader-resize').addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();   // don't also start a floating-card drag
  const startY = e.clientY;
  const startH = store.get('textHeight');
  const { min, max } = LIMITS.textHeight;
  const move = (ev) => {
    const h = Math.round(clamp(startH + (ev.clientY - startY), min, max));
    document.documentElement.style.setProperty('--reader-h', `${h}px`);
    store.set('textHeight', h);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

// G4/#19 — mouse-wheel to catch up / rewind reading position, in ALL modes. In
// Word Tracking the wheel becomes a manual correction: jumpTo sets the matcher's
// position and frame() reads it back, so the highlight holds until speech advances.
$('scroll').addEventListener('wheel', (e) => {
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
// Fullscreen toggle — shared by the top-right button and the (tappable) notch hint,
// so users who look at the hint can enter fullscreen without hunting for the icon.
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('stage').requestFullscreen?.().catch(() => {});
}
$('full').onclick = toggleFullscreen;
$('notchhint').onclick = toggleFullscreen;
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
