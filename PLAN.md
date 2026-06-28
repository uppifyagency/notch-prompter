# Implementation Plan — closing the web-portable gaps

> **STATUS: COMPLETE (2026-06-28).** 12 features shipped via TDD + live verification;
> 71/71 tests; committed `93e8f1b`, pushed to main, deployed to production
> (notch-prompter-wine.vercel.app) and smoke-tested live (all controls present, OpenDyslexic
> loaded, no JS console errors). Deferred with rationale: A5 (QR), #19b (rubber-band),
> D1 (WASM speech — owner decision). Nothing left to implement in scope.


> Source of work: [GAP-ANALYSIS.md](GAP-ANALYSIS.md). Method: Outside-In TDD (London),
> logic pushed out of the DOM into pure `node:test` functions, green at every step.
> Ordered by **Theory of Constraints** (value ÷ effort, credibility first), not by gap number.
> Each feature is a story: **Narrative · Given-When-Then acceptance · TDD steps · Review checklist.**

Legend for status: ⬜ todo · 🔄 in progress · ✅ done (test name(s) + commit).

---

## Wave A — Credibility & content-in (cheap throughput, mostly pure or trivial)

### A1 — Bundle OpenDyslexic webfont (gap #50) ✅
**Narrative:** As a dyslexic reader, when I pick the "Dyslexia" typeface it must actually
render OpenDyslexic, not silently fall back — today the option is a lie (no `@font-face`).
**GWT:** *Given* I select Dyslexia, *when* the stage renders, *then* `#text` computed
`font-family` resolves to a bundled OpenDyslexic face regardless of OS-installed fonts.
**TDD:** mostly asset/CSS (no pure logic). Test = presence assertion: a tiny test asserts
`css/app.css` declares an `@font-face` for OpenDyslexic and the `fonts/` file exists.
**Review:** removes a Connascence-of-Manual-Task (UI promises what code can't deliver).

### A2 — Content ingestion: `fileKind` classifier → drag-and-drop (#34) + Keynote guidance (#33) ✅
**Narrative:** As a presenter, I want to drop a `.txt/.md/.pptx` onto the composer and have it
load; if I drop a `.key`, tell me to export as `.pptx` instead of failing silently.
**GWT:** *Given* a dropped/opened file, *when* its name+type are classified, *then* the app
routes pptx→`extractPptxText`, text→`readAsText`, key→guidance alert, other→reject.
**TDD (pure first):** `fileKind(name, mimeType) → 'pptx'|'text'|'keynote'|'unknown'` in a new
`js/files.js`; triangulate across extensions/mimes/case. Then DOM adapter: `dragover`/`drop`
on `#composer`, reuse existing open path; `.key`→alert.
**Review:** single classifier kills duplicated extension checks (Rule of Three across open+drop).

### A3 — Reset All Settings (#54) ✅ (store.test.js · keeps script)
**Narrative:** As a user who messed up the settings, I want one button to restore defaults.
**GWT:** *Given* customized settings, *when* I confirm "Reset", *then* storage is cleared,
`DEFAULTS` reload, and the composer reflects them.
**TDD:** `Store.reset()` returns a defaults clone & clears the key — unit-test the clear +
defaults merge. DOM: a confirm button that re-runs `buildComposer()`/`applyReaderStyle()`.
**Review:** reuse existing `#save`/`#load`; no new persistence path (fewer elements).

### A4 — About / credits (#56) ✅ (assets.test.js version-drift guard)
**Narrative:** As a user, I want an About panel (app name, version, source link, credit).
**GWT:** *Given* the composer, *when* I open About, *then* a modal shows name/version/links.
**TDD:** trivial DOM; version string from one source (`package.json` mirror const) — assert
the const matches package.json to avoid Connascence-of-Value drift.
**Review:** no donate/Stripe (not ours); keep honest.

### A5 — QR code for the share link (#42) ⏸️ DEFERRED (logged)
**Why deferred (inflection-point / YAGNI call):** the share link embeds the whole script as
base64; a QR caps at ~2953 bytes (v40-L), so real scripts produce an unscannable code. The
native app QRs a short LAN URL — we have no such short token. CSP forbids a CDN, so it would
mean hand-rolling a full QR encoder (Reed-Solomon + masking, ~300 LOC, high bug risk) for a
feature the existing "copy link" already covers for short scripts. Revisit only if we add a
short-token share backend. **No silent drop — recorded here.**

### A5(orig) — QR code for the share link (#42) ⏸️
**Narrative:** As a presenter, I want a QR of the `?t=` link so a phone opens the same script.
**GWT:** *Given* a script, *when* I tap "QR", *then* a scannable QR of `Store.shareLink()` shows.
**TDD (pure):** a minimal QR encoder is large; instead unit-test the *data* path
(`Store.shareLink` already tested-able) and use a tiny vendored QR module rendered to canvas;
test the module's byte-mode encoding against known vectors. If cost too high → defer, log it.
**Review:** watch the inflection point (YAGNI): don't hand-roll a full QR spec if a 2KB
vendored encoder suffices; keep it self-contained (CSP: no CDN).

---

## Wave B — Medium logic (half-day each)

### B1 — Microphone device picker (#30) ✅ (devices.test.js + live-verified)
**Done:** pure `pickDeviceId`/`audioInputs` in `js/devices.js`; composer `<select>` from
`enumerateDevices()`; `AudioMeter.start(deviceId)` honors it; `micId` in DEFAULTS; field gated
out of Classic mode. **Honest limit (no over-claim):** Web Speech (Word-Tracking) has no device
API, so it always uses the system default — the picker drives the waveform & Voice-Activated
input only. Noted in the UI hint.
**Narrative:** As a multi-mic user (RØDECaster), I want to choose the input device.
**GWT:** *Given* permission granted, *when* I open the mic list, *then* devices from
`enumerateDevices()` show and the chosen `deviceId` is passed to `getUserMedia`/recognition.
**TDD (pure):** `pickDeviceId(devices, savedId) → id` (saved if present, else default/first) —
unit-test selection logic; DOM adapter calls `enumerateDevices`. `AudioMeter`/`Recognition`
take an optional `deviceId`.
**Review:** Stub the devices array (own the boundary); don't mock the browser API.

### B2 — Page-management UI + pure page ops (#24) ✅ (pages.test.js + live-verified in Chrome)
**Done:** pure ops in `js/pages.js` (add/remove/move/join, round-trip tested); composer
page-bar (preview + ▲▼ move + ✕ delete + click-to-select), textarea stays single source of
truth. Live bug caught & fixed: empty new page vanished via splitIntoPages' drop-empties — now
"+ Page" inserts a selected `New page` placeholder. **Read-status badges deferred** (stage-time
concept; folds into B3). Wave-A drag-drop/reset/about also live-verified (no JS console errors).
**Narrative:** As an author, I want to see pages as a list and add/delete/rename them instead
of hand-typing `---`.
**GWT:** *Given* a multi-page script, *when* I add/delete/move a page, *then* the page array
and the `---`-joined text update consistently.
**TDD (pure first):** in `js/pages.js`: `addPage`, `removePage`, `movePage`, `joinPages`,
`splitIntoPages` (reuse). Pure array transforms — triangulate edge cases (delete last page →
keep ≥1). Then a sidebar DOM that binds to these + read-status badge.
**Review:** keep `splitIntoPages`/`joinPages` as the single round-trip (no parallel truth).

### B3 — Page picker / jump-to-page on stage (#26) ✅ (pages.test.js pagePreview + live-verified)
**Done:** stage page-picker dialog (button shown only when multi-page) listing pages via the
shared pure `pagePreview`, with current marker + green **read badges** (`readPages` set, filled
on `finish()`). Jump reuses `goToPage`, preserving play state. Closes the deferred B2 read-badge
item. Live-verified: picker opens with N items, current marked, jump moves the indicator.
**Narrative:** As a presenter mid-read, I want to jump to any page from the stage.
**GWT:** *Given* N pages on stage, *when* I open the picker and choose page k, *then*
`goToPage(k)` runs and the matcher resets to that page.
**TDD:** reuse `goToPage`; DOM list overlay. Little new pure logic (clamp index).
**Review:** reuse existing nav path; fewer elements.

### B4 — Live dictation into the editor (#28) ✅ (dictation.test.js)
**Done:** pure reducer in `js/dictation.js` (`insertAtCaret` + `initDictation`/`reduceDictation`)
— interim replacement from a frozen anchor, final-result commit with a single separating space.
Adapter reuses `Recognition` writing into the textarea. **Live caveat:** real STT can't run in
headless Chrome, so the reducer (the substance) is unit-tested and the thin adapter needs a
manual mic check. Distinct from word-tracking (CQS: pure transform vs the DOM/engine command).
**Narrative:** As an author, I want to dictate script text into the editor by voice.
**GWT:** *Given* recording, *when* I speak, *then* finalized transcript is inserted at the
caret with segment separators, without clobbering existing text.
**TDD (pure):** `insertAtCaret(text, caret, chunk) → {text, caret}` and segment-merge logic
in `js/dictation-core.js` — triangulate (start/middle/end, repeated interim). Then reuse
`speech.js Recognition` writing into the textarea.
**Review:** reuse `Recognition` (no second speech stack); CQS — pure transform vs DOM command.

### B5 — Annotation highlighting in the editor (#29) ✅ (text.test.js tokenizeForEditor + live-verified)
**Done:** pure `tokenizeForEditor` in `text.js` (plain/[bracket] segments, shared bracket
pattern). Transparent-text textarea over a `.hl-backdrop` that renders the same text with
`.ann` cues italic/accent; scroll-synced. **Alignment live-verified in Chrome:** backdrop text
== textarea, identical font/padding, box within 0.6px. Repaints on input/setScript/dictation.
**Narrative:** As an author, I want `[cues]` shown dimmed/italic while editing.
**GWT:** *Given* text with `[brackets]`, *when* I edit, *then* an overlay renders annotations
styled, aligned to the textarea.
**TDD (pure):** `tokenizeForEditor(text) → spans[]` (reuse `isAnnotation`); test span ranges.
DOM: a mirrored highlight layer behind the textarea.
**Review:** reuse `isAnnotation`/tokenizer (no duplicate annotation rule — Connascence of Name).

### B6 — Save / Open script files (#35) ✅ (files.test.js scriptFilename)
**Done:** "Save" downloads the script as `.txt` via a Blob, named by the pure `scriptFilename`
(first-line slug, capped, fallback `script.txt`). "Open" was already covered by the file picker
(now also routes via `fileKind`). Round-trip is identity (a script is just text; pages are inline
`---`), so no parse logic — only the filename helper carried logic worth a test.
**Narrative:** As an author, I want to save my script to a file and open it later.
**GWT:** *Given* a script, *when* I Save, *then* a `.txt` downloads; *when* I Open one, it loads.
**TDD (pure):** `serializeScript`/`parseScript` round-trip (incl. pages) — unit-test
idempotence. DOM: File System Access API with download/upload fallback.
**Review:** round-trip property test (serialize∘parse == id); graceful fallback (no FS API).

---

## Wave C — Polish (batch)

### C1 — Live settings preview (#53) ⬜
Mini prompter reflecting settings live. Reuse `prompter.js` against a lorem sample. Review: no
new render path — instantiate the existing `Prompter` on a hidden node.

### C2 — Reading-surface polish batch ⬜
Gaps #9 (on-stage drag-resize handle), #19 (rubber-band wheel + enable wheel in Word-Tracking),
#20 (fade mask in pinned/floating, not only fullscreen), #27 (visible auto-advance countdown),
#31 (extend locale list toward `supportedLocales`). Each: pure where logic exists (e.g. a
`rubberBand(progress, lo, hi)` for #19), else CSS/DOM. Review per-item against Simple Design.
- **#31 locales ✅** — expanded from 11 to 20 BCP-47 tags (en-AU/IN, es-MX, pt-PT, pl, ru, tr, ar, hi, zh-TW).
- **#19 wheel ✅ (partial)** — wheel now repositions in ALL modes incl. Word-Tracking (manual
  correction via `matcher.jumpTo`; live-verified `wheelPreventedWordTracking:true`).
  **Rubber-band dropped (logged):** `nextProgressFromWheel` already clamps to bounds; a visual
  bounce needs a transform layer disproportionate to value (YAGNI).
