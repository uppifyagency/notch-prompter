// files.js — pure file-type classification, shared by the file-input handler and
// drag-and-drop. One classifier so the extension/MIME rules live in a single place.

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const KEYNOTE_MIMES = ['application/vnd.apple.keynote', 'application/x-iwork-keynote-sffkey'];

// Classify a dropped/opened file from its name and MIME type.
// Returns one of: 'pptx' | 'keynote' | 'text' | 'unknown'.
export function fileKind(name = '', mimeType = '') {
  const ext = name.toLowerCase().split('.').pop();
  const mime = mimeType.toLowerCase();

  if (ext === 'pptx' || mime === PPTX_MIME) return 'pptx';
  if (ext === 'key' || KEYNOTE_MIMES.includes(mime)) return 'keynote';
  if (ext === 'txt' || ext === 'md' || mime.startsWith('text/')) return 'text';
  return 'unknown';
}

// A download filename derived from the script's first line: a slug + ".txt".
// Falls back to "script.txt" when there's nothing usable.
export function scriptFilename(text) {
  const firstLine = (text.split('\n').find((l) => l.trim()) || '').trim();
  const slug = firstLine
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanumerics → dashes
    .replace(/^-+|-+$/g, '')        // trim leading/trailing dashes
    .slice(0, 40)
    .replace(/-+$/, '');            // re-trim after the length cap
  return `${slug || 'script'}.txt`;
}
