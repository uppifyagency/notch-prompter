# Notch Prompter — Forensic Handoff & Parity Report

> Scope: everything done to bring the browser app (`notch-prompter`, this repo) toward
> feature parity with the native macOS **Textream** teleprompter, exactly **how** it was
> done, the **evidence** for each claim, and **what remains**. Written to be auditable:
> every "done" is backed by a test name and/or a verbatim runtime check.

---

## 0. Document control

| Field | Value |
|---|---|
| Repository | `github.com/uppifyagency/notch-prompter` |
| Branch | `main` (fast-forwarded from `feat/tier1-tier2-gaps`) |
| Baseline commit | `d2fd284` — *"chore: ignore .vercel local artifacts"* |
| Head commit | `df3125d` |
| Commits in this work | `1f9dd43`, `7907735`, `df3125d` (see §9) |
| Net change | 11 files, **+534 / −65**, 2 new modules (`js/pptx.js`, `test/pptx.test.js`) |
| Test suite | `node --test` → **38 tests, 38 pass, 0 fail** (baseline was 22) |
| Runtime verification | Chrome DevTools (CDP :9222) against `python3 -m http.server` |
| Author of record | uppifyagency `<vlad@delera.it>` |
| Reference used | **Characterization Map** supplied by the product owner — *not* the upstream Textream source (see §6, §7-A) |

**Critical caveat for the reader:** the "upstream" target in this document is the
Characterization Map (a Specification-by-Example) plus general knowledge of the native
app. The actual Textream Swift source was **not** available during this work. Any claim of
"1:1" must be re-validated against that source (§7-A).

---

## 1. Executive summary

- **All 10 gaps the Characterization Map marked browser-implementable are done**: Tier 1
  `G1–G8` and Tier 2 `C1–C2`. Each is unit-tested where it carries real logic and
  verified live in Chrome.
- **Two post-delivery UI defects reported by the owner were fixed**: (a) status label
  ("Ready/Paused") overlapped the prompter; (b) the waveform + mic overlapped the text.
- **One functional limitation is fundamental and NOT closed**: true on-device word
  recognition. The browser app does *real word matching*, but only against a transcript
  produced by the **Web Speech API**, which is **not** the same engine as Textream's
  on-device `SFSpeechRecognizer` (§7-B). This is the single biggest parity gap.
- **Tier 3 (5 macOS-native features) is out of reach for any web app** by design (§7-C).

Verdict: **feature parity for everything the browser can physically do**, with one
deep voice-engine gap and a handful of assumptions to confirm. Not a literal 1:1.

---

## 2. Methodology — how the work was done

**Outside-In TDD (London school), per the team's agile-technical-practices playbook.**

1. For every gap carrying real logic, the logic was pushed **out of the DOM** into a pure,
   `node:test`-able function (inner loop): RED (failing test) → GREEN (implement) →
   REFACTOR. The DOM layer was kept a thin adapter.
2. The **outer loop** (acceptance) is the live browser: each gap was exercised through the
   real app in Chrome via CDP and asserted on observable state.
