import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { GUIDE_EVENT, guideById } from '@/components/help/guides';
import { track } from '@/lib/activity';

// Runs Help's "Show me how" walkthroughs (components/help/guides.jsx) on the
// real screens: everything but the next thing to tap is dimmed, a box under
// or over it says what to do, and tapping it moves on. Taps anywhere else are
// held back, so a step can't be lost by tapping the wrong thing; Stop ends it.
// Mounted once, in AppLayout, so it keeps going from page to page.

const PAD = 6;
const GAP = 12;
const TICK_MS = 150;
const names = (t) => (Array.isArray(t) ? t : [t]).filter(Boolean);

function onScreen(el) {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const st = window.getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
}

export function findTarget(target) {
  for (const n of names(target)) {
    const el = [...document.querySelectorAll(`[data-guide="${n}"]`)].find(onScreen);
    if (el) return el;
  }
  return null;
}

const sameTarget = (a, b) => names(a.target).some((n) => names(b.target).includes(n));
// A step that only says to tap something to get somewhere.
const justGetsThere = (step) => !step.next && !step.check && !step.tapOn && !step.last;

function viewport() {
  const vv = window.visualViewport;
  return { top: vv?.offsetTop || 0, height: vv?.height || window.innerHeight, width: window.innerWidth };
}

