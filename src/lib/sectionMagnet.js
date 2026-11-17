import { useEffect } from 'react';

// Sections line themselves up (Anna, Nov 17 2026, "option A"). Scrolling
// stays normal; when someone stops scrolling with a section's top edge within
// about a fingertip of the top of the screen, the page slides that last bit
// so the section sits right under the top bar. It never carries anyone past
// what they were reading: it only moves when a section edge is already that
// close. Sections are marked with data-section (Home, Calendar, Care Log,
// Reminders). Left alone: the very top and bottom of a page, while a finger
// is still down, a popup or the keyboard is open, and a highlighted event a
// notification opened.

const NEAR = 56; // px, about a fingertip
const QUIET = 180; // ms without scrolling counts as stopped

export function useSectionMagnet() {
  useEffect(() => {
    let timer = 0;
    let touching = false;
    let scrolled = false;
    let quietUntil = 0;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    const settle = () => {
      const moved = scrolled;
      scrolled = false;
      if (!moved || touching || Date.now() < quietUntil) return;
      const body = document.body;
      if (body.hasAttribute('data-scroll-locked') || body.style.overflow === 'hidden') return;
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      if (document.querySelector('[data-focus="true"]')) return;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (y < NEAR || y > max - 2) return;
      // Just under the top bar: the same line "Back to calendar" and tapping a day use.
      const line = 5 * parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
      let best = null;
      document.querySelectorAll('[data-section]').forEach((el) => {
        if (!el.getClientRects().length) return; // not showing (another tab)
        const d = el.getBoundingClientRect().top - line;
        if (best === null || Math.abs(d) < Math.abs(best)) best = d;
      });
      if (best === null || Math.abs(best) < 3 || Math.abs(best) > NEAR) return;
      quietUntil = Date.now() + 700;
      window.scrollBy({ top: best, behavior: calm?.matches ? 'auto' : 'smooth' });
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(settle, QUIET); };
    const onScroll = () => { scrolled = true; if (!touching) later(); };
    const down = () => { touching = true; clearTimeout(timer); };
    const up = () => { touching = false; if (scrolled) later(); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchend', up, { passive: true });
    window.addEventListener('touchcancel', up, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, []);
}
