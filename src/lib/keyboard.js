// Keeping the box you're typing in visible above the phone's keyboard
// (Anna, Oct 29 2026: tapping a text box often scrolled to "some weird spot
// where they can't even see where they're typing").
//
// When a box gets focus, and again whenever the keyboard changes the visible
// area, the box is scrolled into the middle of what's still visible, inside
// a pop-up's own scroll area too. Nothing moves if it's already in view.

const TEXT = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number', 'date', 'time', 'datetime-local', '']);
const isField = (el) => !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && TEXT.has(String(el.getAttribute('type') || '').toLowerCase())));

let timer = null;
function reveal() {
  const el = document.activeElement;
  if (!isField(el)) return;
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const bottom = top + (vv ? vv.height : window.innerHeight);
  const r = el.getBoundingClientRect();
  if (r.top >= top + 12 && r.bottom <= bottom - 12) return;
  try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
}
const soon = (ms) => { clearTimeout(timer); timer = setTimeout(reveal, ms); };

export function keepTypingInView() {
  if (typeof window === 'undefined' || window.__gencareKeyboard) return;
  window.__gencareKeyboard = true;
  // After the keyboard has had time to open.
  document.addEventListener('focusin', (e) => { if (isField(e.target)) soon(350); });
  window.visualViewport?.addEventListener('resize', () => soon(120));
  window.addEventListener('resize', () => soon(120));
}
