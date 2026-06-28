// prompter.js — renders the streaming text and the audio waveform.
// Word-coloring, the "current word" underline, read-dimming and auto-scroll all
// match Textream's native WordFlowLayout / ExternalDisplayView (via BrowserServer).

import { isAnnotation, letterCount } from './text.js';

function parseColor(c) {
  if (c.startsWith('#')) {
    const h = c.length === 4
      ? [c[1] + c[1], c[2] + c[2], c[3] + c[3]]
      : [c.slice(1, 3), c.slice(3, 5), c.slice(5, 7)];
    return h.map((x) => parseInt(x, 16));
  }
  const m = c.match(/\d+/g);
  return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
}
const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

export class Prompter {
  constructor(scrollEl, textEl, waveEl) {
    this.scrollEl = scrollEl;
    this.textEl = textEl;
    this.waveEl = waveEl;
    this.words = [];
  }

  setScript(words) {
    this.words = words;
    this.textEl.innerHTML = '';
    let cp = 0;
    for (const wd of words) {
      const ann = isAnnotation(wd);
      const sp = document.createElement('span');
      sp.className = ann ? 'w ann' : 'w';
      sp.dataset.s = cp;
      sp.dataset.l = wd.length;
      sp.dataset.lc = letterCount(wd);
      sp.dataset.a = ann ? '1' : '0';
      sp.textContent = `${wd} `;
      this.textEl.appendChild(sp);
      cp += wd.length + 1;
    }
  }

  // Map a character offset back to a word index (for tap-to-jump).
  charOffsetOfNode(node) {
    return node.dataset?.s !== undefined ? parseInt(node.dataset.s, 10) : null;
  }

  render({ charCount, totalCharCount, wordTracking, fontColor, cueColor, brightness, levels }) {
    const rgb = parseColor(fontColor);
    const crgb = parseColor(cueColor);
    const spans = this.textEl.children;

    let nextIdx = -1;
    if (wordTracking) {
      for (let i = 0; i < spans.length; i++) {
        const d = spans[i].dataset;
        if (d.a === '1') continue;
        const lit = Math.max(0, Math.min(+d.l, charCount - +d.s));
        if (lit < +d.lc) { nextIdx = i; break; }
      }
    }

    let scrollTgt = null;
    for (let i = 0; i < spans.length; i++) {
      const sp = spans[i], d = sp.dataset;
      const charOff = +d.s, wLen = +d.l, lc = +d.lc, ann = d.a === '1';
      const lit = Math.max(0, Math.min(wLen, charCount - charOff));
      const fullyLit = lit >= lc;
      const isCurrent = (i === nextIdx) || (charCount - charOff >= 0 && !fullyLit && !ann);

      let color, underline = false;
      if (!wordTracking) {
        color = ann ? rgba(crgb, 0.4) : fontColor;
      } else if (ann) {
        color = fullyLit ? rgba(crgb, brightness.read) : rgba(crgb, brightness.unread);
      } else if (fullyLit) {
        color = rgba(rgb, 0.3);
      } else if (isCurrent) {
        color = rgba(rgb, 0.6);
        underline = true;
      } else {
        color = fontColor;
      }

      sp.style.color = color;
      sp.style.textDecoration = underline ? 'underline' : 'none';
      if (underline) {
        sp.style.textDecorationColor = color;
        sp.style.textUnderlineOffset = '4px';
      }
      if (isCurrent || (!scrollTgt && fullyLit)) scrollTgt = sp;
    }

    this.#autoScroll(scrollTgt);
    if (this.waveEl) this.#waveform(levels || [], totalCharCount ? charCount / totalCharCount : 0);
  }

  #autoScroll(target) {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const pr = this.scrollEl.getBoundingClientRect();
    const mid = pr.top + pr.height * 0.4;
    if (r.top > mid + 40 || r.bottom < pr.top) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  #waveform(levels, pct) {
    const wf = this.waveEl;
    while (wf.children.length < levels.length) {
      const b = document.createElement('div');
      b.className = 'wf';
      wf.appendChild(b);
    }
    const n = wf.children.length;
    for (let i = 0; i < n; i++) {
      const l = i < levels.length ? levels[i] : 0;
      const lit = (n > 1 ? i / (n - 1) : 0) <= pct;
      wf.children[i].style.height = `${Math.max(3, l * 32)}px`;
      wf.children[i].style.background = lit ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.15)';
    }
  }
}
