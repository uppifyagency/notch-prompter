// store.js — settings persisted to localStorage, plus shareable-link decoding.
// Mirrors Textream's NotchSettings (UserDefaults) for the web.

import { DEFAULTS } from './presets.js';

const KEY = 'notch-prompter.settings.v1';
const LEGACY_KEY = 'textream.settings.v1'; // pre-rename key; migrated once on load (C1)

export class Store {
  constructor() {
    this.settings = { ...DEFAULTS };
    this.#load();
    this.#readSharedScript();
  }

  get(key) { return this.settings[key]; }

  set(key, value) {
    this.settings[key] = value;
    this.#save();
  }

  #load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { Object.assign(this.settings, JSON.parse(raw)); return; }
      // One-time migration from the old (upstream-named) key. Always clear the
      // legacy key afterwards — even if its JSON was corrupt — so we don't retry.
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        try { Object.assign(this.settings, JSON.parse(legacy)); this.#save(); } catch { /* corrupt — drop it */ }
        localStorage.removeItem(LEGACY_KEY);
      }
    } catch { /* private mode / blocked storage — fall back to defaults */ }
  }

  #save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
  }

  // A shared link (?t=base64 or ?text=plain) overrides the saved script,
  // matching Textream's `textream://read?text=…` URL scheme.
  #readSharedScript() {
    const p = new URLSearchParams(location.search);
    if (p.get('text')) {
      this.settings.script = p.get('text');
    } else if (p.get('t')) {
      try { this.settings.script = decodeURIComponent(escape(atob(p.get('t')))); } catch { /* ignore */ }
    }
  }

  static shareLink(script) {
    const t = btoa(unescape(encodeURIComponent(script)));
    return `${location.origin}${location.pathname}?t=${t}`;
  }
}
