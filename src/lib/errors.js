// Error messages in plain words (Anna, Nov 14 2026, from the audit for older
// family members: "Couldn't save" came with whatever the server said, like
// "Request failed with status code 500"). A message GenCare's own server
// wrote for people still shows; anything technical becomes the line below.

const TECHNICAL = /status code|network ?error|failed to fetch|fetch failed|load failed|timeout|timed out|axios|json|unexpected token|undefined|\bnull\b|typeerror|referenceerror|syntaxerror|cannot read|is not a function|econn|err_|\b[45]\d\d\b|internal server|bad gateway|service unavailable|<html|stack|exception/i;

export const TRY_AGAIN = 'Check your connection and try again.';

export function plainError(e, fallback = TRY_AGAIN) {
  const m = String(e?.message || (typeof e === 'string' ? e : '') || '').trim();
  if (!m || m.length > 160 || TECHNICAL.test(m)) return fallback;
  return m;
}
