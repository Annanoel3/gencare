import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { expandAppointments } from '@/lib/occurrences';
import { aroundKey, listEventsAround } from '@/lib/events';
import { REMINDERS_KEY, listReminders, slotsForDay, todayStr } from '@/lib/reminders';
import WelcomeHeader from '@/components/dashboard/WelcomeHeader';
import StatCards from '@/components/dashboard/StatCards';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import CareFeed from '@/components/dashboard/CareFeed';
import TodoCard from '@/components/dashboard/TodoCard';
import ClaimProfilePrompt from '@/components/family/ClaimProfilePrompt';
import { AnnouncementList, AnnounceDialog } from '@/components/dashboard/Announcements';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  // The + menu's "Announcement" lands here with ?announce=1.
  const [params, setParams] = useSearchParams();
  const [announcing, setAnnouncing] = useState(false);
  useEffect(() => {
    if (params.get('announce') !== '1') return;
    setAnnouncing(true);
    const next = new URLSearchParams(params);
    next.delete('announce');
    setParams(next, { replace: true });
  }, [params]);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: members = [] } = useQuery({
    queryKey: ['familyMembers'],
    queryFn: () => base44.entities.FamilyMember.list('-created_date'),
  });

  const { data: appointments = [] } = useQuery({
    queryKey: aroundKey(),
    queryFn: listEventsAround,
  });

  const { data: reminders = [] } = useQuery({ queryKey: REMINDERS_KEY, queryFn: listReminders });

  const { data: tasks = [] } = useQuery({
    queryKey: ['careTasks'],
    queryFn: () => base44.entities.CareTask.list('-created_date', 200),
  });



  const todayAppts = expandAppointments(appointments, new Date(), new Date());
  const remindersToday = slotsForDay(reminders, [], todayStr()).length;

  return (
    <div className="pb-24 lg:pb-8">
      <WelcomeHeader userName={user?.full_name?.split(' ')[0]} />
      <StatCards
        appointments={todayAppts.length}
        reminders={remindersToday}
      />

      <TodoCard tasks={tasks} members={members} />

      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-heading text-lg font-semibold">Today Across the Family</h2>
          <button type="button" onClick={() => setAnnouncing(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border bg-card text-sm font-medium hover:bg-muted">
            <Megaphone className="w-4 h-4 text-purple-500" /> Announce
          </button>
        </div>
        {/* Announcements first (Anna, Nov 10 2026). */}
        <AnnouncementList />
        <CareFeed members={members} scope="today" />
        <AnnounceDialog open={announcing} onClose={() => setAnnouncing(false)} />
      </div>

      {/* Family members live on the Family page (Anna: "there's already a whole page for that"). */}
      <ActivityFeed members={members} />

      {/* Joined without their profile's own invite? Let them say which is theirs. */}
      <ClaimProfilePrompt />
    </div>
  );
}