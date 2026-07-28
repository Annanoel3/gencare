import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { format, isSameDay, parseISO } from 'date-fns';
import { Backpack, BookOpen, ClipboardCheck, HeartPulse, ShowerHead, Brain, Smartphone, PiggyBank, Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isPreteen, formatAge } from '@/utils/age';
import { getMemberColorClass } from '@/utils/memberColors';
import LogEntryDialog from '@/components/preteencare/LogEntryDialog';
import EntryItem from '@/components/preteencare/EntryItem';
import TodaySummary from '@/components/preteencare/TodaySummary';

export default function PreteenCare() {
  const queryClient = useQueryClient();
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultType, setDefaultType] = useState('schoolwork');

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });
  const preteens = useMemo(() => members.filter(isPreteen), [members]);
  const effectiveChildId = selectedChildId || preteens[0]?.id || null;
  const selectedChild = preteens.find(p => p.id === effectiveChildId);

  const { data: logs = [] } = useQuery({
    queryKey: ['preteenLogs'],
    queryFn: () => base44.entities.PreteenLog.list('-timestamp', 500),
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
      const child = preteens.find(p => p.id === data.family_member_id);
      return base44.entities.PreteenLog.create({ ...data, family_member_name: child?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preteenLogs'] });
      setDialogOpen(false);
    },
  });

  const openLog = (type) => {
    setDefaultType(type);
    setDialogOpen(true);
  };

  const quickActions = [
    { type: 'schoolwork', label: 'Schoolwork', icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { type: 'chore', label: 'Chore', icon: ClipboardCheck, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { type: 'mental', label: 'Mood', icon: Brain, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
    { type: 'screen_time', label: 'Screen Time', icon: Smartphone, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
    { type: 'allowance', label: 'Allowance', icon: PiggyBank, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { type: 'puberty', label: 'Puberty', icon: HeartPulse, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30' },
    { type: 'hygiene', label: 'Hygiene', icon: ShowerHead, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-950/30' },
    { type: 'social', label: 'Social', icon: Users, color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-950/30' },
  ];

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Backpack className="w-7 h-7 text-primary" />
            Pre-Teen Care
          </h1>
          <p className="text-muted-foreground mt-1">Schoolwork, chores, health, screen time, and responsibility for ages 9–12.</p>
        </div>
      </div>

      {preteens.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/50 p-10 text-center">
          <Backpack className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="font-heading text-lg font-semibold mb-2">No pre-teens in your family yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Pre-Teen Care features appear automatically for children ages 9 to 12. Add your child with their birthdate to get started.
          </p>
          <Button asChild className="rounded-xl gap-2">
            <Link to="/family"><Plus className="w-4 h-4" /> Add Family Member</Link>
          </Button>
        </div>
      ) : (
        <>
          {preteens.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {preteens.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedChildId(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    p.id === effectiveChildId
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${getMemberColorClass(p, members)}`} />
                  {p.name}
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
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3 mb-6">
            {quickActions.map(a => (
              <button
                key={a.type}
                onClick={() => openLog(a.type)}
                className="bg-card rounded-2xl border border-border/50 p-3 flex flex-col items-center gap-2 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.bg}`}>
                  <a.icon className={`w-5 h-5 ${a.color}`} />
                </div>
                <span className="text-[11px] md:text-xs font-medium text-center leading-tight">{a.label}</span>
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
        preteens={preteens}
        defaultMemberId={effectiveChildId}
        defaultType={defaultType}
        isPending={createMutation.isPending}
        onCreate={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}