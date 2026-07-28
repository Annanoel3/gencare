import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { format, isSameDay, parseISO } from 'date-fns';
import { Footprints, Frown, Smile, Smartphone, Bath, Star, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isToddler, formatAge } from '@/utils/age';
import { getMemberColorClass } from '@/utils/memberColors';
import LogEntryDialog from '@/components/toddlercare/LogEntryDialog';
import EntryItem from '@/components/toddlercare/EntryItem';
import TodaySummary from '@/components/toddlercare/TodaySummary';

export default function ToddlerCare() {
  const queryClient = useQueryClient();
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultType, setDefaultType] = useState('mood');

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });
  const toddlers = useMemo(() => members.filter(isToddler), [members]);
  const effectiveChildId = selectedChildId || toddlers[0]?.id || null;
  const selectedChild = toddlers.find(t => t.id === effectiveChildId);

  const { data: logs = [] } = useQuery({
    queryKey: ['toddlerCareLogs'],
    queryFn: () => base44.entities.ToddlerCareLog.list('-timestamp', 500),
  });

  const childLogs = useMemo(
    () => logs.filter(l => l.family_member_id === effectiveChildId)
      .sort((a, b) => parseISO(b.timestamp) - parseISO(a.timestamp)),
    [logs, effectiveChildId]
  );
  const todayLogs = useMemo(
    () => childLogs.filter(l => l.timestamp && isSameDay(parseISO(l.timestamp), new Date())),
    [childLogs]
  );

  const createMutation = useMutation({
    mutationFn: (data) => {
      const child = toddlers.find(t => t.id === data.family_member_id);
      return base44.entities.ToddlerCareLog.create({ ...data, family_member_name: child?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['toddlerCareLogs'] });
      setDialogOpen(false);
    },
  });

  const openLog = (type) => {
    setDefaultType(type);
    setDialogOpen(true);
  };

  const quickActions = [
    { type: 'mood', label: 'Mood', icon: Smile, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { type: 'tantrum', label: 'Tantrum', icon: Frown, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/30' },
    { type: 'potty', label: 'Potty', icon: Bath, color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-950/30' },
    { type: 'screen_time', label: 'Screen Time', icon: Smartphone, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
    { type: 'milestone', label: 'Milestone', icon: Star, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  ];

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Footprints className="w-7 h-7 text-primary" />
            Toddler Care
          </h1>
          <p className="text-muted-foreground mt-1">Track moods, tantrums, potty training, screen time, and milestones.</p>
        </div>
      </div>

      {toddlers.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/50 p-10 text-center">
          <Footprints className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="font-heading text-lg font-semibold mb-2">No toddlers in your family yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Toddler Care features appear automatically for children ages 2 to 5. Add your child with their birthdate to get started.
          </p>
          <Button asChild className="rounded-xl gap-2">
            <Link to="/family"><Plus className="w-4 h-4" /> Add Family Member</Link>
          </Button>
        </div>
      ) : (
        <>
          {toddlers.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {toddlers.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedChildId(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    t.id === effectiveChildId
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${getMemberColorClass(t, members)}`} />
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {selectedChild && (
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold ${getMemberColorClass(selectedChild, members)}`}>
                {selectedChild.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="font-heading text-lg font-semibold">{selectedChild.name}</p>
                <p className="text-sm text-muted-foreground">{formatAge(selectedChild.birthdate)}</p>
              </div>
            </div>
          )}

          {/* Quick log actions */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-6">
            {quickActions.map(a => (
              <button
                key={a.type}
                onClick={() => openLog(a.type)}
                className="bg-card rounded-2xl border border-border/50 p-4 flex flex-col items-center gap-2 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${a.bg}`}>
                  <a.icon className={`w-5 h-5 ${a.color}`} />
                </div>
                <span className="text-xs md:text-sm font-medium text-center">{a.label}</span>
              </button>
            ))}
          </div>

          {/* Today summary */}
          <h2 className="font-heading text-lg font-semibold mb-3">Today · {format(new Date(), 'MMM d')}</h2>
          <div className="mb-6">
            <TodaySummary todayLogs={todayLogs} />
          </div>

          {/* Today's log */}
          <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6">
            <h3 className="font-heading text-lg font-semibold mb-4">Today's Log</h3>
            {todayLogs.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">No entries yet today. Tap a quick action above to start logging.</p>
            ) : (
              <div className="space-y-2">
                {todayLogs.map(l => <EntryItem key={l.id} entry={l} />)}
              </div>
            )}
          </div>

          {/* Recent (beyond today) */}
          {childLogs.filter(l => !l.timestamp || !isSameDay(parseISO(l.timestamp), new Date())).length > 0 && (
            <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mt-6">
              <h3 className="font-heading text-lg font-semibold mb-4">Recent</h3>
              <div className="space-y-2">
                {childLogs.filter(l => !l.timestamp || !isSameDay(parseISO(l.timestamp), new Date())).slice(0, 20).map(l => (
                  <div key={l.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16 flex-shrink-0">
                      {l.timestamp ? format(parseISO(l.timestamp), 'MMM d') : ''}
                    </span>
                    <div className="flex-1 min-w-0"><EntryItem entry={l} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <LogEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        toddlers={toddlers}
        defaultMemberId={effectiveChildId}
        defaultType={defaultType}
        isPending={createMutation.isPending}
        onCreate={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}