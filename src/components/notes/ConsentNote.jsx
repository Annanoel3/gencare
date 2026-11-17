import React, { useState } from "react";
import { Info } from "lucide-react";

// The recording-consent line under every Record button (Record Notes, and the
// Record card on Home, which can start a recording without opening that page).
const CONSENT_STATES = "California, Delaware, Florida, Illinois, Maryland, Massachusetts, Montana, Nevada, New Hampshire, Oregon, Pennsylvania and Washington";

export default function ConsentNote({ center = false }) {
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
