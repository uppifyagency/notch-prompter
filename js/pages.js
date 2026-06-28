// pages.js — pure page-deck operations. The deck is an array of page strings;
// these transforms are immutable (return a new array) so the DOM layer can diff.
// joinPages is the inverse of text.js splitIntoPages (same "---" separator).

const SEPARATOR = '\n\n---\n\n';

// Insert a page (default empty) at index (default: append). Returns a new array.
export function addPage(pages, index = pages.length, text = '') {
  const next = pages.slice();
  next.splice(index, 0, text);
  return next;
}

// Remove the page at index. The deck never empties — removing the last page
// leaves a single blank page (mirrors splitIntoPages' "always ≥1" contract).
export function removePage(pages, index) {
  const next = pages.slice();
  next.splice(index, 1);
  return next.length ? next : [''];
}

// Move the page at `from` to `to`, returning a new array.
export function movePage(pages, from, to) {
  const next = pages.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Join pages back into a single script with the "---" page separator.
export function joinPages(pages) {
  return pages.join(SEPARATOR);
}

// A short label for a page: 1-based number + first line, truncated. Shared by the
// composer page-bar and the stage page-picker.
export function pagePreview(page, index, maxLen = 28) {
  const firstLine = page.split('\n')[0].slice(0, maxLen);
  return `${index + 1}. ${firstLine || '(empty)'}`;
}
