import React from 'react';
import { format } from 'date-fns';
import { Sun, Moon, CloudSun } from 'lucide-react';

export default function WelcomeHeader({ userName }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const Icon = hour < 12 ? Sun : hour < 17 ? CloudSun : Moon;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-1">
        <Icon className="w-6 h-6 text-accent" />
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">
          {greeting}, {userName || 'there'}
        </h1>
      </div>
      <p className="text-muted-foreground ml-9">
        {format(new Date(), 'EEEE, MMMM d, yyyy')} — Here's what needs your attention today.
      </p>
    </div>
  );
}