// pptx.js — extract speaker-facing text from a PowerPoint .pptx, with no
// dependencies. A .pptx is a ZIP (OOXML) whose slide text lives in
// ppt/slides/slideN.xml inside <a:t> runs. We read the ZIP central directory,
// inflate each slide entry with the browser-native DecompressionStream
// (deflate-raw), pull the text runs, and join slides as pages ("---").

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;

const readU16 = (b, o) => b[o] | (b[o + 1] << 8);
const readU32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
const decode = (bytes) => new TextDecoder('utf-8').decode(bytes);

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&'); // last, so we never double-decode
}

// Pure: turn one slide's XML into plain text. Each <a:t> run is appended to the
// current line; each </a:p> ends a paragraph (one line). Entities are decoded.
export function slideXmlToText(xml) {
  const lines = [];
  let line = '';
  const re = /<a:t>([\s\S]*?)<\/a:t>|<\/a:p>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) line += decodeXmlEntities(m[1]);
    else { if (line.trim()) lines.push(line.trim()); line = ''; }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n');
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Response(bytes).body.pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Async: extract all slide text from a .pptx, ordered by slide number, with
// slides separated by a "---" page break (so multi-page auto-advance works).
export async function extractPptxText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (readU32(bytes, i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .pptx file (no ZIP directory found).');

  const count = readU16(bytes, eocd + 10);
  let p = readU32(bytes, eocd + 16);
  const slides = [];

  for (let i = 0; i < count && readU32(bytes, p) === SIG_CENTRAL; i++) {
    const method = readU16(bytes, p + 10);
    const compSize = readU32(bytes, p + 20);
    const fnLen = readU16(bytes, p + 28);
    const extraLen = readU16(bytes, p + 30);
    const commentLen = readU16(bytes, p + 32);
    const localOff = readU32(bytes, p + 42);
    const name = decode(bytes.subarray(p + 46, p + 46 + fnLen));
    p += 46 + fnLen + extraLen + commentLen;

    const match = name.match(SLIDE_RE);
    if (!match) continue;

    const lFnLen = readU16(bytes, localOff + 26);
    const lExtraLen = readU16(bytes, localOff + 28);
    const dataStart = localOff + 30 + lFnLen + lExtraLen;
    if (dataStart + compSize > bytes.length) throw new Error('Corrupt .pptx (truncated slide entry).');
    const comp = bytes.subarray(dataStart, dataStart + compSize);
    const raw = method === 0 ? comp : await inflateRaw(comp);
    slides.push({ n: +match[1], text: slideXmlToText(decode(raw)) });
  }

  if (!slides.length) throw new Error('No slides with text were found in this .pptx.');
  slides.sort((a, b) => a.n - b.n);
  return slides.map((s) => s.text).filter(Boolean).join('\n\n---\n\n');
}
