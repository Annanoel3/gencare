import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, Pause, Play, Square } from 'lucide-react';
import { usePluginPresent } from './usePluginPresent';
import { plugin } from '@/lib/phone';

// A thin bar under the header on EVERY page while the phone is recording for
// notes, with Pause and Stop on it (ported from ADHDone). Record Notes draws
// its own controls, so the bar stays off that page. Stop here hands the person
// to Record Notes, which turns the stopped recording into notes on arrival.
const recorder = () => plugin('RecorderBridge');

const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(r).padStart(2, '0');
};

export default function RecordingBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const present = usePluginPresent('RecorderBridge');
  const [live, setLive] = useState(null); // { paused, baseMs, baseAt }
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const read = async () => {
    const R = recorder();
    if (!R) return;
    try {
      const st = await R.status();
      if (!mounted.current) return;
      if (st?.recording && st.session) {
        setLive({ paused: st.session.state === 'paused', baseMs: Number(st.session.elapsedMs) || 0, baseAt: Date.now() });
      } else {
        setLive(null);
      }
    } catch (e) { /* an older build */ }
  };

  useEffect(() => {
    mounted.current = true;
    if (!present) return undefined;
    read();
    let handle = null;
    const R = recorder();
    try {
      Promise.resolve(R?.addListener?.('recorder', () => read())).then((h) => { handle = h; }).catch(() => {});
    } catch (e) { /* no events on this build */ }
    const onVisible = () => { if (document.visibilityState === 'visible') read(); };
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(read, 15000);
    return () => {
      mounted.current = false;
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      handle?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  useEffect(() => {
    if (!live || live.paused) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  if (!present || !live || location.pathname.startsWith('/notes')) return null;

  const pauseOrResume = async () => {
    const R = recorder();
    if (!R || busy) return;
    setBusy(true);
    try {
      const res = live.paused ? await R.resume() : await R.pause();
      const s = res?.session;
      if (s) setLive({ paused: s.state === 'paused', baseMs: Number(s.elapsedMs) || 0, baseAt: Date.now() });
      else await read();
    } catch (e) { await read(); } finally { setBusy(false); }
  };

  const stop = async () => {
    const R = recorder();
    if (!R || busy) return;
    setBusy(true);
    try {
      await R.stop();
      setLive(null);
      navigate('/notes');
    } catch (e) { await read(); } finally { setBusy(false); }
  };

  const elapsed = live.baseMs + (live.paused ? 0 : Date.now() - live.baseAt);

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm bg-red-50 text-red-900 border-b border-red-100 dark:bg-red-950 dark:text-red-100 dark:border-red-900" role="status">
      <Mic className={`w-4 h-4 flex-shrink-0 ${live.paused ? '' : 'animate-pulse text-red-500'}`} />
      <button type="button" onClick={() => navigate('/notes')} className="flex-1 min-w-0 text-left truncate">
        {live.paused ? 'Recording paused' : 'Recording for notes'} <span className="tabular-nums opacity-80">{fmt(elapsed)}</span>
      </button>
      <button type="button" onClick={pauseOrResume} disabled={busy} className="flex items-center gap-1 rounded-full px-3 py-1 bg-white hover:bg-red-100 text-red-800 border border-red-200 dark:bg-white/15 dark:text-inherit dark:border-transparent">
        {live.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        {live.paused ? 'Resume' : 'Pause'}
      </button>
      <button type="button" onClick={stop} disabled={busy} className="flex items-center gap-1 rounded-full px-3 py-1 bg-white hover:bg-red-100 text-red-800 border border-red-200 dark:bg-white/15 dark:text-inherit dark:border-transparent">
        <Square className="w-3.5 h-3.5" />
        Stop
      </button>
    </div>
  );
}
