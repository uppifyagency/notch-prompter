// presets.js — the option sets and their exact values, matching Textream 1:1.
// Pure data + defaults; persisted by store.js.

// Single source of truth for the app version (mirrors package.json; a test guards drift).
export const APP_VERSION = '1.0.0';

export const FONT_SIZES = {
  xs: { label: 'XS', pt: 14 },
  sm: { label: 'SM', pt: 16 },
  lg: { label: 'LG', pt: 20 },
  xl: { label: 'XL', pt: 24 },
};

export const FONT_FAMILIES = {
  sans:     { label: 'Sans',     css: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", system-ui, sans-serif' },
  serif:    { label: 'Serif',    css: 'ui-serif, "New York", Georgia, "Times New Roman", serif' },
  mono:     { label: 'Mono',     css: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  dyslexia: { label: 'Dyslexia', css: '"OpenDyslexic3", "OpenDyslexic", ui-rounded, "SF Pro Rounded", system-ui, sans-serif' },
};

export const COLORS = {
  white:  { label: 'White',  css: '#ffffff' },
  yellow: { label: 'Yellow', css: 'rgb(255,214,10)' },
  green:  { label: 'Green',  css: 'rgb(51,214,74)' },
  blue:   { label: 'Blue',   css: 'rgb(79,140,255)' },
  pink:   { label: 'Pink',   css: 'rgb(255,97,145)' },
  orange: { label: 'Orange', css: 'rgb(255,158,10)' },
};

// Opacity for unread vs already-read annotation cues.
export const CUE_BRIGHTNESS = {
  dim:    { label: 'Dim',    unread: 0.2,  read: 0.5 },
  low:    { label: 'Low',    unread: 0.35, read: 0.6 },
  medium: { label: 'Medium', unread: 0.5,  read: 0.7 },
  bright: { label: 'Bright', unread: 0.8,  read: 1.0 },
};

export const OVERLAY_MODES = {
  pinned:     { label: 'Pinned to Notch', desc: 'Anchored below the notch at the top of your screen.' },
  floating:   { label: 'Floating Window', desc: 'A draggable card you can place anywhere.' },
  fullscreen: { label: 'Fullscreen',      desc: 'Fullscreen teleprompter. Press Esc to stop.' },
};

export const LISTENING_MODES = {
  wordTracking:  { label: 'Word Tracking',  desc: 'Tracks each word you say and highlights it in real time.' },
  classic:       { label: 'Classic',        desc: 'Auto-scrolls at a constant speed. No microphone needed.' },
  silencePaused: { label: 'Voice-Activated', desc: 'Scrolls while you speak, pauses when you are silent.' },
};

// Voice-recognition locales for the Web Speech API. '' = let the browser pick
// (navigator.language). Keys are BCP-47 tags passed straight to recognition.lang.
export const SPEECH_LOCALES = {
  '':      { label: 'Auto (browser default)' },
  'en-US': { label: 'English (US)' },
  'en-GB': { label: 'English (UK)' },
  'en-AU': { label: 'English (Australia)' },
  'en-IN': { label: 'English (India)' },
  'it-IT': { label: 'Italiano' },
  'es-ES': { label: 'Español (España)' },
  'es-MX': { label: 'Español (México)' },
  'fr-FR': { label: 'Français' },
  'de-DE': { label: 'Deutsch' },
  'pt-BR': { label: 'Português (Brasil)' },
  'pt-PT': { label: 'Português (Portugal)' },
  'nl-NL': { label: 'Nederlands' },
  'pl-PL': { label: 'Polski' },
  'ru-RU': { label: 'Русский' },
  'tr-TR': { label: 'Türkçe' },
  'ar-SA': { label: 'العربية' },
  'hi-IN': { label: 'हिन्दी' },
  'zh-CN': { label: '中文 (简体)' },
  'zh-TW': { label: '中文 (繁體)' },
  'ja-JP': { label: '日本語' },
  'ko-KR': { label: '한국어' },
};

export const MIRROR_AXES = {
  horizontal: { label: 'Horizontal', scaleX: -1, scaleY: 1 },
  vertical:   { label: 'Vertical',   scaleX: 1,  scaleY: -1 },
  both:       { label: 'Both',       scaleX: -1, scaleY: -1 },
};

export const LIMITS = {
  notchWidth:   { min: 280, max: 500, default: 340 },
  textHeight:   { min: 100, max: 400, default: 150 },
  scrollSpeed:  { min: 0.5, max: 8,   default: 3 },    // words per second
  glassOpacity: { min: 0,   max: 0.6, default: 0.15 }, // reader card fill opacity (0–60%)
};

export const DEFAULTS = {
  fontSize: 'lg',
  fontFamily: 'sans',
  fontColor: 'white',
  cueColor: 'white',
  cueBrightness: 'dim',
  overlayMode: 'pinned',
  listeningMode: 'wordTracking',
  mirrorAxis: 'horizontal',
  mirror: false,
  scrollSpeed: 3,
  notchWidth: 340,
  textHeight: 150,
  glassOpacity: 0.15,
  showElapsedTime: true,
  autoNextPage: false,
  autoNextPageDelay: 3,
  speechLocale: '',     // '' → browser default
  micId: '',            // '' → system default microphone (B1 / #30)
  script: '',
};
