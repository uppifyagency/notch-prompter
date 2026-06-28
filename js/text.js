// text.js — pure text utilities shared by the matcher and the renderer.
// Ported 1:1 from Textream's Swift (MarqueeTextView.splitTextIntoWords,
// BrowserServer.charOffsetForWordProgress / letterCount / isAnnotation).

const CJK_RANGES = [
  [0x4e00, 0x9fff], [0x3400, 0x4dbf], [0x20000, 0x2a6df],
  [0xf900, 0xfaff], [0x3040, 0x309f], [0x30a0, 0x30ff], [0xac00, 0xd7af],
];

export function isCJK(codePoint) {
  return CJK_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);
}

// Letters/digits across Latin, Latin-extended, Cyrillic, CJK, Hangul.
const ALNUM = /[a-zA-Z0-9À-ɏЀ-ӿ　-鿿가-힯]/;

// Splits text into display-ready words. CJK characters are split into single
// glyphs so the flow layout can wrap them; runs of non-CJK chars stay grouped.
export function splitTextIntoWords(text) {
  const tokens = text.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
  const result = [];
  for (const token of tokens) {
    if (![...token].some((ch) => isCJK(ch.codePointAt(0)))) {
      result.push(token);
      continue;
    }
    let buffer = '';
    for (const ch of token) {
      if (isCJK(ch.codePointAt(0))) {
        if (buffer) { result.push(buffer); buffer = ''; }
        result.push(ch);
      } else {
        buffer += ch;
      }
    }
    if (buffer) result.push(buffer);
  }
  return result;
}

// Lowercase, keep only letters, numbers and whitespace.
export function normalize(text) {
  let out = '';
  for (const ch of text.toLowerCase()) {
    if (ALNUM.test(ch) || /\s/.test(ch)) out += ch;
  }
  return out;
}

// The [bracket] cue pattern, shared by the editor highlighter (matches Textream's
// HighlightingTextEditor, which highlights \[[^\]]+\] annotations).
const BRACKET = /\[[^\]]+\]/g;

// Split free text into plain / annotation segments for the editor backdrop (#29).
// Annotation segments are [bracketed] cues; everything else is plain. Empty gaps
// (e.g. between adjacent cues) are dropped.
export function tokenizeForEditor(text) {
  const segments = [];
  let last = 0;
  for (const m of text.matchAll(BRACKET)) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), annotation: false });
    segments.push({ text: m[0], annotation: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), annotation: false });
  return segments;
}

// An annotation word is a [bracketed] cue or an emoji-only token (no letters/digits).
export function isAnnotation(word) {
  if (word.startsWith('[') && word.endsWith(']')) return true;
  return !ALNUM.test(word);
}

// Count of letters/digits in a word (min 1), used to decide when a word is "fully lit".
export function letterCount(word) {
  let n = 0;
  for (const ch of word) if (ALNUM.test(ch)) n++;
  return Math.max(1, n);
}

// Split a script into pages on a line that is only dashes ("---", 3+), the
// Markdown thematic-break convention. Pages are trimmed; empties are dropped.
// Always returns at least one page (so the reader has something to show).
export function splitIntoPages(text) {
  const pages = text.split(/^\s*-{3,}\s*$/m).map((p) => p.trim()).filter(Boolean);
  return pages.length ? pages : [''];
}

// The trailing N words of a transcript — the "what you just said" tail shown
// under the reader. Upstream Textream shows the last 5.
export function lastSpokenWords(text, n = 5) {
  if (!text) return '';
  return text.split(' ').filter(Boolean).slice(-n).join(' ');
}

// Bound a value to an inclusive [lo, hi] range.
export function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(value, hi));
}

// Catch-up scrolling: turn a wheel deltaY (px) into a new word-progress value,
// proportional to the scroll and clamped to [0, wordCount]. Scrolling down
// (positive delta) reads forward; scrolling up rewinds.
export function nextProgressFromWheel(progress, deltaY, wordCount, pixelsPerWord = 30) {
  return clamp(progress + deltaY / pixelsPerWord, 0, wordCount);
}

// Map a fractional word-progress value to a character offset into the
// space-joined source string. Whole words contribute length+1 (the space);
// the current word contributes a fraction of its length.
export function charOffsetForWordProgress(progress, words, totalCharCount) {
  const wholeWord = Math.floor(progress);
  const frac = progress - wholeWord;
  let offset = 0;
  for (let i = 0; i < Math.min(wholeWord, words.length); i++) {
    offset += words[i].length + 1;
  }
  if (wholeWord < words.length) {
    offset += Math.floor(words[wholeWord].length * frac);
  }
  return Math.min(offset, totalCharCount);
}
