// One place that sends a push (OneSignal). Targets by external id = the
// person's email, the same hard rule as ADHDone: never player ids.
//
//   sendPush({ email, title, message, data })  -> { ok, recipients, error? }
//   pushFamily(db, familyId, { title, message, data, exceptUserId, need })
//      -> sends to every member of the family who wants that kind of push
//         (need = "reminders" | "family_events"), skipping exceptUserId.

export type PushData = Record<string, unknown>;

export async function sendPush(opts: { email: string; title: string; message: string; data?: PushData; priority?: 'high' | 'normal' }) {
  const appId = (Deno.env.get('ONESIGNAL_APP_ID') || '').trim();
  const rest = (Deno.env.get('ONESIGNAL_REST_API_KEY') || '').trim();
  if (!appId || !rest) return { ok: false, recipients: 0, error: 'OneSignal secrets missing' };
  if (!opts.email || !opts.title || !opts.message) return { ok: false, recipients: 0, error: 'email, title and message are required' };
  const payload: Record<string, unknown> = {
    app_id: appId,
    include_aliases: { external_id: [String(opts.email).toLowerCase().trim()] },
    target_channel: 'push',
    headings: { en: opts.title },
    contents: { en: opts.message },
    data: opts.data || {},
    small_icon: 'ic_stat_onesignal_default',
  };
  if (opts.priority === 'high') payload.priority = 10;
  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${rest}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result?.errors) {
      const err = Array.isArray(result?.errors) ? result.errors[0] : JSON.stringify(result?.errors || result);
      return { ok: false, recipients: 0, error: String(err) };
    }
    return { ok: true, recipients: result?.recipients || 0, id: result?.id };
  } catch (e) {
    return { ok: false, recipients: 0, error: (e as Error).message };
  }
}

export async function familyUsers(db: any, familyId: string): Promise<any[]> {
  if (!familyId) return [];
  const rows = await db.User.filter({ family_id: familyId });
  return Array.isArray(rows) ? rows : [];
}

export function wantsPush(u: any, need: 'reminders' | 'family_events'): boolean {
  if (!u?.email) return false;
  if (u.push_enabled === false) return false;
  if (need === 'reminders' && u.notify_reminders === false) return false;
  if (need === 'family_events' && u.notify_family_events === false) return false;
  return true;
}

export async function pushFamily(db: any, familyId: string, opts: { title: string; message: string; data?: PushData; exceptUserId?: string; onlyUserIds?: string[]; need: 'reminders' | 'family_events'; priority?: 'high' | 'normal' }) {
  const users = await familyUsers(db, familyId);
  const sent: string[] = [];
  for (const u of users) {
    if (opts.exceptUserId && u.id === opts.exceptUserId) continue;
    if (opts.onlyUserIds && !opts.onlyUserIds.includes(u.id)) continue;
    if (!wantsPush(u, opts.need)) continue;
    const r = await sendPush({ email: u.email, title: opts.title, message: opts.message, data: opts.data, priority: opts.priority });
    if (r.ok) sent.push(u.id);
  }
  return sent;
}

// "Thu, Nov 6 at 2:00 PM" in the family's timezone.
export function whenText(date: string, time: string | undefined, tz: string | undefined, allDay = false): string {
  try {
    const zone = tz || 'America/Chicago';
    const [y, m, d] = String(date).split('-').map(Number);
    if (!y || !m || !d) return String(date || '');
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(dt);
    if (allDay || !time) return day;
    const [hh, mm] = String(time).split(':').map(Number);
    const h12 = ((hh + 11) % 12) + 1;
    const ampm = hh >= 12 ? 'PM' : 'AM';
    void zone;
    return `${day} at ${h12}:${String(mm || 0).padStart(2, '0')} ${ampm}`;
  } catch (_) {
    return `${date} ${time || ''}`.trim();
  }
}
