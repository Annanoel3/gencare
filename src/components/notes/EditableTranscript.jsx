import React, { useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GrowingInput } from '@/components/ui/growing-input';
import { sentencesOf } from '@/lib/recordings';

// One stretch of a recording's transcript, where the person who recorded it
// can tap a word to fix it or take it out (Anna, Nov 24 2026: "Let users fix
// transcripts pieces. They can click a word and replace it or delete."). The
// box can take in the word before or after too, for a name heard as two
// words. onSave(newText, fix) saves it; fix is what goes to the notes:
// { was, now, before, after } (the sentence before and after the fix).

const LEAD = /^[(["'“‘]+/;
const TRAIL = /[.,!?;:)\]"'”’…]+$/;

/** Every word with where it is in the text, and its core without punctuation around it. */
export function wordsOf(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) {
    const w = m[0];
    const lead = (w.match(LEAD) || [''])[0].length;
    const trail = (w.match(TRAIL) || [''])[0].length;
    const start = m.index;
    const end = start + w.length;
    const ok = lead + trail < w.length;
    out.push({ start, end, cs: ok ? start + lead : start, ce: ok ? end - trail : end });
  }
  return out;
}

/** The words around a spot in the text (about a sentence either side), for the notes. */
function around(text, from, to) {
  const t = String(text);
  let a = Math.max(0, from - 140);
  let b = Math.min(t.length, to + 140);
  if (a > 0) { const sp = t.indexOf(' ', a); a = sp >= 0 && sp < from ? sp + 1 : a; }
  if (b < t.length) { const sp = t.lastIndexOf(' ', b); b = sp > to ? sp : b; }
  return `${a > 0 ? '…' : ''}${t.slice(a, b).trim()}${b < t.length ? '…' : ''}`;
}
const upFirst = (s) => s.replace(/^(["'“‘(]*)(\p{Ll})/u, (_, q, c) => q + c.toUpperCase());

/** The text with words i..j changed to `now` (or taken out when now is empty). */
export function fixText(text, words, i, j, now) {
  const a = words[i];
  const b = words[j];
  const put = String(now || '').replace(/\s+/g, ' ').trim();
  if (put) return text.slice(0, a.cs) + put + text.slice(b.ce);
  // Taken out: the words go with the punctuation around them, but a sentence
  // still ends where it did.
  const tail = text.slice(b.ce, b.end);
  const ender = /[.!?]/.test(tail) ? tail.replace(/[^.!?"'”’)\]]/g, '') : '';
  let before = text.slice(0, a.start).replace(/\s+$/, '');
  const after = text.slice(b.end).replace(/^\s+/, '');
  if (ender && !/[.!?]["'”’)\]]*$/.test(before)) before = before.replace(/[,;:]+$/, '') + ender;
  // What starts a sentence still starts with a capital ("Um, the doctor" → "The doctor").
  if (!before) return upFirst(after.replace(/^[,;:]\s*/, ''));
  if (!after) return before;
  if (/[.!?]["'”’)\]]*$/.test(before)) return `${before} ${upFirst(after.replace(/^[,;:]\s*/, ''))}`;
  return `${before} ${after.replace(/^[,;:]\s*/, /[.!?,;:]["'”’)\]]*$/.test(before) ? '' : '$&')}`;
}

export default function EditableTranscript({ text, onSave }) {
  const words = useMemo(() => wordsOf(String(text || '')), [text]);
  // Four sentences to a paragraph, as everywhere else the transcript shows.
  const paras = useMemo(() => {
    const t = String(text || '');
    const sents = sentencesOf(t);
    const out = [];
    // Back to back from the start to the end, so no word is left out.
    for (let k = 0; k < sents.length; k += 4) out.push(k === 0 ? 0 : sents[k].index);
    return (out.length ? out : [0]).map((from, k, all) => [from, k + 1 < all.length ? all[k + 1] : t.length + 1]);
  }, [text]);
  const [sel, setSel] = useState(null); // { i, j }
  const [now, setNow] = useState('');
  const [saving, setSaving] = useState('');

  const t = String(text || '');
  const picked = sel ? t.slice(words[sel.i].cs, words[sel.j].ce) : '';
  const pick = (i) => { setSel({ i, j: i }); setNow(t.slice(words[i].cs, words[i].ce)); };
  const grow = (side) => {
    if (!sel) return;
    const next = side === 'before' ? { i: Math.max(0, sel.i - 1), j: sel.j } : { i: sel.i, j: Math.min(words.length - 1, sel.j + 1) };
    setSel(next);
    setNow(t.slice(words[next.i].cs, words[next.j].ce));
  };
  const close = () => { if (!saving) setSel(null); };

  const save = async (remove) => {
    if (!sel || saving) return;
    const put = remove ? '' : now.replace(/\s+/g, ' ').trim();
    if (!remove && (!put || put === picked)) { setSel(null); return; }
    const next = fixText(t, words, sel.i, sel.j, put);
    const at = words[sel.i].cs;
    const end = words[sel.j].ce;
    const fix = { was: picked, now: put, before: around(t, at, end), after: around(next, at, at + put.length) };
    setSaving(remove ? 'remove' : 'save');
    try { await onSave(next, fix); setSel(null); } finally { setSaving(''); }
  };

  // A few words either side, so they can see where they are.
  const context = sel ? (() => {
    const from = Math.max(0, sel.i - 8);
    const to = Math.min(words.length - 1, sel.j + 8);
    return (
      <p className="leading-relaxed rounded-xl bg-muted/60 p-3">
        {from > 0 && '… '}
        {t.slice(words[from].start, words[sel.i].cs)}
        <mark className="bg-amber-200 dark:bg-amber-500/40 text-foreground rounded px-0.5">{picked}</mark>
        {t.slice(words[sel.j].ce, words[to].end)}
        {to < words.length - 1 && ' …'}
      </p>
    );
  })() : null;

  return (
    <>
      {paras.map(([from, to], k) => (
        <p key={k} className="mb-3 leading-relaxed">
          {words.map((w, i) => {
            if (w.start < from || w.start >= to) return null;
            const on = sel && i >= sel.i && i <= sel.j;
            return (
              <React.Fragment key={i}>
                {w.start > from && ' '}
                <span
                  role="button"
                  tabIndex={0}
                  data-guide={i === 0 && k === 0 ? 'transcript-word' : undefined}
                  onClick={() => pick(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter') pick(i); }}
                  className={`cursor-pointer rounded-sm hover:bg-primary/10 ${on ? 'bg-amber-200 dark:bg-amber-500/40' : ''}`}
                >
                  {t.slice(w.start, w.end)}
                </span>
              </React.Fragment>
            );
          })}
        </p>
      ))}

      <Dialog open={!!sel} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Fix the transcript</DialogTitle></DialogHeader>
          {sel && (
            <div className="space-y-3">
              {context}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="flex-1 min-w-[9rem] h-10" disabled={sel.i === 0 || !!saving} onClick={() => grow('before')}>+ Word before</Button>
                <Button type="button" variant="outline" className="flex-1 min-w-[9rem] h-10" disabled={sel.j === words.length - 1 || !!saving} onClick={() => grow('after')}>Word after +</Button>
              </div>
              <label className="block text-sm font-medium" htmlFor="fix-words">What was really said</label>
              <GrowingInput id="fix-words" value={now} onChange={(e) => setNow(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(false); } }}
                enterKeyHint="done" className="min-h-11 py-2.5 rounded-xl text-base" />
              <Button type="button" className="w-full h-12 text-base" disabled={!!saving || !now.trim() || now.replace(/\s+/g, ' ').trim() === picked} onClick={() => save(false)}>
                {saving === 'save' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
              </Button>
              <Button type="button" variant="outline" className="w-full h-12 text-base text-red-600 border-red-300" disabled={!!saving} onClick={() => save(true)}>
                {saving === 'remove' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Take {sel.j > sel.i ? 'these words' : 'this word'} out
              </Button>
              <p className="text-xs text-muted-foreground">The notes change to match, just where these words were.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