- **#27 countdown ✅** — auto-advance now shows a live per-second "Next page in Ns…" via a
  ticker, cleared by `clearPageTimers()`. (Wired; not e2e'd — needs end-of-page.)
- **#20 fade mask ✅** — top/bottom mask gradient now on pinned & floating `#scroll` too (live-verified `maskInPinned:true`).
- **#9 drag-resize ✅** — bottom handle (hover-revealed, card modes only) drags `--reader-h`, clamped to limits & persisted (live-verified 150→190px, stored).
- **#53 live preview ✅** — mini prompter reusing the real `Prompter` on a lorem sample,
  reflecting font/size/colors/cue brightness live (live-verified: 4 distinct word colors,
  size XL 20→24px, text color → green on swatch click). **Wave C complete.**

---

## Wave D — The deep gap (largest item, last)

### D1 — In-browser WASM speech engine (#10/#13/#57) ⏸️ DEFERRED (owner decision 2026-06-28)
Owner chose to keep the Web Speech API for now and treat D1 as a separate project (10–50MB
self-hosted model under CSP, Web Worker, latency tuning — weeks, not a loop iteration). The
matcher is already engine-agnostic, so the seam (`Recognition` in `speech.js`) stays ready.
Revisit when true offline word-tracking is actually required. The remaining 12 features ship now.

### D1(orig) — In-browser WASM speech engine (#10/#13/#57) ⏸️
**Narrative:** Word-Tracking must work offline & reliably, not depend on Chrome→Google cloud.
**Plan:** integrate whisper-web / Vosk-browser / Moonshine in a Web Worker, feeding transcripts
into the existing engine-agnostic `matcher.js` (clean seam at `Recognition` in `speech.js`).
Add robust session mgmt (pre-emptive restart, backoff) — gap #57.
**TDD:** the matcher is already unit-tested; new work is the worker adapter (integration) +
a `Recognition`-compatible interface so `app.js` is unchanged (LSP: the new source is a
drop-in substitute). Walking skeleton first (load model → one utterance → charCount moves).
**Review:** Balanced Abstraction — keep the engine behind the same port; measure latency/size;
log the model-download cost (no silent 30MB).

---

## Out of scope (native-only, won't fix)
Multi-display (#2,#3,#5,#36), desktop transparency (#7), hide-from-screen-share (#8),
LAN Remote/Director servers (#38–41,#43), macOS Services (#44), menubar mode (#46),
auto-update (#49). See GAP-ANALYSIS "Native-only".