export default function GuideOverlay() {
  const [run, setRun] = useState(null); // { guide, i, done, stuck }
  const [hole, setHole] = useState(null);
  const [lost, setLost] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [bubbleH, setBubbleH] = useState(140);
  const [vp, setVp] = useState(viewport);
  const runRef = useRef(null);
  const elRef = useRef(null);
  const lostSince = useRef(0);
  const scrolledFor = useRef('');
  const checking = useRef(0);
  const rootRef = useRef(null);
  const bubbleRef = useRef(null);
  runRef.current = run;

  const end = useCallback((how) => {
    const r = runRef.current;
    if (r) track('action', `guide ${how}`, `${r.guide.id} at ${r.i + 1}`);
    setRun(null);
    setHole(null);
    elRef.current = null;
  }, []);

  const advance = useCallback(() => {
    checking.current = 0;
    lostSince.current = 0;
    setLost(false);
    setRun((r) => {
      if (!r) return r;
      const n = r.i + 1;
      if (n < r.guide.steps.length) return { ...r, i: n, stuck: false };
      track('action', 'guide finished', r.guide.id);
      return r.guide.done ? { ...r, done: true, stuck: false } : null;
    });
  }, []);

  // Help's "Show me" buttons (and the Help chat) start one.
  useEffect(() => {
    const go = (e) => {
      const guide = guideById(e.detail?.id);
      if (!guide) return;
      checking.current = 0;
      lostSince.current = 0;
      scrolledFor.current = '';
      setLost(false);
      setRun({ guide, i: 0, done: false, stuck: false });
      track('action', 'guide started', guide.id);
    };
    window.addEventListener(GUIDE_EVENT, go);
    return () => window.removeEventListener(GUIDE_EVENT, go);
  }, []);

  // Watch the screen: find this step's target, skip what's already done, notice a form that didn't save.
  useEffect(() => {
    if (!run || run.done) return undefined;
    const tick = () => {
      const r = runRef.current;
      if (!r || r.done) return;
      const steps = r.guide.steps;
      const step = steps[r.i];
      setVp((v) => { const n = viewport(); return n.top === v.top && n.height === v.height && n.width === v.width ? v : n; });
      // Already where the next step is (on the Calendar, say)? Then this one's done.
      const nextStep = steps[r.i + 1];
      if (justGetsThere(step) && nextStep && !sameTarget(step, nextStep) && findTarget(nextStep.target)) { advance(); return; }
      const el = findTarget(step.target);
      elRef.current = el;
      if (step.check && checking.current) {
        const busy = el && (el.disabled || /saving/i.test(el.textContent || ''));
        if (!el) { advance(); return; }
        if (!busy && Date.now() - checking.current > 1500) { checking.current = 0; setRun((x) => (x ? { ...x, stuck: true } : x)); }
      }
      if (step.check && r.stuck && !el) { advance(); return; }
      if (!el) {
        if (!lostSince.current) lostSince.current = Date.now();
        const gone = Date.now() - lostSince.current;
        if (step.optional && gone > 1500) { advance(); return; }
        if (gone > 2500) setLost(true);
        setHole(null);
        return;
      }
      lostSince.current = 0;
      setLost(false);
      const b = el.getBoundingClientRect();
      const v = viewport();
      const key = `${r.guide.id}:${r.i}`;
      if (scrolledFor.current !== key) {
        scrolledFor.current = key;
        if (b.top < v.top + 72 || b.bottom > v.top + v.height - 80) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* fine */ } }
      }
      const next = { top: Math.round(b.top - PAD), left: Math.round(b.left - PAD), width: Math.round(b.width + PAD * 2), height: Math.round(b.height + PAD * 2) };
      setHole((h) => (h && h.top === next.top && h.left === next.left && h.width === next.width && h.height === next.height ? h : next));
    };
    tick();
    const t = setInterval(tick, TICK_MS);
    return () => clearInterval(t);
  }, [run?.guide?.id, run?.i, run?.done, advance]); // eslint-disable-line react-hooks/exhaustive-deps

  // A tap on the lit-up thing moves on (the tap itself still does what it always does).
  useEffect(() => {
    if (!run || run.done) return undefined;
    const onClick = (e) => {
      const r = runRef.current;
      if (!r || r.done) return;
      const step = r.guide.steps[r.i];
      const el = elRef.current;
      if (step.next || !el || !el.contains(e.target)) return;
      if (step.tapOn && !e.target.closest?.(`[data-guide="${step.tapOn}"]`)) return;
      if (step.check) { checking.current = Date.now(); setRun((x) => (x ? { ...x, stuck: false } : x)); return; }
      advance();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [run?.guide?.id, run?.i, run?.done, advance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Taps on the guide's own parts never reach an open form's "tapped outside, so close"
  // (Radix listens on the document), and its buttons never take the focus from a text box.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const stop = (e) => e.stopPropagation();
    const keepFocus = (e) => { e.stopPropagation(); if (e.target.closest?.('button')) e.preventDefault(); };
    root.addEventListener('pointerdown', stop);
    root.addEventListener('touchstart', stop);
    root.addEventListener('focusin', stop);
    root.addEventListener('mousedown', keepFocus);
    return () => {
      root.removeEventListener('pointerdown', stop);
      root.removeEventListener('touchstart', stop);
      root.removeEventListener('focusin', stop);
      root.removeEventListener('mousedown', keepFocus);
    };
  }, [run ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const h = bubbleRef.current?.offsetHeight;
    if (h && h !== bubbleH) setBubbleH(h);
  });

  if (!run) return null;
  const step = run.guide.steps[run.i];
  const total = run.guide.steps.length;
  const isLast = run.i === total - 1;
  const showHole = !run.done && !lost && hole;

  // Under the lit-up thing when there's room, else over it; at the bottom when there's nothing to point at.
  let top;
  const bottomOf = vp.top + vp.height;
  if (showHole) {
    const below = bottomOf - (hole.top + hole.height) - GAP;
    const above = hole.top - vp.top - GAP;
    if (below >= bubbleH + GAP || below >= above) top = hole.top + hole.height + GAP;
    else top = hole.top - GAP - bubbleH;
  } else {
    top = bottomOf - bubbleH - 88;
  }
  top = Math.max(vp.top + 8, Math.min(top, bottomOf - bubbleH - 8));

  const words = run.done ? run.guide.done
    : lost ? (step.missing || <>Looking for it… If it doesn't show up, tap <b>Stop</b> and start again from <b>Help</b>.</>)
      : run.stuck ? step.stuck : step.say;
  const bump = () => setNudge((n) => n + 1);
  const block = { pointerEvents: 'auto', touchAction: 'none' };
  const dim = 'fixed bg-black/55';

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-[100]" style={{ pointerEvents: 'none' }} data-guide-ui="">
      {showHole && (
        <>
          <div className={dim} style={{ ...block, left: 0, right: 0, top: 0, height: Math.max(0, hole.top) }} onClick={bump} />
          <div className={dim} style={{ ...block, left: 0, right: 0, top: hole.top + hole.height, bottom: 0 }} onClick={bump} />
          <div className={dim} style={{ ...block, left: 0, width: Math.max(0, hole.left), top: hole.top, height: hole.height }} onClick={bump} />
          <div className={dim} style={{ ...block, left: hole.left + hole.width, right: 0, top: hole.top, height: hole.height }} onClick={bump} />
          <div className="fixed rounded-xl ring-4 ring-primary animate-pulse" style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }} aria-hidden="true" />
        </>
      )}
      <div ref={bubbleRef} role="dialog" aria-live="polite" aria-label={run.guide.title}
        key={`${run.i}-${nudge}`}
        className={`fixed left-1/2 -translate-x-1/2 w-[min(28rem,calc(100vw-1.5rem))] rounded-2xl bg-card text-card-foreground shadow-2xl border-2 border-primary p-4 ${nudge ? 'animate-[guide-nudge_0.35s_ease-in-out]' : ''}`}
        style={{ pointerEvents: 'auto', top }}>
        <p className="text-sm text-muted-foreground mb-1">
          {run.guide.title}{run.done ? '' : ` · Step ${run.i + 1} of ${total}`}
        </p>
        <p className="text-lg leading-snug">{words}</p>
        <div className="flex gap-2 mt-3">
          {run.done || (lost && step.missing) ? (
            <Button className="h-12 flex-1 text-base" onClick={() => end(run.done ? 'closed' : 'stopped, not there')}>OK</Button>
          ) : (
            <>
              <Button variant="outline" className="h-12 flex-1 text-base" onClick={() => end('stopped')}>Stop</Button>
              {step.next && !lost && <Button className="h-12 flex-[2] text-base" onClick={advance}>{isLast ? 'Done' : 'Next'}</Button>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
