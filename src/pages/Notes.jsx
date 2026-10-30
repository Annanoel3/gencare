import React, { useCallback, useEffect, useRef, useState } from "react";
import { track } from '@/lib/activity';
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { listEvents } from "@/lib/events";
import { realEvent } from "@/lib/sameEvent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import {
  Mic, Pause, Play, Square, ChevronLeft, ChevronRight, Trash2, Plus, Check, Loader2, Info, RotateCcw, FileDown, Lock, Users,
} from "lucide-react";
import { downloadNotesPdf } from "@/components/notes/notesPdf";
import PrepPointsList from "@/components/notes/PrepPointsList";
import { withFamily, useFamily } from "@/lib/family";
import { plugin } from "@/lib/phone";
import { isRecordable } from "@/components/calendar/EventRow";

// ── Record Notes: record an appointment, meeting or class; get clear notes ──
// The same setup as ADHDone's Notes page, pointed at GenCare's calendar.
//
//   1. Record: the phone records (RecorderBridge / RecorderService) with the
//      screen off or the app closed, in ~10 minute parts, until Stop.
//   2. Each part is read off the phone and sent to transcribeAudioNew
//      ("notes_part"), which turns it into text and counts the family's minutes.
//   3. transcribeAudioNew ("notes_make") turns the whole transcript into notes:
//      the gist first, to-dos that can go straight into the family's task list,
//      exact details, short topic headings, no paragraphs. The full transcript
//      stays one tap away.
//   4. The audio is deleted from the phone once it has been transcribed.
//
// A recordable event (Appointment, School, Work) coming up already has its
// card, drawn dashed because nothing's recorded yet. Its page is where
// questions go beforehand (saved on the appointment as prep_questions) and
// where recording starts. Recordings are shared with the family by default
// (a visit for Mom is for everyone helping her). The calendar
// links here with ?appointment=ID (the event's page) or ?appointment=ID&record=1.

const recorder = () => plugin("RecorderBridge");

let processingLock = false;
const finishing = new Set();
const sessionLinks = new Map();

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// An appointment's start time, if it has one.
function startOf(appt) {
  if (!appt?.date) return null;
  const ms = new Date(`${appt.date}T${appt.time || "09:00"}:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function cleanQuestions(list) {
  return (Array.isArray(list) ? list : []).map((q) => String(q || "").trim()).filter(Boolean).slice(0, 20);
}

const checkedKey = (sessionId) => `notes_checked_${sessionId}`;
function readChecked(sessionId) {
  try {
    const v = JSON.parse(localStorage.getItem(checkedKey(sessionId)) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
function forgetChecked(sessionId) {
  try { localStorage.removeItem(checkedKey(sessionId)); } catch (e) { /* nothing kept */ }
}

function minutesText(seconds) {
  const m = Math.floor((Number(seconds) || 0) / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

// "42 minutes left this month" — the family's minutes, by plan.
function usageLine(usage) {
  if (!usage) return "";
  if (usage.unlimited) return `${minutesText(usage.used_seconds)} used this month, no limit.`;
  return `${minutesText(usage.left_seconds)} of ${Math.round((usage.limit_seconds || 0) / 60)} minutes left this month for your family.`;
}

function nextMonthStart() {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return n.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function clock(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h > 0 ? `${h}:` : ""}${h > 0 ? String(m).padStart(2, "0") : m}:${String(s).padStart(2, "0")}`;
}

// ==double equals== → a highlighter mark.
function hi(text) {
  const s = String(text || "");
  if (!s.includes("==")) return s;
  const out = [];
  const re = /==([^=]{1,80}?)==/g;
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(<mark key={m.index} className="rounded px-0.5 bg-yellow-200/80 text-inherit dark:bg-yellow-500/40">{m[1]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
function unhi(text) {
  return String(text || "").replace(/==([^=]{1,80}?)==/g, "$1");
}

const CONSENT_STATES = "California, Delaware, Florida, Illinois, Maryland, Massachusetts, Montana, Nevada, New Hampshire, Oregon, Pennsylvania and Washington";

function ConsentNote({ center = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`text-xs text-muted-foreground ${center ? "text-center" : ""}`}>
      <p className={`flex gap-1.5 ${center ? "justify-center" : ""}`}>
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          In 12 states, everyone has to agree before you record them.{" "}
          <button type="button" className="underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide the list" : "Which states?"}
          </button>
        </span>
      </p>
      {open && <p className="mt-1 pl-5">{CONSENT_STATES}.</p>}
    </div>
  );
}

function whenText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function paragraphs(text) {
  const sentences = String(text || "").match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [];
  const out = [];
  for (let i = 0; i < sentences.length; i += 4) out.push(sentences.slice(i, i + 4).join("").trim());
  return out.filter(Boolean);
}

const STATUS_TEXT = {
  recording: "Recording",
  transcribing: "Making your notes…",
  notes_failed: "Notes not made yet",
  over_limit: "Stopped at this month's minutes",
  ready: "",
  merged: "",
};

const followUpsOf = (rows, id) => (rows || [])
  .filter((r) => r && r.parent_record_id === id)
  .sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0));
const withFollowUpText = (r, rows) => {
  const more = followUpsOf(rows, r?.id);
  if (!more.length) return r;
  const parts = [...(r.transcript_parts || [])];
  let offset = 100000;
  for (const f of more) {
    for (const p of (f.transcript_parts || [])) parts.push({ ...p, index: offset + (p.index || 0) });
    offset += 100000;
  }
  return { ...r, transcript_parts: parts };
};

function searchLines(r) {
  const n = r?.notes || {};
  const out = [];
  const add = (where, text) => { const s = String(text || "").trim(); if (s) out.push({ where, text: s }); };
  add("title", r?.title || n.title);
  add("about", r?.family_member_name);
  (n.gist || []).forEach((g) => add("gist", g));
  (n.todos || []).forEach((t) => add("to-do", t?.text));
  (n.details || []).forEach((d) => add("details", typeof d === "string" ? d : [d?.label, d?.value].filter(Boolean).join(": ")));
  (n.sections || []).forEach((s) => { add("topic", s?.heading); (s?.points || []).forEach((p) => add(s?.heading || "topic", p)); });
  (n.decisions || []).forEach((d) => add("decided", d?.text));
  (n.questions || []).forEach((q) => add("open question", q?.text));
  (r?.transcript_parts || []).slice().sort((a, b) => (a?.index || 0) - (b?.index || 0)).forEach((p) => add("transcript", p?.text));
  return out;
}

function searchMatch(r, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return { ok: true, snippet: null };
  const lines = searchLines(r);
  const all = lines.map((l) => l.text.toLowerCase()).join("\n");
  if (!words.every((w) => all.includes(w))) return { ok: false, snippet: null };
  const first = lines.find((l) => l.text.toLowerCase().includes(words[0]));
  if (!first) return { ok: true, snippet: null };
  const t = first.text;
  const i = t.toLowerCase().indexOf(words[0]);
  const from = Math.max(0, i - 50);
  const to = Math.min(t.length, i + words[0].length + 70);
  return { ok: true, snippet: { where: first.where, text: `${from > 0 ? "…" : ""}${t.slice(from, to)}${to < t.length ? "…" : ""}` } };
}

