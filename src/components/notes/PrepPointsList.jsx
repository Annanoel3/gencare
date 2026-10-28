import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

// Points to bring up at an appointment. Each one can be edited in place; it
// saves when the person leaves the box (an emptied box removes the point).
export default function PrepPointsList({ points, onChange }) {
  const [drafts, setDrafts] = useState(points);
  useEffect(() => setDrafts(points), [points]);

  const commit = (i) => {
    const v = (drafts[i] || "").trim();
    if (v === points[i]) return;
    onChange(v ? points.map((p, j) => (j === i ? v : p)) : points.filter((_, j) => j !== i));
  };

  if (!points.length) return null;
  return (
    <ul className="space-y-2">
      {points.map((_, i) => (
        <li key={i} className="flex items-center gap-2">
          <input
            value={drafts[i] ?? ""}
            onChange={(e) => setDrafts((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
            onBlur={() => commit(i)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="flex-1 min-w-0 h-10 rounded-lg border border-border bg-background px-3 text-[15px] outline-none"
          />
          <button type="button" aria-label="Remove this point" onClick={() => onChange(points.filter((_, j) => j !== i))} className="text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
