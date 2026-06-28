// speech.js — microphone layer for the voice modes.
//   Recognition: Web Speech API, emits growing transcript chunks.
//   AudioMeter:  Web Audio RMS levels for the waveform + silence detection.
// SpeechRecognizer (Apple's SFSpeechRecognizer) has no web equivalent, so we
// substitute the browser engine and feed its transcript to the same matcher.

export const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export class Recognition {
  constructor({ onTranscript, onError, onState } = {}) {
    this.onTranscript = onTranscript || (() => {});
    this.onError = onError || (() => {});
    this.onState = onState || (() => {});
    this.active = false;
    this.rec = null;
  }

  start(locale) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { this.onError('unsupported'); return; }
    this.active = true;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = locale || navigator.language || 'en-US';

    rec.onresult = (event) => {
      let finalChunk = '', interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalChunk += t; else interim += t;
      }
      this.onTranscript((finalChunk + interim).trim(), finalChunk.length > 0);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false;
        this.onError('not-allowed');
      }
      // 'no-speech' / 'aborted' / 'network' fall through to onend → restart.
    };
    rec.onend = () => {
      this.onState(false);
      if (this.active) { try { rec.start(); this.onState(true); } catch { /* race */ } }
    };

    try { rec.start(); this.onState(true); } catch { /* already started */ }
    this.rec = rec;
  }

  stop() {
    this.active = false;
    if (this.rec) { this.rec.onend = null; try { this.rec.stop(); } catch { /* ignore */ } this.rec = null; }
    this.onState(false);
  }
}

export class AudioMeter {
  constructor(bars = 30) {
    this.levels = new Array(bars).fill(0);
    this.bars = bars;
    this.stream = null;
    this.ctx = null;
    this.raf = 0;
  }

  // Average of the most recent levels — drives Voice-Activated scrolling.
  get isSpeaking() {
    const recent = this.levels.slice(-10);
    const avg = recent.reduce((a, b) => a + b, 0) / Math.max(recent.length, 1);
    return avg > 0.08;
  }

  async start(deviceId = '') {
    const audio = deviceId ? { deviceId: { exact: deviceId } } : true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    } catch { return false; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.ctx.createMediaStreamSource(this.stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      this.levels.push(Math.min(rms * 5, 1));
      if (this.levels.length > this.bars) this.levels.shift();
      this.raf = requestAnimationFrame(tick);
    };
    tick();
    return true;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close().catch(() => {});
    this.stream = null; this.ctx = null;
    this.levels = new Array(this.bars).fill(0);
  }
}
