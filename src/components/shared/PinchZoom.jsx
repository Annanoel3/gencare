import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn } from 'lucide-react';

// Pinch to zoom on the calendar (Anna, Nov 13 2026: "We should make like
// everything zoomable. Especially the calendar. My parents are always trying
// to zoom in there"). Two fingers apart makes it bigger, together smaller, up
// to 3x, and it's remembered on this phone; "Back to normal" undoes it.
// This works in the app as it is today: the phone apps turn the WebView's own
// pinch zoom off (Capacitor's default), and the rest of the app gets that back
// with the next builds (capacitor.config zoomEnabled). Here the calendar keeps
// its own, so a pinch on it never zooms the whole page too.
//
//   pan     the calendar grows wider than the screen and slides sideways
//           (the month grid: seven days across can't get bigger otherwise)
//   reflow  everything gets bigger and wraps to the screen's width (lists)

const MIN = 1;
const MAX = 3;
const read = (key) => { try { const n = Number(localStorage.getItem(key)); return n >= MIN && n <= MAX ? n : 1; } catch { return 1; } };
const save = (key, n) => { try { localStorage.setItem(key, String(n)); } catch { /* fine */ } };
const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export default function PinchZoom({ storageKey, mode = 'reflow', children, className = '' }) {
  const outer = useRef(null);
  const [zoom, setZoom] = useState(() => read(storageKey));
  const live = useRef(zoom);
  live.current = zoom;
  // The space it has, in plain pixels: a zoomed width is set from it (a
  // percentage under CSS zoom isn't the same on every phone).
  const [base, setBase] = useState(0);
  useEffect(() => {
    const el = outer.current;
    if (!el) return undefined;
    const measure = () => setBase(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = outer.current;
    if (!el) return undefined;
    let start = null;
    let frame = 0;
    const onStart = (e) => {
      if (e.touches.length !== 2) return;
      const rect = el.getBoundingClientRect();
      start = { dist: gap(e.touches), zoom: live.current, midX: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left, scroll: el.scrollLeft };
    };
    let pending = null;
    const onMove = (e) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const s = start;
      const next = Math.min(MAX, Math.max(MIN, s.zoom * (gap(e.touches) / (s.dist || 1))));
      pending = next;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setZoom(next);
        // Keep the spot between the fingers where it was.
        if (mode === 'pan') el.scrollLeft = (s.scroll + s.midX) * (next / s.zoom) - s.midX;
      });
    };
    const onEnd = (e) => {
      if (!start || e.touches.length >= 2) return;
      start = null;
      if (pending !== null) { setZoom(pending); save(storageKey, pending); pending = null; }
    };
    // iPhone: its own pinch (once the app allows one) stays off the calendar.
    const stop = (e) => e.preventDefault();
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    el.addEventListener('gesturestart', stop);
    el.addEventListener('gesturechange', stop);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('gesturestart', stop);
      el.removeEventListener('gesturechange', stop);
    };
  }, [storageKey, mode]);

  const reset = () => { setZoom(1); save(storageKey, 1); if (outer.current) outer.current.scrollLeft = 0; };
  const zoomed = zoom > 1.04;
  // pan: as wide as the space at 1x, so zoomed it's wider than the screen;
  // reflow: narrower by the zoom, so zoomed it's exactly the screen's width.
  const inner = zoomed && base ? { zoom, width: `${mode === 'pan' ? base : base / zoom}px` } : undefined;

  return (
    <div className={className}>
      {zoomed && (
        <div className="flex justify-end px-1 mb-1.5">
          <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 h-8 text-xs font-medium text-muted-foreground">
            <ZoomIn className="w-3.5 h-3.5" /> {Math.round(zoom * 100)}% · Back to normal
          </button>
        </div>
      )}
      <div ref={outer} className={`${mode === 'pan' && zoomed ? 'overflow-x-auto' : ''} [touch-action:pan-x_pan-y]`}>
        <div style={inner}>{children}</div>
      </div>
    </div>
  );
}
