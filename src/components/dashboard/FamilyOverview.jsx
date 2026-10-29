import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import { getMemberColorClass } from '@/utils/memberColors';
import { useFamily, relationshipLabel } from '@/lib/family';

export default function FamilyOverview({ members }) {
  const { me } = useFamily();
  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Family Members
          </CardTitle>
          <Link to="/family" className="text-sm text-primary hover:underline font-medium">Manage</Link>
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No family members yet.</p>
            <Link to="/family" className="text-sm text-primary hover:underline mt-1 inline-block">Add your first family member</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {members.map((member, i) => (
              <Link
                key={member.id}
                to={`/family/${member.id}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <Avatar className="w-10 h-10">
                  <AvatarImage src={member.photo_url} />
                  <AvatarFallback className={`${getMemberColorClass(member, members)} text-white text-sm font-semibold`}>
                    {member.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{relationshipLabel(member, me?.id)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}