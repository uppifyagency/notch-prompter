// dictation.js — pure text composition for dictating into the editor (B4 / #28).
// The browser speech engine emits a growing transcript per utterance; we splice it
// at a fixed anchor so interim updates overwrite, and commit on a final result.
// State: { base, anchor, text, caret } — base/anchor are frozen during an utterance.

import { clamp } from './text.js';

// Splice `chunk` into `text` at `caret`; the caret ends just past the inserted text.
export function insertAtCaret(text, caret, chunk) {
  const at = clamp(caret, 0, text.length);
  return { text: text.slice(0, at) + chunk + text.slice(at), caret: at + chunk.length };
}

// Begin a dictation session anchored at the current caret in the current text.
export function initDictation(text, caret) {
  const at = clamp(caret, 0, text.length);
  return { base: text, anchor: at, text, caret: at };
}

// Fold one transcript update into the session. Interim updates re-splice from the
// frozen base (so they replace, not stack); a final result commits — the composed
// text becomes the new base and a single separating space is left for the next one.
export function reduceDictation(state, transcript, isFinal) {
  const composed = insertAtCaret(state.base, state.anchor, transcript);
  if (!isFinal) {
    return { base: state.base, anchor: state.anchor, text: composed.text, caret: composed.caret };
  }
  const sep = transcript ? insertAtCaret(composed.text, composed.caret, ' ') : composed;
  return { base: sep.text, anchor: sep.caret, text: sep.text, caret: sep.caret };
}