export default function Notes() {
  const { me, access } = useFamily();
  const [usage, setUsage] = useState(null);
  const [records, setRecords] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState("notes");
  const [title, setTitle] = useState("");
  const [live, setLive] = useState(null); // { sessionId, paused, baseMs, baseAt }
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { recordId, step, done, total }
  const [capOpen, setCapOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkingId, setLinkingId] = useState(null);
  const [prepAppt, setPrepAppt] = useState(null);
  const [draft, setDraft] = useState("");
  const [liveQuestions, setLiveQuestions] = useState([]);
  const [checked, setChecked] = useState([]);
  const [changeText, setChangeText] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeSaid, setChangeSaid] = useState("");
  const [asked, setAsked] = useState(null);
  const [askOneText, setAskOneText] = useState("");
  const [askOne, setAskOne] = useState(null);
  const [filling, setFilling] = useState(false);
  const [, setTick] = useState(0);
  const recordsRef = useRef([]);
  recordsRef.current = records;
  const supported = !!recorder();

  const loadRecords = useCallback(async () => {
    try {
      const rows = await base44.entities.NoteRecording.filter({}, "-started_at", 100);
      recordsRef.current = rows || [];
      setRecords(rows || []);
      return rows || [];
    } catch (e) {
      console.error("[Notes] could not load recordings", e);
      return recordsRef.current;
    } finally {
      setLoaded(true);
    }
  }, []);

  // Appointments from two months back onward (for linking), and the recordable
  // ones from three hours ago through the next month (the "Coming up" cards).
  const loadUpcoming = useCallback(async () => {
    try {
      const now = Date.now();
      // Their own events by their own names (not what the family sees).
      const rows = ((await listEvents(new Date(now - 61 * DAY), new Date(now + 366 * DAY))) || []).map(realEvent);
      const withStart = rows.filter((a) => startOf(a) !== null && startOf(a) > now - 60 * DAY);
      setEvents(withStart);
      const soon = withStart
        .filter((a) => isRecordable(a))
        .filter((a) => { const s = startOf(a); return s > now - 3 * HOUR && s < now + 31 * DAY; })
        .sort((a, b) => startOf(a) - startOf(b));
      setUpcoming(soon);
    } catch (e) {
      console.error("[Notes] could not load upcoming events", e);
    }
  }, []);

  const refreshUsage = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("transcribeAudioNew", { mode: "usage" });
      const u = res?.data?.usage || null;
      setUsage(u);
      return u;
    } catch (e) {
      return usage;
    }
  }, [usage]);

  // ── Turning a finished recording into notes ────────────────────────────────

  const processRecording = useCallback(async (record, session) => {
    const R = recorder();
    if (processingLock || !record) return;
    processingLock = true;
    let overLimit = false;
    try {
      const parts = (session?.parts || [])
        .filter((p) => p && p.ok && p.endMs !== null && p.endMs !== undefined)
        .sort((a, b) => a.index - b.index);
      const have = new Set((record.transcript_parts || []).map((p) => p.index));
      let done = parts.filter((p) => have.has(p.index)).length;
      setProgress({ recordId: record.id, step: "transcribing", done, total: parts.length });

      for (const p of parts) {
        if (have.has(p.index)) continue;
        if (!R) break;
        const { base64 } = await R.readPart({ sessionId: session.id, index: p.index });
        const res = await base44.functions.invoke("transcribeAudioNew", {
          mode: "notes_part",
          record_id: record.id,
          index: p.index,
          start_ms: p.startMs,
          end_ms: p.endMs,
          audio_base64: base64,
        });
        const data = res?.data || {};
        if (data.usage) setUsage(data.usage);
        if (data.over_limit) { overLimit = true; break; }
        if (!data.ok) throw new Error(data.error || "transcription failed");
        done += 1;
        setProgress({ recordId: record.id, step: "transcribing", done, total: parts.length });
      }

      setProgress({ recordId: record.id, step: "notes", done, total: parts.length });
      const made = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_make", record_id: record.id });
      if (!made?.data?.ok) throw new Error(made?.data?.error || "notes failed");
      track("action", "record notes: notes made", `${parts.length} part(s)`);

      if (overLimit) {
        await base44.entities.NoteRecording.update(record.id, { status: "over_limit" });
        setCapOpen(true);
      } else if (R && session?.id) {
        await R.deleteSession({ sessionId: session.id }).catch(() => {});
      }
      await loadRecords();
      setOpenId(record.parent_record_id || record.id);
      setTab("notes");
    } catch (e) {
      console.error("[Notes] processing stopped", e);
      track("error", "record notes: notes not made", String(e?.message || e).slice(0, 200));
      toast({
        title: "Your notes aren't finished yet",
        description: "Nothing's lost. They'll pick up where they left off the next time you open Record Notes.",
      });
      await loadRecords();
    } finally {
      processingLock = false;
      setProgress(null);
    }
  }, [loadRecords]);

  const finishSession = useCallback(async (session) => {
    if (!session?.id || finishing.has(session.id)) return;
    finishing.add(session.id);
    try {
      await finishOne(session);
    } finally {
      finishing.delete(session.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finishOne = async (session) => {
    const rows = recordsRef.current;
    let record = rows.find((r) => r.device_session_id === session.id);
    const usable = (session.parts || []).some((p) => p.ok && p.endMs !== null && p.endMs !== undefined);
    if (!usable) {
      if (record) await base44.entities.NoteRecording.delete(record.id).catch(() => {});
      await recorder()?.deleteSession({ sessionId: session.id }).catch(() => {});
      await loadRecords();
      return;
    }
    const fields = {
      status: record?.status === "ready" ? "ready" : "transcribing",
      duration_ms: Number(session.elapsedMs) || 0,
      parts_total: (session.parts || []).length,
    };
    try {
      if (record) {
        await base44.entities.NoteRecording.update(record.id, fields);
        record = { ...record, ...fields };
      } else {
        record = await base44.entities.NoteRecording.create(withFamily({
          user_id: me?.id,
          title: session.title || "",
          device_session_id: session.id,
          started_at: new Date(session.startedAt || Date.now()).toISOString(),
          shared_with_family: true,
          ...(sessionLinks.get(session.id) || {}),
          ...fields,
        }));
      }
    } catch (e) {
      console.error("[Notes] could not save the recording's details", e);
      return;
    }
    if (record.status === "ready") {
      await recorder()?.deleteSession({ sessionId: session.id }).catch(() => {});
      return;
    }
    await processRecording(record, session);
  };

  const resumeUnfinished = useCallback(async () => {
    const R = recorder();
    if (!R) return;
    try {
      const { sessions = [] } = await R.listSessions();
      const waiting = sessions
        .filter((s) => s.state === "stopped" || s.state === "interrupted")
        .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
      for (const s of waiting) {
        const rec = recordsRef.current.find((r) => r.device_session_id === s.id);
        if (rec?.status === "over_limit") {
          const u = await refreshUsage();
          if (!u || u.left_seconds <= 0) continue;
        }
        await finishSession(s);
      }
    } catch (e) {
      console.error("[Notes] could not check for unfinished recordings", e);
    }
  }, [finishSession, refreshUsage]);

  // ── Start-up ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let handle = null;
    let cancelled = false;
    (async () => {
      refreshUsage();
      const rows = await loadRecords();
      loadUpcoming();
      const R = recorder();
      if (!R || cancelled) return;
      let recordingNow = false;
      try {
        const st = await R.status();
        if (st?.recording && st.session) {
          recordingNow = true;
          const row = (rows || []).find((r) => r.device_session_id === st.session.id);
          setLiveQuestions(cleanQuestions(row?.questions));
          setLive({ sessionId: st.session.id, paused: st.session.state === "paused", baseMs: Number(st.session.elapsedMs) || 0, baseAt: Date.now() });
        }
      } catch (e) { /* older build */ }
      try {
        handle = await R.addListener("recorder", (e) => {
          const s = e?.session;
          if (e?.type === "paused" || e?.type === "resumed") {
            R.status().then((st) => {
              if (!st?.session) return;
              setLive((cur) => cur && { ...cur, paused: st.session.state === "paused", baseMs: Number(st.session.elapsedMs) || 0, baseAt: Date.now() });
            }).catch(() => {});
          } else if (e?.type === "stopped" && s) {
            setLive(null);
            forgetChecked(s.id);
            if (e.error === "time_limit") {
              refreshUsage().then((u) => { if (u && u.left_seconds - Math.round((Number(s.elapsedMs) || 0) / 1000) < 60) setCapOpen(true); });
            }
            finishSession(s);
          }
        });
      } catch (e) { /* no events on this build */ }
      // Opened from the calendar: write questions, or record it now.
      const params = new URLSearchParams(window.location.search);
      const apptId = params.get("appointment");
      if (apptId && !cancelled) {
        window.history.replaceState(null, "", window.location.pathname);
        const found = await base44.entities.Appointment.filter({ id: apptId }).catch(() => []);
        const appt = found?.[0];
        if (appt && !cancelled) {
          const existing = (rows || []).find((r) => r.appointment_id === appt.id && !r.parent_record_id);
          if (existing && !recordingNow) { setOpenId(existing.id); setTab("notes"); }
          else if (params.get("record") === "1" && !recordingNow) startRecording({ appt });
          else if (!recordingNow) setPrepAppt(appt);
        }
      }
      await resumeUnfinished();
    })();
    return () => {
      cancelled = true;
      handle?.remove?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    const sync = setInterval(async () => {
      try {
        const st = await recorder()?.status();
        if (st?.recording && st.session) {
          setLive((cur) => cur && {
            ...cur,
            paused: st.session.state === "paused",
            baseMs: st.session.state === "paused" ? Number(st.session.elapsedMs) || 0 : cur.baseMs,
            baseAt: st.session.state === "paused" ? Date.now() : cur.baseAt,
          });
        }
      } catch (e) { /* keep the local clock */ }
    }, 15000);
    return () => { clearInterval(t); clearInterval(sync); };
  }, [!!live]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = live ? live.baseMs + (live.paused ? 0 : Date.now() - live.baseAt) : 0;

  const liveSessionId = live?.sessionId || null;
  useEffect(() => { setChecked(liveSessionId ? readChecked(liveSessionId) : []); }, [liveSessionId]);

  const toggleChecked = (i) => {
    if (!liveSessionId) return;
    setChecked((cur) => {
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
      try { localStorage.setItem(checkedKey(liveSessionId), JSON.stringify(next)); } catch (e) { /* on screen only */ }
      return next;
    });
  };

  // ── Controls ───────────────────────────────────────────────────────────────

  const startRecording = async (link = null) => {
    const R = recorder();
    if (!R || busy) return;
    const name = (link?.moreOf?.title || link?.moreOf?.notes?.title || link?.appt?.title || title).trim();
    const now = await refreshUsage();
    if (!now || now.left_seconds < 60) { setCapOpen(true); return; }
    setBusy(true);
    track('action', 'record notes: start');
    try {
      const res = await R.start({ title: name, maxMinutes: Math.max(1, Math.floor(now.left_seconds / 60)) });
      if (!res?.ok) {
        toast({
          title: res?.error === "mic_permission_denied" ? "GenCare needs the microphone to record" : "Recording didn't start",
          description: res?.error === "mic_permission_denied"
            ? "You can allow it in your phone's settings under Apps → GenCare → Permissions."
            : "Another app may be using the microphone. Try again in a moment.",
        });
        return;
      }
      setLive({ sessionId: res.sessionId, paused: false, baseMs: 0, baseAt: Date.now() });
      if (!res.alreadyRecording) {
        const linkFields = link?.moreOf
          ? { appointment_id: link.moreOf.appointment_id || "", family_member_id: link.moreOf.family_member_id || "", family_member_name: link.moreOf.family_member_name || "", questions: [], parent_record_id: link.moreOf.id }
          : link?.appt
            ? { appointment_id: link.appt.id, family_member_id: link.appt.family_member_id || "", family_member_name: link.appt.family_member_name || "", questions: cleanQuestions(link.appt.prep_questions) }
            : {};
        sessionLinks.set(res.sessionId, linkFields);
        setLiveQuestions(linkFields.questions || []);
        base44.entities.NoteRecording.create(withFamily({
          user_id: me?.id,
          title: name,
          status: "recording",
          device_session_id: res.sessionId,
          started_at: new Date().toISOString(),
          shared_with_family: true,
          ...linkFields,
        })).then(() => loadRecords()).catch(() => {});
      }
      setPrepAppt(null);
      setTitle("");
      if (link?.moreOf) { setOpenId(null); setChangeText(""); setChangeSaid(""); }
    } finally {
      setBusy(false);
    }
  };

  const pauseOrResume = async () => {
    const R = recorder();
    if (!R || !live || busy) return;
    setBusy(true);
    try {
      const res = live.paused ? await R.resume() : await R.pause();
      const s = res?.session;
      if (s) setLive((cur) => cur && { ...cur, paused: s.state === "paused", baseMs: Number(s.elapsedMs) || cur.baseMs, baseAt: Date.now() });
    } finally {
      setBusy(false);
    }
  };

  const stopRecording = async () => {
    const R = recorder();
    if (!R || !live || busy) return;
    setBusy(true);
    try {
      const res = await R.stop();
      setLive(null);
      forgetChecked(live.sessionId);
      if (res?.session) await finishSession(res.session);
    } finally {
      setBusy(false);
    }
  };

  const retryNotes = async (record) => {
    const R = recorder();
    try {
      const { sessions = [] } = R ? await R.listSessions() : { sessions: [] };
      const s = sessions.find((x) => x.id === record.device_session_id);
      if (s) { await processRecording(record, s); return; }
      setProgress({ recordId: record.id, step: "notes", done: 0, total: 0 });
      const made = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_make", record_id: record.id });
      if (!made?.data?.ok) throw new Error("notes failed");
      await loadRecords();
    } catch (e) {
      toast({ title: "Couldn't make the notes just now", description: "Try again in a minute." });
    } finally {
      setProgress(null);
    }
  };

  const deleteRecording = async (record) => {
    setConfirmDelete(null);
    setOpenId(null);
    setRecords((rows) => rows.filter((r) => r.id !== record.id));
    try {
      await base44.entities.NoteRecording.delete(record.id);
      if (record.device_session_id) recorder()?.deleteSession({ sessionId: record.device_session_id }).catch(() => {});
      for (const f of followUpsOf(recordsRef.current, record.id)) {
        await base44.entities.NoteRecording.delete(f.id).catch(() => {});
        if (f.device_session_id) recorder()?.deleteSession({ sessionId: f.device_session_id }).catch(() => {});
      }
      setRecords((rows) => rows.filter((r) => r.parent_record_id !== record.id));
      if (record.appointment_id) base44.entities.Appointment.update(record.appointment_id, { notes_record_id: "" }).catch(() => {});
    } catch (e) {
      setRecords((rows) => (rows.some((r) => r.id === record.id) ? rows : [record, ...rows]));
      toast({ title: "Couldn't delete that recording", description: "It's still here. Try again in a moment." });
    }
  };

  const submitChange = async (record) => {
    const request = changeText.trim();
    if (!request || changing || !record) return;
    setChanging(true);
    setChangeSaid("");
    try {
      const res = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_change", record_id: record.id, request });
      const data = res?.data || res || {};
      if (!data.ok) throw new Error(data.error || "change_failed");
      if (data.changed) {
        setRecords((rows) => rows.map((r) => (r.id === record.id ? { ...r, notes: data.notes, ...(data.title ? { title: data.title } : {}) } : r)));
        setChangeText("");
      }
      setChangeSaid(data.said || (data.changed ? "Updated." : "Nothing changed."));
    } catch (e) {
      toast({ title: "That change didn't go through", description: "Check your connection and try again." });
    } finally {
      setChanging(false);
    }
  };

  const fillNotes = async (record) => {
    if (!record || filling) return;
    setFilling(true);
    setChangeSaid("");
    try {
      const res = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_fill", record_id: record.id });
      const data = res?.data || res || {};
      if (!data.ok) throw new Error(data.error || "fill_failed");
      if (data.added > 0) setRecords((rows) => rows.map((r) => (r.id === record.id ? { ...r, notes: data.notes } : r)));
      setChangeSaid(data.said || "");
    } catch (e) {
      toast({ title: "Couldn't check the notes just now", description: "Check your connection and try again." });
    } finally {
      setFilling(false);
    }
  };

  const askAboutThis = async (record) => {
    const question = askOneText.trim();
    if (question.length < 3 || askOne?.loading || !record) return;
    setAskOne({ question, loading: true, answer: "", quotes: [] });
    try {
      const res = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_ask_one", record_id: record.id, question });
      const data = res?.data || res || {};
      if (!data.ok) throw new Error(data.error || "ask_failed");
      setAskOne({ question, loading: false, answer: data.answer || "", quotes: Array.isArray(data.quotes) ? data.quotes : [] });
    } catch (e) {
      setAskOne({ question, loading: false, answer: "Couldn't get an answer just now. Try again in a moment.", quotes: [] });
    }
  };

  const askNotes = async () => {
    const question = search.trim();
    if (question.length < 3 || asked?.loading) return;
    setAsked({ question, loading: true, answer: "", sources: [] });
    try {
      const res = await base44.functions.invoke("transcribeAudioNew", { mode: "notes_ask", question });
      const data = res?.data || res || {};
      if (!data.ok) throw new Error(data.error || "ask_failed");
      setAsked({ question, loading: false, answer: data.answer || "", sources: Array.isArray(data.sources) ? data.sources : [] });
    } catch (e) {
      setAsked({ question, loading: false, answer: "Couldn't get an answer just now. Try again in a moment.", sources: [] });
    }
  };

  // Questions for an appointment, saved on it as they're typed in.
  const saveQuestions = (appt, next) => {
    const questions = cleanQuestions(next);
    const updated = { ...appt, prep_questions: questions };
    setPrepAppt(updated);
    setUpcoming((rows) => rows.map((a) => (a.id === appt.id ? updated : a)));
    base44.entities.Appointment.update(appt.id, { prep_questions: questions }).catch(() => {
      toast({ title: "That question didn't save", description: "Check your connection and try again." });
    });
  };

  const addQuestion = () => {
    const q = draft.trim();
    if (!q || !prepAppt) return;
    saveQuestions(prepAppt, [...cleanQuestions(prepAppt.prep_questions), q]);
    setDraft("");
  };

  // A to-do from the notes goes onto the family's task list.
  const addTodo = async (record, index) => {
    const notes = record.notes || {};
    const todo = notes.todos?.[index];
    if (!todo || todo.added) return;
    try {
      const created = await base44.entities.CareTask.create(withFamily({
        title: unhi(todo.text),
        family_member_id: record.family_member_id || "",
        family_member_name: record.family_member_name || "",
        category: "Other",
        priority: "medium",
        status: "pending",
        notes: `From the notes: ${record.title || notes.title || "a recording"}`,
      }));
      if (created?.id) base44.functions.invoke("notifyFamily", { kind: "task", action: "added", task_id: created.id }).catch(() => {});
    } catch (e) {
      toast({ title: "Couldn't add that task", description: "Try again in a moment." });
      return;
    }
    const todos = notes.todos.map((t, i) => (i === index ? { ...t, added: true } : t));
    const next = { ...notes, todos };
    setRecords((rows) => rows.map((r) => (r.id === record.id ? { ...r, notes: next } : r)));
    base44.entities.NoteRecording.update(record.id, { notes: next }).catch(() => {});
  };

  const toggleShared = async (record) => {
    const next = !(record.shared_with_family !== false);
    setRecords((rows) => rows.map((r) => (r.id === record.id ? { ...r, shared_with_family: next } : r)));
    try { await base44.entities.NoteRecording.update(record.id, { shared_with_family: next }); }
    catch (e) { toast({ title: "Couldn't change sharing", description: "Try again in a moment." }); }
  };

  // ── Rendering ──────────────────────────────────────────────────────────────

  const card = "rounded-2xl border border-border/50 bg-card p-4";
  const heading = "text-foreground";
  const soft = "text-muted-foreground";
  const inputCls = "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[15px] outline-none";
  const open = records.find((r) => r.id === openId) || null;
  const mine = (r) => !r?.user_id || r.user_id === me?.id;

  const capDialog = (
    <Dialog open={capOpen} onOpenChange={(o) => { if (!o) setCapOpen(false); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
        <div className="space-y-4 pt-2">
          <h2 className="text-xl font-bold">{access?.reason === "subscribed" ? "This month's recording time is used up" : "Your family's free recording time is used up"}</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            {access?.reason === "subscribed"
              ? `Your family's minutes come back on ${nextMonthStart()}.`
              : `The free trial includes ${usage?.limit_seconds ? Math.round(usage.limit_seconds / 60) : 60} minutes of recording a month. GenCare Family gives the whole family far more, and they come back every month.`}
          </p>
          {access?.reason !== "subscribed" && (
            <Link to="/subscribe"><Button className="w-full">See the plan</Button></Link>
          )}
          <Button onClick={() => setCapOpen(false)} variant="ghost" className="w-full">Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const linkTo = async (appt) => {
    if (!open || linking) return;
    setLinking(true);
    setLinkingId(appt ? appt.id : "unlink");
    try {
      const fields = appt
        ? { appointment_id: appt.id, family_member_id: appt.family_member_id || "", family_member_name: appt.family_member_name || "", questions: cleanQuestions(appt.prep_questions), ...(open.title ? {} : { title: appt.title }) }
        : { appointment_id: "", questions: [] };
      await base44.entities.NoteRecording.update(open.id, fields);
      if (appt && open.status === "ready") base44.entities.Appointment.update(appt.id, { notes_record_id: open.id }).catch(() => {});
      if (!appt && open.appointment_id) base44.entities.Appointment.update(open.appointment_id, { notes_record_id: "" }).catch(() => {});
      setRecords((rows) => rows.map((r) => (r.id === open.id ? { ...r, ...fields } : r)));
      setLinkOpen(false);
      toast({ title: appt ? `Linked to "${appt.title}"` : "Unlinked from its event" });
      loadRecords();
    } catch (e) {
      toast({ title: "Couldn't link it", description: "Check your connection and try again." });
    } finally {
      setLinking(false);
      setLinkingId(null);
    }
  };
  const linkDialog = (
    <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
        <div className="space-y-3 pt-2 min-w-0">
          <h2 className="text-xl font-bold">Which event is this recording for?</h2>
          {(() => {
            const at = new Date(open?.started_at || 0).getTime() || Date.now();
            const list = events.slice().sort((a, b) => Math.abs(startOf(a) - at) - Math.abs(startOf(b) - at)).slice(0, 40);
            if (list.length === 0) return <p className="text-sm text-muted-foreground">No events found from the last two months on.</p>;
            return list.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={linking}
                onClick={() => linkTo(a)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${linkingId === a.id ? "border-primary bg-primary/10" : open?.appointment_id === a.id ? "border-primary" : "border-border"} ${linking && linkingId !== a.id ? "opacity-50" : ""}`}
              >
                <div className="font-semibold truncate">{a.family_member_name ? `${a.family_member_name}: ` : ""}{a.title}</div>
                {linkingId === a.id ? (
                  <div className="text-sm flex items-center gap-1.5 text-primary"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Linking…</div>
                ) : (
                  <div className="text-sm text-muted-foreground">{whenText(new Date(startOf(a)).toISOString())}{open?.appointment_id === a.id ? " · linked now" : ""}</div>
                )}
              </button>
            ));
          })()}
          {open?.appointment_id && (
            <Button variant="outline" className="w-full" disabled={linking} onClick={() => linkTo(null)}>
              {linkingId === "unlink" ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Unlinking…</> : "Unlink from its event"}
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => setLinkOpen(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const deleteDialog = (
    <Dialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
        <div className="space-y-4 pt-2">
          <h2 className="text-xl font-bold">Delete this recording?</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">Its notes and transcript will be gone for good, for the whole family. Tasks you already added stay on the list.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Keep it</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteRecording(confirmDelete)}>Delete</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const pagePad = "pb-28 lg:pb-8";

  if (!supported) {
    if (open) {
      return (
        <div className={pagePad}>
          <div className="max-w-2xl mx-auto"><NotesReadOnly open={open} onBack={() => setOpenId(null)} /></div>
        </div>
      );
    }
    return (
      <div className={pagePad}>
        <div className="max-w-2xl mx-auto space-y-4">
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><Mic className="w-7 h-7 text-primary" /> Notes</h1>
          <div className={card}>
            <p className={soft}>Recording works in the GenCare app on your phone. Update it from Google Play if you already have it. Notes the family recorded are listed here.</p>
          </div>
          {loaded && records.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold">Your family's recordings</h2>
              {records.filter((r) => !r.parent_record_id).map((r) => (
                <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className={`${card} w-full text-left`}>
                  <div className="font-semibold truncate">{r.title || r.notes?.title || "Recording"}</div>
                  <div className={`text-sm ${soft}`}>{whenText(r.started_at)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── One recording's notes and transcript ──
  if (open) {
    const notes = open.notes || null;
    const followUps = followUpsOf(records, open.id);
    const mergedFollowUps = followUps.filter((f) => f.status === "merged");
    const parts = withFollowUpText(open, records).transcript_parts.slice().sort((a, b) => a.index - b.index);
    const followUpStarts = new Map(followUps.map((f, i) => [100000 * (i + 1), f]));
    const canRecordMore = !!recorder() && !live && !busy && !progress && open.status === "ready" && mine(open);
    const myTodos = (notes?.todos || []).map((t, i) => ({ ...t, i })).filter((t) => (t.who || "you").toLowerCase() === "you");
    const theirs = (notes?.todos || []).filter((t) => (t.who || "you").toLowerCase() !== "you");
    const working = progress?.recordId === open.id;
    const ev = open.appointment_id ? events.find((a) => a.id === open.appointment_id) : null;

    return (
      <div className={pagePad}>
        {capDialog}
        {deleteDialog}
        {linkDialog}
        <div className="max-w-2xl mx-auto space-y-4">
          <button type="button" onClick={() => { setOpenId(null); setChangeText(""); setChangeSaid(""); }} className={`flex items-center gap-1 text-sm ${soft}`}>
            <ChevronLeft className="w-4 h-4" /> All notes
          </button>
          <div>
            <h1 className="font-heading text-2xl font-bold">{open.title || notes?.title || "Recording"}</h1>
            <p className={`text-sm ${soft}`}>{whenText(open.started_at)}{open.duration_ms ? ` · ${clock(open.duration_ms)}` : ""}{open.family_member_name ? ` · about ${open.family_member_name}` : ""}</p>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <span className={`text-sm ${soft}`}>
                {ev ? `For: ${ev.title} · ${whenText(new Date(startOf(ev)).toISOString())}` : open.appointment_id ? "Linked to an event" : "Not linked to an event"}
              </span>
              {mine(open) && (
                <button type="button" onClick={() => setLinkOpen(true)} className="text-sm font-semibold text-primary">
                  {open.appointment_id ? "Change event" : "Link to an event"}
                </button>
              )}
            </div>
            {mine(open) && (
              <button type="button" onClick={() => toggleShared(open)} className={`mt-2 inline-flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1 ${open.shared_with_family !== false ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                {open.shared_with_family !== false ? <><Users className="w-3 h-3" /> Shared with the family</> : <><Lock className="w-3 h-3" /> Only you</>}
              </button>
            )}
            {mergedFollowUps.length > 0 && (
              <p className={`mt-1 text-sm ${soft}`}>{mergedFollowUps.length === 1 ? "1 recording added" : `${mergedFollowUps.length} recordings added`} after the first.</p>
            )}
            {followUps.filter((f) => f.status !== "merged").map((f) => (
              <div key={f.id} className={`mt-2 flex items-center justify-between gap-2 text-sm ${soft}`}>
                <span>Added {whenText(f.started_at)}: {progress?.recordId === f.id ? "Working on it…" : (STATUS_TEXT[f.status] || "Not finished")}</span>
                {!progress && !live && f.status !== "recording" && mine(f) && (
                  <Button onClick={() => retryNotes(f)} variant="outline" size="sm" className="shrink-0 rounded-lg"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Finish</Button>
                )}
              </div>
            ))}
            {canRecordMore && (
              <Button onClick={() => startRecording({ moreOf: open })} variant="outline" className="mt-3 h-11 rounded-xl"><Mic className="w-4 h-4 mr-2" /> Record more</Button>
            )}
          </div>

          <div className="flex rounded-xl p-1 bg-muted">
            {["notes", "transcript"].map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === t ? "bg-card text-foreground shadow-sm" : soft}`}>
                {t === "notes" ? "Notes" : "Full transcript"}
              </button>
            ))}
          </div>

          {(notes || (open.transcript_parts || []).length > 0) && !working && (
            <div className={`${card} space-y-2`}>
              <div className="flex gap-2">
                <input value={askOneText} onChange={(e) => setAskOneText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") askAboutThis(open); }} placeholder="Ask this recording" disabled={!!askOne?.loading} className={inputCls} />
                <Button onClick={() => askAboutThis(open)} disabled={!!askOne?.loading || askOneText.trim().length < 3} className="shrink-0">
                  {askOne?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
                </Button>
              </div>
              {!askOne && <p className={`text-xs ${soft}`}>Like “what did they say about next steps?” — the answer comes with their exact words.</p>}
              {askOne && !askOne.loading && (
                <div className="space-y-2 pt-1">
                  <p className={heading}>{askOne.answer}</p>
                  {askOne.quotes.length > 0 && (
                    <ul className="space-y-2">
                      {askOne.quotes.map((q, i) => (
                        <li key={i} className="border-l-2 border-border pl-3">
                          <p className={`italic ${heading}`}>“{q.text}”</p>
                          {q.at && <button type="button" onClick={() => setTab("transcript")} className={`text-xs ${soft} underline underline-offset-2`}>at {q.at} in the transcript</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {working && (
            <div className={`${card} flex items-center gap-2`}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className={soft}>{progress.step === "notes" ? "Writing your notes…" : `Turning it into text: ${progress.done} of ${progress.total}`}</span>
            </div>
          )}

          {open.status === "over_limit" && (
            <div className={card}>
              <p className={soft}>This recording went past your family's recording time, so the notes only cover the first part. The rest is saved on the phone and can be finished once the minutes come back on {nextMonthStart()}{access?.reason !== "subscribed" ? ", or sooner with GenCare Family." : "."}</p>
              {access?.reason !== "subscribed" && <Link to="/subscribe"><Button variant="outline" className="w-full mt-3">See the plan</Button></Link>}
            </div>
          )}

          {tab === "notes" && !notes && !working && (
            <div className={card}>
              <p className={`mb-3 ${soft}`}>These notes haven't been made yet.</p>
              {mine(open) && <Button onClick={() => retryNotes(open)} className="w-full"><RotateCcw className="w-4 h-4 mr-2" /> Make my notes</Button>}
            </div>
          )}

          {tab === "notes" && notes && (
            <div className="space-y-4">
              {mine(open) && (
                <div className={`${card} space-y-2`}>
                  <div className="flex gap-2">
                    <input value={changeText} onChange={(e) => setChangeText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitChange(open); }} placeholder="Change your notes" disabled={changing} className={inputCls} />
                    <Button onClick={() => submitChange(open)} disabled={changing || !changeText.trim()} className="shrink-0">
                      {changing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update"}
                    </Button>
                  </div>
                  {!changeSaid && <p className={`text-xs ${soft}`}>Like “add that the copay is $40” or “take out the line about parking”.</p>}
                  {changeSaid && <p className={`text-sm ${soft}`}>{changeSaid}</p>}
                  <button type="button" onClick={() => fillNotes(open)} disabled={filling || changing} className={`text-sm underline underline-offset-2 ${soft}`}>
                    {filling ? "Reading the transcript again…" : "Check the transcript for anything these notes missed"}
                  </button>
                </div>
              )}
              <Button variant="outline" onClick={() => downloadNotesPdf(open, whenText(open.started_at)).catch(() => {})} className="w-full rounded-xl"><FileDown className="w-4 h-4 mr-2" /> Download PDF</Button>
              {notes.gist?.length > 0 && (
                <div className={card}>
                  <h2 className="text-lg font-bold mb-2">The gist</h2>
                  <ul className="space-y-1.5">{notes.gist.map((g, i) => <li key={i}>• {hi(g)}</li>)}</ul>
                </div>
              )}
              {notes.asked?.length > 0 && (
                <div className={card}>
                  <h2 className="text-lg font-bold mb-2">Things to bring up</h2>
                  <ul className="space-y-3">
                    {notes.asked.map((a, i) => (
                      <li key={i}>
                        <div className="font-semibold">{a.question}</div>
                        <div className={a.answered ? heading : soft}>{a.answered ? hi(a.answer) : "No clear answer in the recording"}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {myTodos.length > 0 && (
                <div className={card}>
                  <h2 className="text-lg font-bold mb-2">To-dos</h2>
                  <ul className="space-y-2">
                    {myTodos.map((t) => (
                      <li key={t.i} className="flex items-start gap-2">
                        <div className="flex-1"><span>{hi(t.text)}</span></div>
                        <Button size="sm" variant={t.added ? "outline" : "default"} disabled={t.added} onClick={() => addTodo(open, t.i)} className="shrink-0">
                          {t.added ? <><Check className="w-4 h-4 mr-1" />Added</> : <><Plus className="w-4 h-4 mr-1" />Add to tasks</>}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {theirs.length > 0 && (
                <div className={card}>
                  <h2 className="text-lg font-bold mb-2">What others will do</h2>
                  <ul className="space-y-1.5">{theirs.map((t, i) => <li key={i}><span className="font-semibold">{t.who}:</span> {hi(t.text)}</li>)}</ul>
                </div>
              )}
              {notes.details?.length > 0 && (
                <div className={card}>
                  <h2 className="text-lg font-bold mb-2">Details to keep</h2>
                  <ul className="space-y-1.5">{notes.details.map((d, i) => <li key={i}>{d.label ? <span className="font-semibold">{d.label}: </span> : null}{hi(d.value)}</li>)}</ul>
                </div>
              )}
              {(notes.sections || []).map((s, i) => (
                <div key={i} className={card}>
                  <h2 className="text-lg font-bold mb-2">{s.heading}</h2>
                  <ul className="space-y-1.5">{s.points.map((p, j) => <li key={j}>• {hi(p)}</li>)}</ul>
                </div>
              ))}
              {notes.decisions?.length > 0 && (
                <div className={card}>
                  <h2 className="text-lg font-bold mb-2">Decided</h2>
                  <ul className="space-y-1.5">{notes.decisions.map((d, i) => <li key={i}>• {hi(d.text)}</li>)}</ul>
                </div>
              )}
              {notes.questions?.length > 0 && (
                <div className={card}>
                  <h2 className="text-lg font-bold mb-2">Still open</h2>
                  <ul className="space-y-1.5">{notes.questions.map((d, i) => <li key={i}>• {hi(d.text)}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {tab === "transcript" && (
            <div className="space-y-4">
              {parts.length === 0 && <div className={card}><p className={soft}>No transcript yet.</p></div>}
              {parts.map((p) => (
                <div key={p.index} id={`notes-part-${p.index}`} className={card}>
                  {followUpStarts.has(p.index) && <p className="text-xs font-bold mb-2 text-primary">Added {whenText(followUpStarts.get(p.index).started_at)}</p>}
                  {parts.length > 1 && <p className={`text-xs font-semibold mb-2 ${soft}`}>{clock(p.index % 100000 === 0 ? 0 : p.start_ms)}</p>}
                  {paragraphs(p.text).map((para, i) => <p key={i} className="mb-3 leading-relaxed">{para}</p>)}
                  {!String(p.text || "").trim() && <p className={soft}>No speech picked up in this stretch.</p>}
                </div>
              ))}
            </div>
          )}

          {mine(open) && (
            <Button variant="outline" onClick={() => setConfirmDelete(open)} className="w-full text-red-600 border-red-300"><Trash2 className="w-4 h-4 mr-2" /> Delete recording</Button>
          )}
        </div>
      </div>
    );
  }

  // ── Recording in progress ──
  if (live) {
    return (
      <div className={pagePad}>
        {capDialog}
        <div className="max-w-2xl mx-auto space-y-6 text-center pt-6">
          <div className="flex items-center justify-center gap-2">
            <span className={`w-3 h-3 rounded-full ${live.paused ? "bg-gray-400" : "bg-red-500 animate-pulse"}`} />
            <span className="font-semibold">{live.paused ? "Paused" : "Recording"}</span>
          </div>
          <div className="text-6xl font-bold tabular-nums">{clock(elapsed)}</div>
          <p className={`text-sm ${soft}`}>You can lock your phone or use other apps. GenCare keeps recording until you tap Stop.</p>
          <div className="flex gap-3">
            <Button onClick={pauseOrResume} disabled={busy} variant="outline" className="flex-1 h-14 rounded-2xl text-base">
              {live.paused ? <><Play className="w-5 h-5 mr-2" />Resume</> : <><Pause className="w-5 h-5 mr-2" />Pause</>}
            </Button>
            <Button onClick={stopRecording} disabled={busy} className="flex-1 h-14 rounded-2xl text-base bg-red-600 hover:bg-red-700 text-white">
              <Square className="w-5 h-5 mr-2" />Stop
            </Button>
          </div>
          <p className={`text-xs ${soft}`}>{usageLine(usage)}</p>
          <ConsentNote center />
          {liveQuestions.length > 0 && (
            <div className={`${card} text-left`}>
              <h2 className="text-lg font-bold">Things to bring up</h2>
              <p className={`text-xs mb-2 ${soft}`}>Tap one to check it off, if you like.</p>
              <ul className="space-y-1">
                {liveQuestions.map((q, i) => {
                  const done = checked.includes(i);
                  return (
                    <li key={i}>
                      <button type="button" onClick={() => toggleChecked(i)} aria-pressed={done} className="w-full flex items-start gap-2 py-1.5 text-left">
                        <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${done ? "bg-green-600 border-green-600" : "border-border"}`}>
                          {done && <Check className="w-3.5 h-3.5 text-white" />}
                        </span>
                        <span className={done ? `line-through ${soft}` : heading}>{q}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Questions for an appointment ──
  if (prepAppt) {
    const qs = cleanQuestions(prepAppt.prep_questions);
    const s = startOf(prepAppt);
    return (
      <div className={pagePad}>
        {capDialog}
        <div className="max-w-2xl mx-auto space-y-4">
          <button type="button" onClick={() => { setPrepAppt(null); setDraft(""); }} className={`flex items-center gap-1 text-sm ${soft}`}><ChevronLeft className="w-4 h-4" /> All notes</button>
          <div>
            <h1 className="font-heading text-2xl font-bold">{prepAppt.family_member_name ? `${prepAppt.family_member_name}: ` : ""}{prepAppt.title}</h1>
            {s !== null && <p className={`text-sm ${soft}`}>{whenText(new Date(s).toISOString())} · Not recorded yet</p>}
          </div>
          <div className={`${card} space-y-3`}>
            <h2 className="text-lg font-bold">Things to bring up</h2>
            <p className={`text-sm ${soft}`}>Questions you don't want to forget. They stay on screen while you record, and your notes say which got answered. Anyone in the family can add one.</p>
            <PrepPointsList points={qs} onChange={(next) => saveQuestions(prepAppt, next)} />
            <form onSubmit={(e) => { e.preventDefault(); addQuestion(); }} className="flex gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A question to bring up" className="flex-1 min-w-0 h-12 rounded-xl border border-border bg-background px-3 text-[15px] outline-none" />
              <Button type="submit" disabled={!draft.trim()} className="h-12 px-4 rounded-xl shrink-0"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </form>
          </div>
          <Button onClick={() => startRecording({ appt: prepAppt })} disabled={busy || !!progress} className="w-full h-14 rounded-2xl text-base bg-red-600 hover:bg-red-700 text-white">
            {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Mic className="w-5 h-5 mr-2" />} Start recording
          </Button>
          <p className={`text-xs ${soft}`}>{usageLine(usage)} Afterward, this page has your notes and the full transcript.</p>
          <ConsentNote />
        </div>
      </div>
    );
  }

  // ── Start screen: a card per appointment ──
  const recordedApptIds = new Set(records.map((r) => r.appointment_id).filter(Boolean));
  const upcomingCards = upcoming.filter((a) => !recordedApptIds.has(a.id));
  return (
    <div className={pagePad}>
      {capDialog}
      {deleteDialog}
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><Mic className="w-7 h-7 text-primary" /> Record Notes</h1>
          <p className={soft}>Record an appointment, meeting or class. GenCare writes short, clear notes the whole family can read: to-dos first, then the details you'll need.</p>
        </div>

        <div className={`${card} space-y-3`}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it? (optional)" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[15px] outline-none" />
          <Button onClick={() => startRecording()} disabled={busy || !!progress} className="w-full h-14 rounded-2xl text-base bg-red-600 hover:bg-red-700 text-white">
            {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Mic className="w-5 h-5 mr-2" />} Record
          </Button>
          <p className={`text-xs ${soft}`}>{usageLine(usage)}</p>
          <ConsentNote />
        </div>

        {upcomingCards.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-lg font-bold">Coming up</h2>
            {upcomingCards.map((a) => {
              const n = cleanQuestions(a.prep_questions).length;
              return (
                <button key={a.id} type="button" onClick={() => setPrepAppt(a)} className="w-full min-w-0 text-left rounded-2xl border-2 border-dashed border-border bg-card/60 p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{a.family_member_name ? `${a.family_member_name}: ` : ""}{a.title}</div>
                    <div className={`text-sm ${soft}`}>{whenText(new Date(startOf(a)).toISOString())} · Not recorded yet{n ? ` · ${n} thing${n === 1 ? "" : "s"} to bring up` : ""}</div>
                  </div>
                  <span className={`text-sm flex items-center shrink-0 ${soft}`}>Details<ChevronRight className="w-4 h-4" /></span>
                </button>
              );
            })}
          </div>
        )}

        {progress && !open && (
          <div className={`${card} flex items-center gap-2`}>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className={soft}>{progress.step === "notes" ? "Writing your notes…" : `Turning your recording into text: ${progress.done} of ${progress.total}`}</span>
          </div>
        )}

        {loaded && records.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-lg font-bold">Your family's recordings</h2>
            <div className="flex gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") askNotes(); }} placeholder="Search or ask the notes" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[15px] outline-none" />
              {search.trim().length >= 3 && (
                <Button onClick={askNotes} disabled={!!asked?.loading} className="shrink-0 h-auto rounded-xl">{asked?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}</Button>
              )}
            </div>
            {asked && asked.question === search.trim() && (
              <div className={`${card} space-y-2`}>
                {asked.loading ? (
                  <div className={`flex items-center gap-2 ${soft}`}><Loader2 className="w-4 h-4 animate-spin" />Looking through the recordings…</div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap">{asked.answer}</p>
                    {asked.sources.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {asked.sources.map((src) => (
                          <button key={src.id} type="button" onClick={() => { setOpenId(src.id); setTab("notes"); setChangeText(""); setChangeSaid(""); setAskOne(null); setAskOneText(""); }} className="text-sm font-semibold text-primary">
                            From: {src.title} · {whenText(src.started_at)} ›
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {(() => {
              const hits = records.filter((r) => !r.parent_record_id).map((r) => ({ r, m: searchMatch(withFollowUpText(r, records), search) })).filter((h) => h.m.ok);
              if (search.trim().length >= 2 && hits.length === 0) {
                if (asked && asked.question === search.trim()) return null;
                return <p className={`text-sm ${soft}`}>Nothing in the notes or transcripts has "{search.trim()}". Tap Ask to ask it as a question.</p>;
              }
              return hits.map(({ r, m }) => {
                const ev = r.appointment_id ? events.find((a) => a.id === r.appointment_id) : null;
                const evLabel = ev && ev.title !== (r.title || r.notes?.title) ? ` · ${ev.title}` : "";
                return (
                  <button key={r.id} type="button" onClick={() => { setOpenId(r.id); setTab("notes"); setChangeText(""); setChangeSaid(""); setAskOne(null); setAskOneText(""); }} className={`${card} w-full text-left flex items-center gap-3`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{r.family_member_name ? `${r.family_member_name}: ` : ""}{r.title || r.notes?.title || "Recording"}</div>
                      <div className={`text-sm ${soft}`}>
                        {whenText(r.started_at)}{r.duration_ms ? ` · ${clock(r.duration_ms)}` : ""}{evLabel}
                        {STATUS_TEXT[r.status] ? ` · ${progress?.recordId === r.id ? "Working on it…" : STATUS_TEXT[r.status]}` : ""}
                        {r.shared_with_family === false ? " · only you" : ""}
                      </div>
                      {m.snippet && <div className={`text-xs mt-1 ${soft}`}><span className="font-semibold">{m.snippet.where}:</span> {m.snippet.text}</div>}
                    </div>
                    <span className={`text-sm flex items-center shrink-0 ${soft}`}>Details<ChevronRight className="w-4 h-4" /></span>
                  </button>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// On the website (no recorder): a family member reads the notes.
function NotesReadOnly({ open, onBack }) {
  const notes = open.notes || null;
  const card = "rounded-2xl border border-border/50 bg-card p-4";
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="w-4 h-4" /> All notes</button>
      <h2 className="font-heading text-2xl font-bold">{open.title || notes?.title || "Recording"}</h2>
      {!notes && <p className="text-muted-foreground">These notes haven't been made yet.</p>}
      {notes?.gist?.length > 0 && <div className={card}><h3 className="text-lg font-bold mb-2">The gist</h3><ul className="space-y-1.5">{notes.gist.map((g, i) => <li key={i}>• {hi(g)}</li>)}</ul></div>}
      {notes?.todos?.length > 0 && <div className={card}><h3 className="text-lg font-bold mb-2">To-dos</h3><ul className="space-y-1.5">{notes.todos.map((t, i) => <li key={i}>• {t.who && t.who !== "you" ? <span className="font-semibold">{t.who}: </span> : null}{hi(t.text)}</li>)}</ul></div>}
      {notes?.details?.length > 0 && <div className={card}><h3 className="text-lg font-bold mb-2">Details to keep</h3><ul className="space-y-1.5">{notes.details.map((d, i) => <li key={i}>{d.label ? <span className="font-semibold">{d.label}: </span> : null}{hi(d.value)}</li>)}</ul></div>}
      {(notes?.sections || []).map((s, i) => <div key={i} className={card}><h3 className="text-lg font-bold mb-2">{s.heading}</h3><ul className="space-y-1.5">{s.points.map((p, j) => <li key={j}>• {hi(p)}</li>)}</ul></div>)}
      {notes?.decisions?.length > 0 && <div className={card}><h3 className="text-lg font-bold mb-2">Decided</h3><ul className="space-y-1.5">{notes.decisions.map((d, i) => <li key={i}>• {hi(d.text)}</li>)}</ul></div>}
      {notes?.questions?.length > 0 && <div className={card}><h3 className="text-lg font-bold mb-2">Still open</h3><ul className="space-y-1.5">{notes.questions.map((d, i) => <li key={i}>• {hi(d.text)}</li>)}</ul></div>}
    </div>
  );
}
