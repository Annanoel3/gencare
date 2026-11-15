// Text size (Anna, Nov 14 2026, from the audit for older family members: "a
// Larger text setting would help most of all"). Settings -> Appearance picks
// Normal, Large or Larger, kept on this phone (a bigger screen may not need
// it). It sets the page's base size, so everything sized from it grows
// together: words, buttons, boxes and the space around them.

export const TEXT_SIZES = [
  { value: 'normal', label: 'Normal', scale: 1 },
  { value: 'large', label: 'Large', scale: 1.125 },
  { value: 'larger', label: 'Larger', scale: 1.25 },
];
// Big text mode (Anna, Nov 15 2026: "The text is still too small for my dad"):
// a switch at the top of Settings, bigger than Larger. The month calendar's
// words grow a little too (index.css --cal-chip), as much as its boxes allow.
export const BIG = { value: 'big', label: 'Big text mode', scale: 1.5 };
const ALL = [...TEXT_SIZES, BIG];

const KEY = 'gencare_text_size';

export function savedTextSize() {
  try { return localStorage.getItem(KEY) || 'normal'; } catch { return 'normal'; }
}

export function applyTextSize(value = savedTextSize()) {
  const size = ALL.find((s) => s.value === value) || TEXT_SIZES[0];
  const root = document.documentElement;
  root.style.fontSize = size.scale === 1 ? '' : `${size.scale * 100}%`;
  root.dataset.textSize = size.value;
}

export function setTextSize(value) {
  try { localStorage.setItem(KEY, value); } catch { /* still applies for now */ }
  applyTextSize(value);
}
