# Notch Prompter by Vlad

A teleprompter that runs entirely in the browser — with a **notch-pinned reader**, **voice word-tracking**, three reading modes, and an Apple-style glass interface. Deployable as a static site on Vercel. Nothing is uploaded: speech recognition, matching and rendering all happen on-device.

## Features

| Area | What it does |
|---|---|
| **Word Tracking** | Listens via the Web Speech API and lights each word as you say it, using a char-level + word-level fuzzy matcher with a 2-of-3 confidence gate. |
| **Classic** | Auto-scrolls at a constant words-per-second. No microphone. |
| **Voice-Activated** | Scrolls while you speak, pauses on silence (RMS level gate). |
| **Pinned to Notch** | A glass card docked under the notch, located via `env(safe-area-inset-top)` in fullscreen. |
| **Floating** | A draggable glass card you can place anywhere. |
| **Fullscreen** | Full-bleed prompter with fade masks. |
| **Styling** | Typeface (Sans/Serif/Mono/Dyslexia), size (XS–XL), text + cue colors (6 each), cue brightness, mirror (H/V/both) for prompter rigs. |
| **Extras** | Tap-to-jump, elapsed clock, audio waveform, shareable `?t=` links, settings saved locally. |

## What the browser can and cannot do

The pinned reader hugs the notch **while this page is the active fullscreen window**. A web page cannot float above *other* apps (it has no system-level window) — that part is macOS-native only. For reading to camera in fullscreen, the web version behaves the same.

Voice tracking needs the Web Speech API: works in Chrome/Edge and Safari (macOS solid, iOS variable by version), not in Firefox. Where it is missing, the app says so and Classic mode always works.

## Develop

```bash
npm test            # unit tests for the matcher, text utils, presets
npm run dev         # serve at http://localhost:8000
```

Voice modes need HTTPS or `localhost` for microphone access.

## Architecture

Pure, tested logic is isolated from the DOM:

- `js/text.js` — word/CJK splitting, normalization, word→char mapping
- `js/matcher.js` — voice-to-script position tracker (unit-tested)
- `js/presets.js` — option sets and defaults
- `js/store.js` — settings persistence + shareable links
- `js/speech.js` — Web Speech recognition + Web Audio metering
- `js/notch.js` — safe-area notch detection
- `js/prompter.js` — word coloring, auto-scroll, waveform
- `js/app.js` — orchestration

## Deploy

Static site, zero config:

```bash
npm i -g vercel && vercel --prod
```

Or drag the folder onto [vercel.com/new](https://vercel.com/new) (framework preset: Other).

## License

MIT — see [LICENSE](LICENSE). This project began as a browser re-implementation of an MIT-licensed native macOS teleprompter; that original copyright notice is preserved in the LICENSE file as the license requires.
