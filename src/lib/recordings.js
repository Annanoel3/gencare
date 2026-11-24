import { base44 } from "@/api/base44Client";

// The family's recordings (NoteRecording): what Record Notes, the Recordings
// page, Home and each person's profile all show the same way.
//
// A recording can have "Record more" recordings under it (parent_record_id);
// those are part of it, not rows of their own.

export function clock(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h > 0 ? `${h}:` : ""}${h > 0 ? String(m).padStart(2, "0") : m}:${String(s).padStart(2, "0")}`;
}

// ==double equals== marks a highlight in the notes; this drops the marks.
export function unhi(text) {
  return String(text || "").replace(/==([^=]{1,80}?)==/g, "$1");
}

export function whenText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export const STATUS_TEXT = {
  recording: "Recording",
  transcribing: "Making your notes…",
  notes_failed: "Notes not made yet",
  over_limit: "Stopped at this month's minutes",
  ready: "",
  merged: "",
};

export const followUpsOf = (rows, id) => (rows || [])
  .filter((r) => r && r.parent_record_id === id)
  .sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0));

export const withFollowUpText = (r, rows) => {
  const more = followUpsOf(rows, r?.id);
  if (!more.length) return r;
  const parts = [...(Array.isArray(r.transcript_parts) ? r.transcript_parts : [])];
  let offset = 100000;
  for (const f of more) {
    for (const p of (f.transcript_parts || [])) parts.push({ ...p, index: offset + (p.index || 0) });
    offset += 100000;
  }
  return { ...r, transcript_parts: parts };
};

/** The recordings to list: not the "Record more" ones, newest first. */
export const topLevel = (rows) => (rows || [])
  .filter((r) => r && !r.parent_record_id)
  .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));

/** What a recording is called. */
export const titleOf = (r) => r?.title || r?.notes?.title || "Recording";

// A list in the notes (one string, from older notes, counts as a list of one).
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** The first line of its notes, to show under the title. */
export function firstLine(r) {
  const n = r?.notes || {};
  const line = list(n.gist)[0] || list(n.todos)[0]?.text || "";
  return unhi(typeof line === "string" ? line : "").trim();
}

function searchLines(r) {
  const n = r?.notes || {};
  const out = [];
  const add = (where, text) => { const s = String(text || "").trim(); if (s) out.push({ where, text: s }); };
  add("title", r?.title || n.title);
  add("about", r?.family_member_name);
  list(n.gist).forEach((g) => add("gist", g));
  list(n.todos).forEach((t) => add("to-do", t?.text));
  list(n.details).forEach((d) => add("details", typeof d === "string" ? d : [d?.label, d?.value].filter(Boolean).join(": ")));
  list(n.sections).forEach((s) => { add("topic", s?.heading); list(s?.points).forEach((p) => add(s?.heading || "topic", p)); });
  list(n.decisions).forEach((d) => add("decided", d?.text));
  list(n.questions).forEach((q) => add("open question", q?.text));
  list(r?.transcript_parts).slice().sort((a, b) => (a?.index || 0) - (b?.index || 0)).forEach((p) => add("transcript", p?.text));
  return out;
}

/** Whether every word searched for is in the recording, and where the first one is. */
export function searchMatch(r, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return { ok: true, snippet: null };
  const lines = searchLines(r);
  const all = lines.map((l) => l.text.toLowerCase()).join("\n");
  if (!words.every((w) => all.includes(w))) return { ok: false, snippet: null };
  const first = lines.find((l) => l.text.toLowerCase().includes(words[0]));
  if (!first) return { ok: true, snippet: null };
  const t = unhi(first.text);
  const i = t.toLowerCase().indexOf(words[0]);
  const from = Math.max(0, i - 50);
  const to = Math.min(t.length, i + words[0].length + 70);
  return { ok: true, snippet: { where: first.where, text: `${from > 0 ? "…" : ""}${t.slice(from, to)}${to < t.length ? "…" : ""}` } };
}

/** The family's recordings that this person can see (RLS decides), newest first. */
export const listRecordings = async () => (await base44.entities.NoteRecording.filter({}, "-started_at", 200)) || [];

export const RECORDINGS_KEY = ["noteRecordings", "all"];
