import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import RecordingRow from '@/components/notes/RecordingRow';
import { useFamily } from '@/lib/family';
import { topLevel } from '@/lib/recordings';

// The newest recordings, with a way to all of them (Anna, Nov 23 2026: "it
// needs to be waaay easier to find recordings"). On Home (the family's), and
// on a person's profile (memberId: the ones about them). Nothing shows until
// there's a recording.

export default function RecentRecordings({ memberId = '', memberName = '', className = '' }) {
  const navigate = useNavigate();
  const { me, members: accounts = [] } = useFamily();
  const { data: rows = [] } = useQuery({
    queryKey: ['noteRecordings', 'latest', memberId],
    queryFn: async () => (await base44.entities.NoteRecording.filter(memberId ? { family_member_id: memberId } : {}, '-started_at', 8)) || [],
  });
  const latest = topLevel(rows).slice(0, 2);
  if (!latest.length) return null;
  const first = String(memberName || '').trim().split(/\s+/)[0];
  const all = memberId ? `/recordings?for=${memberId}&show=recorded` : '/recordings?show=recorded';

  return (
    <div className={`bg-card rounded-2xl border border-border/50 p-4 md:px-6 ${className}`} data-guide="profile-recordings">
      <div className="flex items-center gap-2 mb-2">
        <FileCheck2 className="w-5 h-5 text-emerald-700 dark:text-emerald-300 flex-shrink-0" />
        <h2 className="font-heading text-lg font-semibold min-w-0 flex-1">{first ? `Recordings about ${first}` : 'Recordings'}</h2>
      </div>
      <div className="space-y-2">
        {latest.map((r) => (
          <RecordingRow key={r.id} r={r} me={me} accounts={accounts} compact onOpen={(x) => navigate(`/notes?open=${x.id}`)} />
        ))}
      </div>
      <Link to={all} data-guide="profile-recordings-all" className="mt-3 flex items-center justify-center gap-1 h-11 rounded-xl border border-border text-base font-semibold text-primary hover:bg-muted">
        See all recordings <ChevronRight className="w-5 h-5" />
      </Link>
    </div>
  );
}
