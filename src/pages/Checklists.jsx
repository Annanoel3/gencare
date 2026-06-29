import React from 'react';
import { CheckSquare } from 'lucide-react';
import ChecklistsPanel from '@/components/checklists/ChecklistsPanel';

export default function Checklists() {
  return (
    <div className="pb-24 lg:pb-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
          <CheckSquare className="w-7 h-7 text-primary" />
          Checklists
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Shared daily routines for the whole family.</p>
      </div>
      <ChecklistsPanel />
    </div>
  );
}