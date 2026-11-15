import React, { useEffect, useRef } from 'react';

/**
 * What a form still needs before Add/Save works, in words, under the buttons
 * (Anna, Nov 14 2026: the button used to sit grey and never say why). It
 * scrolls itself into view, so it's seen even at the bottom of a long form.
 */
export default function MissingNote({ text, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (text) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [text]);
  if (!text) return null;
  return <p ref={ref} className={`text-sm text-destructive text-right ${className}`} role="alert">{text}</p>;
}
