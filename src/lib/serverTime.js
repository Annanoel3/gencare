import { parseISO, isValid, format } from 'date-fns';

// Base44 saves created_date / updated_date in UTC but without the "Z" that
// says so ("2026-10-29T20:09:30.464000"). Read as-is, the phone takes that as
// its own local time, so in Austin everything lands 5 or 6 hours off (and a
// thing added this afternoon reads as "just now" all day). Times GenCare sets
// itself (toISOString) already end in Z and pass through unchanged.
const NAIVE = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** A Base44 timestamp as a real Date (null if missing or bad). */
export function serverDate(s) {
  if (!s) return null;
  if (s instanceof Date) return isValid(s) ? s : null;
  const t = String(s);
  const d = parseISO(NAIVE.test(t) ? `${t}Z` : t);
  return isValid(d) ? d : null;
}

/** Milliseconds, for sorting things with mixed kinds of timestamps (0 if none). */
export const serverMs = (s) => serverDate(s)?.getTime() || 0;

/** The local day (yyyy-MM-dd) a Base44 timestamp falls on. */
export const serverDay = (s) => { const d = serverDate(s); return d ? format(d, 'yyyy-MM-dd') : ''; };
