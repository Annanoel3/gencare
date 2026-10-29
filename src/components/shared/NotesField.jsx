import React, { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import LinkText from '@/components/shared/LinkText';

/**
 * Notes that read as text, with links you can tap, and a pencil to edit
 * (Anna, Oct 29 2026: "Instead of it always being a text box"). Empty notes
 * start as the box so adding some is one tap. `resetKey` puts it back to
 * reading when the dialog moves to another item.
 */
export default function NotesField({ value, onChange, placeholder, label = 'Notes', resetKey, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const box = useRef(null);
  const text = String(value || '');
  const has = text.trim().length > 0;

  useEffect(() => { setEditing(false); }, [resetKey]);

  const edit = () => {
    setEditing(true);
    // After the box shows: focus it with the cursor at the end.
    setTimeout(() => { const el = box.current; if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch (_e) { /* */ } } }, 0);
  };

  const reading = readOnly || (has && !editing);
  const rows = Math.min(8, Math.max(2, text.split('\n').length + Math.floor(text.length / 60)));

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {reading && has && !readOnly && (
          <button type="button" onClick={edit} className="p-1 -mr-1 text-muted-foreground hover:text-foreground" aria-label={`Edit ${label.toLowerCase()}`}>
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
      {reading ? (
        has ? (
          <div className="mt-1 rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5 text-sm">
            <LinkText text={text} />
          </div>
        ) : <p className="mt-1 text-sm text-muted-foreground">None</p>
      ) : (
        <Textarea ref={box} value={text} onChange={(e) => { setEditing(true); onChange(e.target.value); }}
          className="mt-1" rows={rows} placeholder={placeholder} />
      )}
    </div>
  );
}