3. The full suite was kept **green at every step** (Simple Design rule #1: *passes tests*).
4. An **adversarial review** pass (a reviewer agent) hunted for regressions; each finding
   was then **verified against the actual code** before acting — two of three "MAJOR"
   findings were reviewer misreads and were rejected with evidence (§5).

Evidence protocol: no claim of "works" without either a named test or a verbatim CDP
return value. Bad citations were surfaced, not laundered (§6).

---

## 3. Evidence ledger (verbatim runtime checks)

All captured via `mcp__chrome-devtools__evaluate_script` against the served app.

| Gap | Probe | Returned (verbatim) |
|---|---|---|
| Build/G1 | composer built; locale options | `segListenButtons:3`, `localeOptions:12`, `localeFirst:"Auto (browser default)"` |
| G7 | width slider min | `notchwMin:"280"` |
| G3 | glass slider range | `glassMin:"0"`, `glassMax:"0.6"` |
| C1 | storage key after a write | `lsKeys:["notch-prompter.settings.v1"]` (no `textream.*`) |
| G1 | locale hides in Classic | `localeHiddenInClassic:true` |
| G3/C2 | slider → CSS var | `glassVar:"0.5"`, `glassLabel:"50%"` |
| G5 | multi-page indicator | `pageIndStart:"1 / 3"` → `pageAfterRight:"2 / 3"` → `pageAfterClamp:"3 / 3"` |
| G4 | wheel gating | Classic `wheelPreventedClassic:true`; Word Tracking `wheelPreventedWordTracking:false` |
| G2 | mute toggle | `aria-pressed false→true`, `mutedClass:true`, `iconHref:"#i-mic-off"`, then back to `#i-mic` |
| G6 | pptx via real DecompressionStream | `"Deck title\nfirst bullet\n\n---\n\nSecond slide"` |
| C1 | legacy migration on reload | `legacyGone:true`; new key holds `fontColor:"green", scrollSpeed:5`; swatch shows green |
| Highlight | Classic karaoke after wheel | `dimmedReadWords:["Alpha".."echo"]`, `currentWord:["foxtrot"]`, `aheadCount:8` |
| Layout | bar below text (post-fix) | `scroll.bottom:97`, `readerbar.top:97`, `barBelowText:true`, `waveCenteredInReader:true` |
| Console | error sweep | only `favicon.ico 404` + deprecated `apple-mobile-web-app-capable` warning; **no JS errors** |

---

## 4. Change inventory — what & how, per gap

Priority order followed the owner's Theory-of-Constraints ranking
`G2 > G4 > G1 > G3 > G7/G8 > C1 > G5 > G6`.

### Tier 1

- **G2 — Mute/unmute mic.** `js/app.js`: extracted `startListening()` / `stopListening()`
  (the mic teardown had been duplicated across `pause`, `stopPlayback`, and inline `play`
  — Rule of Three). Added `setMicMuted()`, a click + keyboard handler on `#mic`, and reset
  on `restart()`. `#mic` upgraded from a presentational `<div>` to an accessible control
  (`role=button`, `aria-pressed`, label). New `#i-mic-off` sprite icon; `.muted` CSS.
- **G4 — Wheel to jump.** `js/text.js: nextProgressFromWheel(progress, deltaY, wordCount,
  pixelsPerWord=30)` (pure, clamped). Wired on `#scroll`; **gated OUT for Word Tracking**
  (matcher owns position there) per the map's "Classic + Voice-Activated" scope.
- **G1 — Voice language.** `js/presets.js: SPEECH_LOCALES` (12 BCP-47 tags incl. `''`=auto)
  + `js/app.js: fillSelect()` + styled `<select id="locale">`; shown only in Word Tracking.
- **G3 — Glass opacity.** `LIMITS.glassOpacity {0..0.6, default 0.15}`, CSS var
  `--glass-opacity`, `setGlassOpacity()` (clamped) bound to a 0–60% slider; applied to the
  pinned & floating card fill. (Also closes **C2**.)
- **G7 — Min width 280.** `LIMITS.notchWidth.min 310→280` + `index.html` slider `min`.
- **G8 — Spoken tail = 5 words.** `js/text.js: lastSpokenWords(text, n=5)`; replaced the
  inline `slice(-6)` in `paint()`.

### Tier 2

- **C1 — Storage key rename.** `js/store.js`: `textream.settings.v1` →
  `notch-prompter.settings.v1` with a one-time migration that clears the legacy key even
  if its JSON is corrupt. (Removed the Connascence of Name with upstream.)
- **C2 — glassOpacity live setter.** Resolved by G3: the value now drives a CSS var through
  a real setter→effect path (was Connascence of Manual Task).

### Bigger items

- **G5 — Multi-page.** `js/text.js: splitIntoPages(text)` (splits on a `---`-only line,
  trims, drops empties, always ≥1 page). `js/app.js`: `loadPage`/`goToPage`, auto-advance
  on `finish()` with `autoNextPageDelay`, arrow-key nav, `#pageind` indicator, composer
  toggle + delay slider.
- **G6 — .pptx import.** New `js/pptx.js`: `extractPptxText()` parses the ZIP central
  directory and inflates `ppt/slides/slideN.xml` with the browser-native
  `DecompressionStream('deflate-raw')` — **zero dependencies** — then `slideXmlToText()`
  (pure) pulls `<a:t>` runs, decodes entities, paragraphs→lines. Slides ordered by number,
  joined as pages with `---`. File input now branches on extension.

### Owner-reported UI fixes (post-delivery)

- **Status overlap** (`7907735`): `#statuswrap` moved out of `#topctl` (top-center, where
  the pinned card lives) to a bottom-centered overlay that fades with the controls. The
  prompter zone now shows only the script.
- **Progressive highlight in all modes** (`7907735`): `js/prompter.js` now computes the
  current-word index in every mode and uses one coloring path driven by `charCount`
  (speed-based in Classic, speech-presence in Voice-Activated, voice in Word Tracking).
  Previously only Word Tracking highlighted.
- **Reader bar overlap** (`df3125d`): `#reader` is now a flex column; `#scroll` is `flex:1`
  with `min-height:0`; `#readerbar` is in-flow (`flex-shrink:0`), centered. The waveform +
  mic sit in their own band **below** the text instead of `position:absolute` over it.

---

## 5. Adversarial review — findings & disposition

A reviewer agent raised 1 blocker + 3 major + 3 minor. Each was checked against the code:

| Finding | Verdict | Action |
|---|---|---|
| `onState` re-adds `live` while muted | **Reviewer misread** — already guarded `on && !micMuted` (app.js:323) | none |
| `goToPage` bounds-check after `stopPlayback` | **Reviewer misread** — bounds check is line 245, `stopPlayback` line 246 | none |
| `lastSpokenWords` n=5 not applied | **False** — single call site uses default; `slice(-6)` removed | none |
| Elapsed clock drops paused time in Classic | **Real (pre-existing)** — `pause()` only accumulated when a meter existed | **Fixed**: accumulate in all modes |
| pptx stored-entry bounds | **Valid hardening** | **Fixed**: throw on truncated entry |
| Legacy key kept on corrupt JSON | **Valid** | **Fixed**: always `removeItem` |
| Glass var not synced before first render | **Minor** | **Fixed**: `setGlassOpacity` in `buildComposer` |

Lesson encoded: trust neither a confident review nor confident self-doubt — verify against
the artifact.

---

## 6. Honesty ledger — corrections & retractions

1. **G7 "README says 280" was a false citation.** `grep` for `280` across the entire repo
   returns nothing; the README has no width figure. The change to 280 was made on the
   authority of the Characterization Map, not the README. Flagged, not laundered.
2. **Retraction: "on-device Mac models" was an overclaim.** I earlier described voice
   tracking as using "local Mac models". That is inaccurate for the web app — see §7-B.
   Web Speech in Chrome is cloud-based; only Safari may use on-device, and neither equals
   Textream's `SFSpeechRecognizer`.
3. **Design assumptions made under uncertainty** (not confirmed against upstream): the page
   delimiter is a `---` line (G5); .pptx slides are joined with `---` so each slide becomes
   a page (G6); glass default 0.15 over the black stage. All are defensible but unverified.

---

## 7. What remains to align with upstream Textream

### 7-A. Re-characterize against the real source (prerequisite for any "1:1" claim)
The entire parity assessment rests on the Characterization Map, not Textream's Swift code.
**Action:** obtain the upstream source and re-derive exact values/semantics — page
delimiter, default glass opacity, min width, locale list, spoken-tail count, matcher
constants. Until then, "aligned to the map" ≠ "aligned to Textream".

### 7-B. Voice recognition — the deep gap (this is what the owner observed)
**Observed:** "the audio doesn't truly understand the word; it's only an audio trigger to
scroll." Diagnosis, precisely:

- **Word Tracking** *does* understand words: `js/speech.js` runs `webkitSpeechRecognition`
  (continuous, interim results) and `js/matcher.js` performs char-level + word-level fuzzy
  matching against the transcript with a 2-of-3 confidence gate. **But** it depends on the
  browser producing a transcript:
  - **Chrome/Edge**: `webkitSpeechRecognition` streams audio to **Google servers** — cloud,
    needs internet, not local. If offline / blocked / no mic permission → no transcript →
    the highlight freezes. This likely looks like "it doesn't understand words".
  - **Safari**: implementation varies by version; may be on-device but unreliable.
  - **Firefox**: no Web Speech API at all (Classic mode only).
- **Voice-Activated (`silencePaused`)** is **by design** only an RMS audio-level trigger
  (`AudioMeter.isSpeaking`, `js/speech.js:89-90`): it scrolls while sound is present and
  pauses on silence. **No word understanding** — this is expected behavior, not a bug. If
  the owner tested this mode, the observation is correct and intentional.

**Upstream Textream** uses Apple's `SFSpeechRecognizer` with true on-device recognition —
reliable, offline, word-level. The web platform has no equivalent built in.

**Action to truly close it:** ship a local speech model in-browser via WASM — e.g.
**whisper.cpp / whisper-web**, **Vosk-browser**, or **Moonshine** — running in a Web Worker
and feeding transcripts into the existing `matcher.js`. This is a substantial addition
(10–50 MB model download, WASM, worker, latency tuning) and currently the largest item
between the web app and Textream's voice behavior. The matcher is already engine-agnostic,
so the integration point is clean: replace/augment `Recognition` in `speech.js`.

### 7-C. Tier 3 — physically impossible in a browser (won't fix)
Per the Characterization Map, all macOS-native:
- External display / Sidecar output
- Follow Mouse across displays
- Director-mode server (the web app *is* the remote client, not a server)
- Hide-from-screen-share API
- `textream://` URL scheme

A web page has no system-level window or display APIs; these require a native app.

### 7-D. "Flowless setup" — undefined, untouched
The owner asked for a "flowless setup"; **no targeted work was done** and the term is not
yet specified. Today the setup is a single composer screen → "Start reading". Candidate
improvements once defined: microphone/permission pre-flight, a first-run hint, fewer
controls visible by default (progressive disclosure), quick presets. **Action:** define the
specific friction, then address.

### 7-E. Smaller alignment checks
- Confirm the `---` page delimiter matches upstream's page concept (or switch to form-feed).
- Confirm joining .pptx slides with `---` is desired (vs blank lines).
- Decide whether `Escape` should exit only fullscreen vs. the whole stage (current: exits
  the stage).

---

## 8. Architecture map (where logic lives)

```
js/text.js     pure text/progress utils — splitTextIntoWords, normalize, isAnnotation,
               letterCount, charOffsetForWordProgress, clamp, nextProgressFromWheel(G4),
               lastSpokenWords(G8), splitIntoPages(G5)            [unit-tested]
js/matcher.js  voice→script position tracker (char + word fuzzy, confidence gate) [unit-tested]
js/presets.js  option sets, LIMITS, DEFAULTS, SPEECH_LOCALES(G1)  [unit-tested]
js/pptx.js     .pptx → text via DecompressionStream (G6)          [unit-tested]
js/store.js    settings persistence + share links + C1 migration  [browser-verified]
js/speech.js   Web Speech recognition + Web Audio metering         [browser-only]
js/notch.js    safe-area notch detection                           [browser-only]
js/prompter.js word coloring/highlight (all modes), auto-scroll, waveform [browser-verified]
js/app.js      orchestration / DOM wiring                          [browser-verified]
```

---

## 9. Commit log

```
df3125d  fix: reader bar (waveform + mic) sits below the text, not over it
7907735  fix: progressive word highlight in all modes + status no longer overlaps reader
1f9dd43  feat: complete Tier 1 (G1–G8) and Tier 2 (C1–C2) gaps
d2fd284  (baseline) chore: ignore .vercel local artifacts
```

## 10. Reproduce / verify

```bash
npm test            # 38 tests, 0 fail
npm run dev         # serve at http://localhost:8000
# then in a Chromium with --remote-debugging-port=9222, drive the composer/stage
```

## 11. Sign-off

Tier 1 + Tier 2 complete and verified; two owner-reported UI defects fixed; voice-engine
parity and Tier-3 native features explicitly **not** closed and explained above. No "done"
in this report is unbacked by a test or a quoted runtime value. The only path to a defensible
"1:1 with Textream" runs through §7-A (re-characterize against source) and §7-B (local WASM
speech model).
