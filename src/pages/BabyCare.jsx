import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { format, isSameDay, parseISO } from 'date-fns';
import { Baby, Milk, Droplets, Moon, Droplet, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isBaby, formatAge } from '@/utils/age';
import { getMemberColorClass } from '@/utils/memberColors';
import LogEntryDialog from '@/components/babycare/LogEntryDialog';
import EntryItem from '@/components/babycare/EntryItem';
import TodaySummary from '@/components/babycare/TodaySummary';

export default function BabyCare() {
  const queryClient = useQueryClient();
  const [selectedBabyId, setSelectedBabyId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultType, setDefaultType] = useState('feeding');

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });
  const babies = useMemo(() => members.filter(isBaby), [members]);
  const effectiveBabyId = selectedBabyId || babies[0]?.id || null;
  const selectedBaby = babies.find(b => b.id === effectiveBabyId);

  const { data: logs = [] } = useQuery({
    queryKey: ['babyCareLogs'],
    queryFn: () => base44.entities.BabyCareLog.list('-timestamp', 500),
  });

  const babyLogs = useMemo(
    () => logs.filter(l => l.family_member_id === effectiveBabyId)
      .sort((a, b) => parseISO(b.timestamp) - parseISO(a.timestamp)),
    [logs, effectiveBabyId]
  );
  const todayLogs = useMemo(
    () => babyLogs.filter(l => l.timestamp && isSameDay(parseISO(l.timestamp), new Date())),
    [babyLogs]
  );

  const createMutation = useMutation({
    mutationFn: (data) => {
      const baby = babies.find(b => b.id === data.family_member_id);
      return base44.entities.BabyCareLog.create({ ...data, family_member_name: baby?.name || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['babyCareLogs'] });
      setDialogOpen(false);
    },
  });

  const openLog = (type) => {
    setDefaultType(type);
    setDialogOpen(true);
  };

  const quickActions = [
    { type: 'feeding', label: 'Feed', icon: Milk, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-950/30' },
    { type: 'diaper', label: 'Diaper', icon: Droplets, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { type: 'sleep', label: 'Sleep', icon: Moon, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
    { type: 'pumping', label: 'Pump', icon: Droplet, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-950/30' },
  ];

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Baby className="w-7 h-7 text-primary" />
            Baby Care
          </h1>
          <p className="text-muted-foreground mt-1">Track feedings, diapers, sleep, and pumping for your little one.</p>
        </div>
      </div>

      {babies.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/50 p-10 text-center">
          <Baby className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="font-heading text-lg font-semibold mb-2">No babies in your family yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Baby Care features appear automatically for family members under 2 years old. Add your child with their birthdate to get started.
          </p>
          <Button asChild className="rounded-xl gap-2">
            <Link to="/family"><Plus className="w-4 h-4" /> Add Family Member</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Baby selector */}
          {babies.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {babies.map(b => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBabyId(b.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    b.id === effectiveBabyId
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${getMemberColorClass(b, members)}`} />
                  {b.name}
                </button>
              ))}
            </div>
          )}

          {selectedBaby && (
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold ${getMemberColorClass(selectedBaby, members)}`}>
                {selectedBaby.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="font-heading text-lg font-semibold">{selectedBaby.name}</p>
                <p className="text-sm text-muted-foreground">{formatAge(selectedBaby.birthdate)}</p>
              </div>
            </div>
          )}

          {/* Quick log actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {quickActions.map(a => (
              <button
                key={a.type}
                onClick={() => openLog(a.type)}
                className="bg-card rounded-2xl border border-border/50 p-4 flex flex-col items-center gap-2 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${a.bg}`}>
                  <a.icon className={`w-5 h-5 ${a.color}`} />
                </div>
                <span className="text-sm font-medium">Log {a.label}</span>
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
          {babyLogs.filter(l => !l.timestamp || !isSameDay(parseISO(l.timestamp), new Date())).length > 0 && (
            <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-6 mt-6">
              <h3 className="font-heading text-lg font-semibold mb-4">Recent</h3>
              <div className="space-y-2">
                {babyLogs.filter(l => !l.timestamp || !isSameDay(parseISO(l.timestamp), new Date())).slice(0, 20).map(l => (
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
        babies={babies}
        defaultMemberId={effectiveBabyId}
        defaultType={defaultType}
        isPending={createMutation.isPending}
        onCreate={(data) => createMutation.mutate(data)}
      />
    </div>
  );
}