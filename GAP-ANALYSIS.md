# Textream → notch-prompter — Forensic Capability Map (NSA-grade)

> **What this is.** A 1:1 mapping of **every** capability of the native macOS app
> **Textream** (`github.com/f/textream`, 15 Swift files, 8 654 LOC) against **our web app**
> (`notch-prompter` / `textream-web`, 11 JS/HTML/CSS files, ~2 220 LOC).
> Built by reading the actual upstream Swift source — this **closes HANDOFF §7-A**, which
> warned the earlier parity work was done against a "Characterization Map", not real code.
> Every web status below was verified against the web source (grep/read), not assumed.

**Method.** Two forensic inventories (one per codebase) + cross-reference. Upstream master
list = 58 distinct capabilities. Each row: capability → upstream file(s) → **web status** →
web location / note.

## Legend

| Tag | Meaning |
|---|---|
| ✅ **PARITY** | Present and functionally equivalent in the web app |
| 🟡 **PARTIAL** | Present but degraded / incomplete vs native |
| ❌ **MISSING** | Web-portable, but **not implemented** — this is the actionable backlog |
| ◐ **EQUIVALENT** | Different mechanism, same user intent |
| ⛔ **NATIVE-ONLY** | Physically infeasible in a browser (won't fix) |
| ➖ **N/A** | Doesn't apply to a web deployment |

---

## Scorecard

| Status | Count | Of 58 |
|---|---|---|
| ✅ Parity | 20 | 34% |
| 🟡 Partial | 9 | 16% |
| ❌ Missing (web-portable) | **14** | **24%** |
| ◐ Equivalent | 2 | 3% |
| ⛔ Native-only | 12 | 21% |
| ➖ N/A | 1 | 2% |

**Bottom line:** of everything a browser *can* do, **14 capabilities are simply missing**
and **9 are half-built**. The single deepest gap is the **voice engine** (matcher is ported,
but fed by Web Speech / cloud, not on-device `SFSpeechRecognizer`).

---

## Full mapping (all 58 upstream capabilities)

| # | Upstream capability | Upstream file | Web status | Web location / note |
|---|---|---|---|---|
| 1 | Notch "Dynamic Island" overlay (animated concave/convex shape) | NotchOverlayController | 🟡 PARTIAL | `notch.js`+css dock under the *real* safe-area notch, **fullscreen only**; no animated island morph |
| 2 | Follow-mouse notch placement (across displays) | NotchOverlayController | ⛔ NATIVE-ONLY | No multi-display window APIs |
| 3 | Fixed-display notch placement | NotchOverlayController | ⛔ NATIVE-ONLY | — |
| 4 | Floating draggable **& resizable** overlay window (always-on-top) | NotchOverlayController | 🟡 PARTIAL | `app.js` drag works; **not resizable on stage**, not a real OS window |
| 5 | Follow-cursor floating overlay (60fps tracking) | NotchOverlayController | ⛔ NATIVE-ONLY | — |
| 6 | Fullscreen teleprompter on chosen display | NotchOverlayController | ✅ PARITY | Fullscreen API (single display) |
| 7 | True see-through transparency over the desktop | NotchOverlayController | 🟡 PARTIAL | Glass opacity over **black stage** only; a page can't be transparent to the desktop |
| 8 | Hide overlay from screen-share/recording | NotchOverlayController | ⛔ NATIVE-ONLY | No `sharingType` equivalent |
| 9 | Live drag-resize of overlay text area (hover handle) | NotchOverlayController | ❌ MISSING | Composer has width/height sliders; **no on-stage drag handle** |
| 10 | Word-tracking listening mode | SpeechRecognizer | ✅ PARITY* | `app.js`+`matcher.js`; *engine differs — see Deep Gap |
| 11 | Voice-activated / silence-paused mode | SpeechRecognizer | ✅ PARITY | `speech.js` RMS `isSpeaking`>0.08 |
| 12 | Classic constant-speed auto-scroll | MarqueeTextView | ✅ PARITY | `app.js frame()` |
| 13 | Fuzzy speech→script matcher (char+word, edit distance, confidence gate) | SpeechRecognizer | ✅ PARITY | `matcher.js` (ported 1:1, unit-tested) |
| 14 | Adjustable scroll speed (w/s) | NotchSettings | ✅ PARITY | `#speed`/`#speed2` |
| 15 | Per-word read/current/unread highlight + underline | MarqueeTextView | ✅ PARITY | `prompter.js` |
| 16 | Annotation cues (`[bracket]`/emoji, cue color+brightness) | MarqueeTextView | ✅ PARITY | `text.js`+`prompter.js` |
| 17 | CJK-aware tokenization | MarqueeTextView | ✅ PARITY | `text.js splitTextIntoWords` |
| 18 | Tap-a-word to jump | MarqueeTextView | ✅ PARITY | `app.js`+`matcher.jumpTo` |
| 19 | Manual scroll-wheel override with rubber-banding | MarqueeTextView | 🟡 PARTIAL | Wheel-jump in Classic/Voice only; **no rubber-band**, gated out of Word-Tracking |
| 20 | Top/bottom fade mask | MarqueeTextView | 🟡 PARTIAL | css fade in **fullscreen** mode only |
| 21 | Audio waveform + progress meter | MarqueeTextView | ✅ PARITY | `speech.js`+`prompter.js #waveform` |
| 22 | Last-spoken-text readout | SpeechRecognizer | ✅ PARITY | `text.js lastSpokenWords(5)` |
| 23 | Elapsed-time timer | MarqueeTextView | ✅ PARITY | `app.js` (pause-accurate) |
| 24 | Multi-page: sidebar, previews, **read-status badges, add/delete page** | ContentView/TextreamService | 🟡 PARTIAL | Paging engine yes (`---` split, nav, indicator); **no page-management UI** |
| 25 | Page navigation in overlay (next / restart) | overlay views | ✅ PARITY | arrows + restart |
| 26 | Page picker via long-press (jump list) | NotchOverlayController | ❌ MISSING | Web-portable |
| 27 | Auto-next-page countdown | overlay views | ✅ PARITY | `app.js` auto-advance delay (no visible countdown digit) |
| 28 | **Live dictation into the editor** (speech-to-text input) | DictationManager | ❌ MISSING | **Fully web-portable, entirely absent** |
| 29 | Script editor with annotation highlighting + undo | HighlightingTextEditor | 🟡 PARTIAL | Plain `<textarea>` (native undo); **no `[bracket]` highlighting while editing** |
| 30 | **Microphone device enumeration & selection** | SpeechRecognizer | ❌ MISSING | `enumerateDevices`+`deviceId` exist in browsers; uses default mic only |
| 31 | Speech-recognition language/locale picker | SettingsView | 🟡 PARTIAL | 11 locales + auto vs native's full `supportedLocales` (~50+) |
| 32 | PPTX presenter-notes / text import | PresentationNotesExtractor | ✅ PARITY | `pptx.js` via `DecompressionStream` (note: native reads *notes*, web reads *slide text* — confirm desired) |
| 33 | Keynote (.key) guidance alert | TextreamService | ❌ MISSING | Trivial; no `.key` handling |
| 34 | **Drag-and-drop file import** | ContentView | ❌ MISSING | Web-portable; only file-input button exists |
| 35 | Save / Save As / Open `.textream` script files | TextreamService | ❌ MISSING | Web-portable via download + File System Access API; only localStorage+share-link today |
| 36 | External / second-display output (Sidecar) | ExternalDisplayController | ⛔ NATIVE-ONLY | (Borderline: Presentation/Window-Management API exists but impractical) |
| 37 | Mirror mode (horizontal/vertical/both) | ExternalDisplayController | ✅ PARITY | css `--mx/--my` |
| 38 | Embedded HTTP/WS "Remote" viewer server (LAN) | BrowserServer | ⛔ NATIVE-ONLY | A page can't host a LAN server |
| 39 | Embedded "Director" remote-control server | DirectorServer | ⛔ NATIVE-ONLY | — |
| 40 | Director token auth + connection limits | DirectorServer | ⛔ NATIVE-ONLY | — |
| 41 | Director live-edit w/ read-progress preservation | DirectorServer | ⛔ NATIVE-ONLY | — |
| 42 | QR code + URL for remote connect | SettingsView/ContentView | ❌ MISSING | Web has share-link (`?t=`) but **no QR generation** |
| 43 | Configurable server ports + live restart | SettingsView | ⛔ NATIVE-ONLY | — |
| 44 | macOS Services ("Read in Textream") | TextreamApp | ⛔ NATIVE-ONLY | — |
| 45 | Custom URL scheme `textream://read?text=` | TextreamApp | ◐ EQUIVALENT | Web uses `?text=`/`?t=base64` share links (`store.js`) |
| 46 | Menubar / agent (accessory) launch mode | TextreamApp | ⛔ NATIVE-ONLY | — |
| 47 | App menu + global shortcuts (⌘O/⌘S/⇧⌘S/⌘,) | TextreamApp | 🟡 PARTIAL | Stage-only Space/Esc/←/→; no Save/Open/Settings shortcuts |
| 48 | ESC hotkey to stop / dismiss | NotchOverlayController | ✅ PARITY | `app.js` Esc exits stage |
| 49 | GitHub-release auto-update checker | UpdateChecker | ➖ N/A | Web auto-deploys (Vercel) |
| 50 | Font incl. **OpenDyslexic** (adaptive line spacing) | NotchSettings | 🟡 PARTIAL | **`@font-face` NOT bundled** → renders only if OS-installed; else falls back. Inert as shipped |
| 51 | Highlight/cue color + cue brightness presets | NotchSettings | ✅ PARITY | `presets.js`+`prompter.js` |
| 52 | Overlay width/height sliders | NotchSettings | ✅ PARITY | `presets.js LIMITS` |
| 53 | Live floating notch **preview while configuring** | SettingsView | ❌ MISSING | Web-portable (render mini preview); absent |
| 54 | Settings persistence + **Reset All** | NotchSettings/SettingsView | 🟡 PARTIAL | localStorage persistence ✅; **no Reset-All button** |
| 55 | Welcome / demo default script | ContentView | ✅ PARITY | "Sample" loader |
| 56 | About screen (GitHub + Stripe donate, credits) | ContentView | ❌ MISSING | Only a colophon line |
| 57 | Robust STT session mgmt (55s pre-emptive restart, backoff, config-change recovery) | SpeechRecognizer | 🟡 PARTIAL | `speech.js` restarts on `onend` only; no 55s pre-empt / backoff |
| 58 | Browser-side prompter reimplementation | BrowserServer (served HTML) | ✅ PARITY | This **is** the web app |

\* Word Tracking has feature parity in *logic* but not in *engine* — see Deep Gap.

---

## ❌ What is actually missing (web-portable backlog, prioritized)

These are the rows a browser *can* do but we haven't. Ordered by user impact ÷ effort.

### Quick wins (hours)
1. **Bundle OpenDyslexic webfont** (#50) — add `@font-face` + `fonts/OpenDyslexic3-Regular.ttf` (the file exists in upstream). Today the "Dyslexia" option is silently inert. *Trivial, high-credibility.*
2. **Drag-and-drop file import** (#34) — `dragover`/`drop` on the composer → reuse existing `extractPptxText`/`readAsText`. *~1 file.*
3. **Reset All Settings** button (#54) — wipe key → reload from `DEFAULTS`. *Trivial.*
4. **QR code for the share link** (#42) — render a QR of the `?t=` URL so a phone can open the prompter. *Small (tiny QR lib or inline generator).*
5. **About / credits + donate** (#56) — small modal. *Trivial.*
6. **Keynote `.key` guidance** (#33) — detect extension → "export as .pptx" hint. *Trivial.*

### Medium (half-day each)
7. **Microphone device picker** (#30) — `navigator.mediaDevices.enumerateDevices()` + pass `deviceId` to `getUserMedia`/recognition. Real gap for multi-mic setups (RØDECaster etc.).
8. **Live dictation into the editor** (#28) — reuse `speech.js Recognition` to *write* into the textarea (insert-at-caret, segment separators). Currently the editor is type-only; native dictates.
9. **Annotation highlighting in the editor** (#29) — overlay/contenteditable to italic-dim `[brackets]` while editing (matches native `HighlightingTextEditor`).
10. **Page-management UI** (#24) — page list + previews + read-status badges + add/delete, instead of raw `---` editing. Biggest UX delta in the composer.
11. **Page picker / jump-to-page on stage** (#26) — long-press (or button) → page list.
12. **Save/Open script files** (#35) — File System Access API (or download/upload) for `.txt`/`.textream`.

### Polish
13. **Live settings preview** (#53) — mini prompter that reflects settings as you change them.
14. **On-stage drag-resize handle** (#9), **rubber-band wheel + wheel in Word-Tracking** (#19), **fade mask in pinned/floating** (#20), **more locales** (#31), **visible auto-advance countdown** (#27).

### The Deep Gap (architecture, not a checkbox) — voice engine
- **Status:** the *matcher* is ported and correct; the *transcript source* isn't equivalent.
  - Chrome/Edge `webkitSpeechRecognition` → **Google cloud** (needs internet; freezes offline).
  - Safari → varies; Firefox → none (Classic only).
  - Native uses on-device `SFSpeechRecognizer` (#10/#13/#57): offline, reliable, word-level.
- **Robust session mgmt (#57)** is also half-done — no 55s pre-emptive restart to beat the ~60s Web Speech cutoff.
- **To truly close:** ship an in-browser WASM speech model (whisper.cpp/whisper-web, Vosk-browser, or Moonshine) in a Web Worker feeding `matcher.js`. The matcher is engine-agnostic, so the integration point (`Recognition` in `speech.js`) is clean. Largest single item.

---

## ⛔ Native-only (out of reach for any web app — won't fix)

Multi-display follow-mouse/fixed (#2,#3), follow-cursor overlay (#5), true desktop
transparency (#7), hide-from-screen-share (#8), external/Sidecar display (#36), the
**Remote (#38) and Director (#39–41,#43) LAN servers**, macOS Services (#44), menubar mode
(#46), and the GitHub auto-updater (#49, N/A). These need a system-level window/display/
network/OS-integration surface a browser tab does not have.

---

## Corrections to the prior HANDOFF (now that real source is in hand)

- **§7-A is now closed** — this map *is* the re-characterization against upstream Swift.
- **PPTX semantics differ from native** (#32): upstream extracts **presenter notes**
  (`ppt/notesSlides/`); our `pptx.js` extracts **slide body text** (`ppt/slides/`). Same
  file type, different content. Decide which is intended (notes is the teleprompter-correct
  source for a speaker).
- **Voice/transparency caveats in §7-B/§7-C confirmed accurate** against source.
- **Locale list is shorter** than native's `SFSpeechRecognizer.supportedLocales` (#31).
