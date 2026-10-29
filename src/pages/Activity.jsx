import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { formatDistanceToNowStrict, format, parseISO, subDays } from 'date-fns';
import { Activity as ActivityIcon, Smartphone, Globe, AlertTriangle, Bell, BellOff, ChevronDown, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { Choices } from '@/components/shared/MoreOptions';

// The owner's record keeping (admins only): who opened GenCare where (iPhone
// app, Android app or a browser), which build and phone system, whether
// notifications work, what they did, and every error they hit. Built from
// AppActivity rows (lib/activity.js) and each account's last-seen details.

const KIND_ICON = { open: '🚪', screen: '📄', action: '✅', error: '⚠️', permission: '🔔' };
const WHERE = { ios: 'iPhone app', android: 'Android app', web: 'Website' };
const ago = (iso) => { try { return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true }); } catch (e) { return ''; } };
const when = (iso) => { try { return format(parseISO(iso), 'MMM d, h:mm a'); } catch (e) { return ''; } };

function whereText(p) {
  const where = WHERE[p.platform] || 'Not opened yet';
  return [where, p.build ? `build ${p.build}` : '', p.os].filter(Boolean).join(' · ');
}

export default function Activity() {
  const { me } = useFamily();
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const since = subDays(new Date(), 14).toISOString();

  const { data: rows = [], refetch, isFetching } = useQuery({
    queryKey: ['appActivity', since.slice(0, 10)],
    queryFn: () => base44.entities.AppActivity.filter({ at: { $gte: since } }, '-at', 2000),
    enabled: me?.role === 'admin',
  });
  const { data: users = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list('-updated_date', 200),
    enabled: me?.role === 'admin',
  });

  const people = useMemo(() => {
    const byId = new Map();
    for (const u of users) {
      byId.set(u.id, {
        id: u.id, name: u.display_name || u.full_name || u.email, email: u.email,
        platform: u.last_platform || (u.app_build ? '' : ''), build: u.app_build || 0, os: u.last_os || '',
        lastSeen: u.last_seen_at || '', pushId: !!u.onesignal_player_id, rows: [],
      });
    }
    for (const r of rows) {
      if (!byId.has(r.user_id)) byId.set(r.user_id, { id: r.user_id, name: r.user_name || r.user_id, email: '', platform: '', build: 0, os: '', lastSeen: '', pushId: false, rows: [] });
      byId.get(r.user_id).rows.push(r);
    }
    return [...byId.values()].map((p) => {
      const latest = p.rows[0];
      const notif = p.rows.find((r) => r.kind === 'permission' && /notifications/.test(r.name));
      return {
        ...p,
        platform: latest?.platform || p.platform,
        build: latest?.build || p.build,
        os: latest?.os || p.os,
        lastSeen: latest?.at && (!p.lastSeen || latest.at > p.lastSeen) ? latest.at : p.lastSeen,
        notif: notif?.detail || '',
        errors: p.rows.filter((r) => r.kind === 'error'),
        actions: p.rows.filter((r) => r.kind === 'action'),
        screens: p.rows.filter((r) => r.kind === 'screen'),
      };
    }).sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  }, [rows, users]);

  if (me && me.role !== 'admin') return <Navigate to="/" replace />;

  const shown = people.filter((p) => filter === 'all' || p.platform === filter);
  const errors = rows.filter((r) => r.kind === 'error' && (filter === 'all' || r.platform === filter)).slice(0, 30);
  const counts = { ios: people.filter((p) => p.platform === 'ios').length, android: people.filter((p) => p.platform === 'android').length, web: people.filter((p) => p.platform === 'web').length };

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-3"><ActivityIcon className="w-7 h-7 text-primary" /> App activity</h1>
          <p className="text-muted-foreground mt-1 text-sm">Only you see this. The last 14 days: where people use GenCare, what works for them and what breaks. Never what they write.</p>
        </div>
        <button type="button" onClick={() => refetch()} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted flex-shrink-0" aria-label="Refresh"><RefreshCw className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} /></button>
      </div>

      <Choices value={filter} onChange={setFilter} className="mb-4" options={[['all', 'Everyone'], ['ios', `iPhone app (${counts.ios})`], ['android', `Android (${counts.android})`], ['web', `Website (${counts.web})`]]} />

      {errors.length > 0 && (
        <section className="mb-5 rounded-2xl border border-orange-300/60 bg-orange-50 dark:bg-orange-950/20 p-4">
          <h2 className="font-heading font-semibold flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-orange-600" /> Problems ({errors.length})</h2>
          <ul className="space-y-2">
            {errors.map((r) => (
              <li key={r.id} className="text-sm">
                <p className="font-medium">{r.name}</p>
                {r.detail && <p className="text-xs text-muted-foreground break-words">{r.detail}</p>}
                <p className="text-xs text-muted-foreground">{r.user_name} · {WHERE[r.platform] || ''}{r.build ? ` build ${r.build}` : ''}{r.os ? ` · ${r.os}` : ''} · {ago(r.at)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-3">
        {shown.map((p) => {
          const isOpen = open === p.id;
          const PIcon = p.platform === 'web' ? Globe : Smartphone;
          const pushOk = p.pushId && p.notif !== 'denied' && p.notif !== 'not granted';
          return (
            <section key={p.id} className="rounded-2xl border border-border/50 bg-card">
              <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} className="w-full text-left p-4 flex items-start gap-3" aria-expanded={isOpen}>
                <PIcon className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{whereText(p)}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{p.lastSeen ? `Last opened ${ago(p.lastSeen)}` : 'No visits recorded yet'}</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs mt-1.5">
                    <span className={`inline-flex items-center gap-1 ${pushOk ? 'text-emerald-700' : 'text-orange-700'}`}>{pushOk ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}{pushOk ? 'Pushes on' : p.platform === 'web' ? 'No pushes (website)' : p.notif ? `Pushes ${p.notif}` : 'No push sign-up yet'}</span>
                    <span className="text-muted-foreground">{p.screens.length} screens · {p.actions.length} actions</span>
                    {p.errors.length > 0 && <span className="text-orange-700">{p.errors.length} problem{p.errors.length === 1 ? '' : 's'}</span>}
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <ol className="px-4 pb-4 space-y-1.5">
                  {p.rows.length === 0 && <li className="text-sm text-muted-foreground">Nothing recorded yet. Activity starts showing once they open the updated app.</li>}
                  {p.rows.slice(0, 80).map((r) => (
                    <li key={r.id} className="flex gap-2 text-sm">
                      <span aria-hidden>{KIND_ICON[r.kind] || '•'}</span>
                      <span className="flex-1 min-w-0">
                        <span className={r.kind === 'error' ? 'text-orange-700 font-medium' : ''}>{r.kind === 'screen' ? `Opened ${r.name}` : r.name}</span>
                        {r.detail && r.kind !== 'open' && <span className="text-muted-foreground"> · {r.detail}</span>}
                        <span className="block text-xs text-muted-foreground">{when(r.at)}{r.kind === 'open' ? ` · ${WHERE[r.platform] || ''}${r.build ? ` build ${r.build}` : ''}${r.os ? ` · ${r.os}` : ''}` : ''}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
