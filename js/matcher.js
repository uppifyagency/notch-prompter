// matcher.js — voice-to-script position tracker.
// Pure logic (no audio, no DOM) so it is unit-testable. Drives word-tracking:
// given the script and the latest speech transcript, it computes how many
// characters of the script have been spoken (recognizedCharCount).
//
// Two independent strategies (character-level and word-level fuzzy matching)
// vote; an agreement check plus a 2-of-3 confidence gate prevents the highlight
// from jumping ahead on a single noisy transcript. Ported from Textream's
// SpeechRecognizer.matchCharacters (MIT).

import { splitTextIntoWords, normalize } from './text.js';

const ALNUM = /[a-zA-Z0-9À-ɏЀ-ӿ　-鿿가-힯]/;
const strip = (s) => [...s].filter((ch) => ALNUM.test(ch)).join('');

export class SpeechMatcher {
  constructor() {
    this.sourceText = '';
    this.recognizedCharCount = 0;
    this.matchStartOffset = 0;
    this.recentMatchPositions = [];
  }

  start(text) {
    const words = splitTextIntoWords(text);
    this.sourceText = words.join(' ');
    this.recognizedCharCount = 0;
    this.matchStartOffset = 0;
    this.recentMatchPositions = [];
    return this.sourceText;
  }

  // Tap-to-jump: move the highlight to a specific character offset.
  jumpTo(charOffset) {
    this.recognizedCharCount = charOffset;
    this.matchStartOffset = charOffset;
    this.recentMatchPositions = [];
  }

  // Feed the latest transcript; returns the updated recognizedCharCount.
  match(spoken) {
    const charResult = this.#charLevelMatch(spoken);
    const wordResult = this.#wordLevelMatch(spoken);

    // Agreement-based selection: average when close, else the conservative min.
    const tolerance = 20;
    const best = Math.abs(charResult - wordResult) <= tolerance
      ? Math.floor((charResult + wordResult) / 2)
      : Math.min(charResult, wordResult);

    const newCount = this.matchStartOffset + best;
    if (newCount <= this.recognizedCharCount) return this.recognizedCharCount;

    const candidate = Math.min(newCount, this.sourceText.length);

    this.recentMatchPositions.push(candidate);
    if (this.recentMatchPositions.length > 3) this.recentMatchPositions.shift();

    // Confidence gate: at least 2 of the last 3 positions must agree (±10 chars).
    let confirmed = false;
    if (this.recentMatchPositions.length >= 2) {
      const agree = this.recentMatchPositions.filter((p) => Math.abs(p - candidate) <= 10).length;
      confirmed = agree >= 2;
    }
    // Small forward steps stay responsive for normal reading.
    const smallStep = candidate - this.recognizedCharCount <= 15;

    if (confirmed || smallStep) this.recognizedCharCount = candidate;
    return this.recognizedCharCount;
  }

  // Character-level fuzzy walk with ±3 resync windows. Returns the offset of the
  // last confidently-matched character within the remaining source.
  #charLevelMatch(spoken) {
    const src = [...this.sourceText.slice(this.matchStartOffset).toLowerCase()];
    const spk = [...normalize(spoken)];
    let si = 0, ri = 0, lastGood = 0;

    while (si < src.length && ri < spk.length) {
      const sc = src[si], rc = spk[ri];
      if (!ALNUM.test(sc)) { si++; continue; }
      if (!ALNUM.test(rc)) { ri++; continue; }

      if (sc === rc) { si++; ri++; lastGood = si; continue; }

      let found = false;
      const maxSkipR = Math.min(3, spk.length - ri - 1);
      for (let k = 1; k <= maxSkipR; k++) {
        if (spk[ri + k] === sc) { ri += k; found = true; break; }
      }
      if (found) continue;

      const maxSkipS = Math.min(3, src.length - si - 1);
      for (let k = 1; k <= maxSkipS; k++) {
        if (src[si + k] === rc) { si += k; found = true; break; }
      }
      if (found) continue;

      ri++; // genuine mismatch — advance spoken only
    }
    return lastGood;
  }

  // Word-level walk; handles STT word substitutions, skips, and annotation words.
  #wordLevelMatch(spoken) {
    const sourceWords = this.sourceText.slice(this.matchStartOffset).split(' ').filter((w) => w.length);
    const spokenWords = spoken.toLowerCase().split(' ').filter((w) => w.length);
    let si = 0, ri = 0, matched = 0;

    const isAnn = (w) => (w.startsWith('[') && w.endsWith(']')) || strip(w) === '';

    while (si < sourceWords.length && ri < spokenWords.length) {
      if (isAnn(sourceWords[si])) {
        matched += sourceWords[si].length + (si < sourceWords.length - 1 ? 1 : 0);
        si++; continue;
      }
      const srcWord = strip(sourceWords[si].toLowerCase());
      const spkWord = strip(spokenWords[ri]);

      if (srcWord === spkWord || this.#fuzzy(srcWord, spkWord)) {
        matched += sourceWords[si].length;
        si++; ri++;
        if (si < sourceWords.length) matched += 1;
        continue;
      }

      let found = false;
      const maxSpkSkip = Math.min(3, spokenWords.length - ri - 1);
      for (let k = 1; k <= maxSpkSkip; k++) {
        const nx = strip(spokenWords[ri + k]);
        if (srcWord === nx || this.#fuzzy(srcWord, nx)) { ri += k; found = true; break; }
      }
      if (found) continue;

      const maxSrcSkip = Math.min(3, sourceWords.length - si - 1);
      for (let k = 1; k <= maxSrcSkip; k++) {
        const nx = strip(sourceWords[si + k].toLowerCase());
        if (nx === spkWord || this.#fuzzy(nx, spkWord)) {
          for (let s = 0; s < k; s++) matched += sourceWords[si + s].length + 1;
          si += k; found = true; break;
        }
      }
      if (found) continue;

      if (srcWord === '') {
        matched += sourceWords[si].length + (si < sourceWords.length - 1 ? 1 : 0);
        si++; continue;
      }
      ri++;
    }

    while (si < sourceWords.length && isAnn(sourceWords[si])) {
      matched += sourceWords[si].length + (si < sourceWords.length - 1 ? 1 : 0);
      si++;
    }
    return matched;
  }

  #fuzzy(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const shorter = Math.min(a.length, b.length);
    if (shorter >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
    let shared = 0;
    while (shared < shorter && a[shared] === b[shared]) shared++;
    if (shorter >= 3 && shared >= Math.max(3, Math.floor((shorter * 3) / 5))) return true;
    const dist = editDistance(a, b);
    if (shorter <= 2) return false;
    if (shorter <= 4) return dist <= 1;
    if (shorter <= 8) return dist <= 2;
    return dist <= Math.floor(Math.max(a.length, b.length) / 3);
  }
}

export function editDistance(a, b) {
  const A = [...a], B = [...b];
  const dp = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= B.length; j++) {
      const tmp = dp[j];
      dp[j] = A[i - 1] === B[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[B.length];
}
