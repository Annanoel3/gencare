import React from 'react';
import { getMemberColorByMemberId } from '@/utils/memberColors';

export default function EventRow({ appt, members }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
      <div className={`w-2 h-full min-h-[40px] rounded-full ${getMemberColorByMemberId(appt.family_member_id, members)}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{appt.title}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {appt.time && (
            <span className="text-xs text-muted-foreground">
              {appt.time}{appt.end_time ? `–${appt.end_time}` : ''}
            </span>
          )}
          {appt.family_member_name && (
            <span className="inline-flex items-center gap-1 text-xs">
              <span className={`w-2 h-2 rounded-full ${getMemberColorByMemberId(appt.family_member_id, members)}`} />
              {appt.family_member_name}
            </span>
          )}
          {appt.location && <span className="text-xs text-muted-foreground">📍 {appt.location}</span>}
        </div>
        {appt.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{appt.notes}</p>}
      </div>
    </div>
  );
}