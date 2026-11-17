import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { aroundKey, listEventsAround } from '@/lib/events';
import WelcomeHeader from '@/components/dashboard/WelcomeHeader';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import CareFeed from '@/components/dashboard/CareFeed';
import TodoCard from '@/components/dashboard/TodoCard';
import ClaimProfilePrompt from '@/components/family/ClaimProfilePrompt';
import { AnnouncementList, AnnounceDialog } from '@/components/dashboard/Announcements';
import CareLogToday from '@/components/dashboard/CareLogToday';
import RecordVisitsCard from '@/components/dashboard/RecordVisitsCard';

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

  const { data: tasks = [] } = useQuery({
    queryKey: ['careTasks'],
    queryFn: () => base44.entities.CareTask.list('-created_date', 200),
  });

  return (
    <div className="pb-24 lg:pb-8">
      <WelcomeHeader userName={user?.full_name?.split(' ')[0]} />
      {/* No count cards ("3 events today, 1 reminder") since Nov 17 2026: Today
          Across the Family below shows the same things. */}
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
        <CareLogToday members={members} />
        <AnnounceDialog open={announcing} onClose={() => setAnnouncing(false)} />
      </div>

      {/* Doctor-type visits coming up, with a Record button (on phones that can
          record), under what's going on today (Anna, Nov 17 2026). */}
      <RecordVisitsCard appointments={appointments} members={members} />

      {/* Family members live on the Family page (Anna: "there's already a whole page for that"). */}
      <ActivityFeed members={members} />

      {/* Joined without their profile's own invite? Let them say which is theirs. */}
      <ClaimProfilePrompt />
    </div>
  );
}