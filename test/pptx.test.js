import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { slideXmlToText, extractPptxText } from '../js/pptx.js';

test('slideXmlToText joins <a:t> runs into a line and paragraphs into lines', () => {
  const xml = '<a:p><a:r><a:t>Hello</a:t></a:r><a:r><a:t> world</a:t></a:r></a:p>'
            + '<a:p><a:t>second line</a:t></a:p>';
  assert.equal(slideXmlToText(xml), 'Hello world\nsecond line');
});

test('slideXmlToText decodes XML entities', () => {
  assert.equal(slideXmlToText('<a:p><a:t>Tom &amp; Jerry &lt;3</a:t></a:p>'), 'Tom & Jerry <3');
});

test('slideXmlToText returns empty string when there are no text runs', () => {
  assert.equal(slideXmlToText('<a:p></a:p>'), '');
});

// --- Minimal ZIP writer for a .pptx fixture (deflate, CRC left 0 — the parser
// does not verify it). Only the entries extractPptxText reads are included. ---
function zipPptx(slides) {
  const enc = new TextEncoder();
  const files = slides.map((xml, i) => ({ name: `ppt/slides/slide${i + 1}.xml`, data: enc.encode(xml) }));
  const local = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = Buffer.from(f.name, 'utf8');
    const comp = zlib.deflateRawSync(Buffer.from(f.data));
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(8, 8);                 // method: deflate
    lh.writeUInt32LE(comp.length, 18);      // compressed size
    lh.writeUInt32LE(f.data.length, 22);    // uncompressed size
    lh.writeUInt16LE(nameBytes.length, 26);
    local.push(lh, nameBytes, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(8, 10);                // method: deflate
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(nameBytes.length, 28);
    ch.writeUInt32LE(offset, 42);           // local header offset
    central.push(ch, nameBytes);
    offset += lh.length + nameBytes.length + comp.length;
  }
  const localBuf = Buffer.concat(local);
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);      // entries on disk
  eocd.writeUInt16LE(files.length, 10);     // total entries
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);  // central dir offset
  return new Uint8Array(Buffer.concat([localBuf, centralBuf, eocd]));
}

test('extractPptxText inflates slides and joins them as pages, in order', async () => {
  const pptx = zipPptx([
    '<a:p><a:t>Slide one title</a:t></a:p><a:p><a:t>bullet a</a:t></a:p>',
    '<a:p><a:t>Slide two</a:t></a:p>',
  ]);
  const text = await extractPptxText(pptx);
  assert.equal(text, 'Slide one title\nbullet a\n\n---\n\nSlide two');
});

test('extractPptxText rejects a non-pptx buffer', async () => {
  await assert.rejects(() => extractPptxText(new Uint8Array([1, 2, 3, 4])), /not a valid \.pptx/i);
});
