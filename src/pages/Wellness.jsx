import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Heart, Sun, Moon, Coffee, Smile, Frown, Meh, Brain, Flower2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';

const moodOptions = [
  { value: 'great', emoji: '😄', label: 'Great', color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' },
  { value: 'good', emoji: '🙂', label: 'Good', color: 'bg-blue-500/10 border-blue-500/30 text-blue-600' },
  { value: 'okay', emoji: '😐', label: 'Okay', color: 'bg-amber-500/10 border-amber-500/30 text-amber-600' },
  { value: 'poor', emoji: '😟', label: 'Struggling', color: 'bg-orange-500/10 border-orange-500/30 text-orange-600' },
  { value: 'bad', emoji: '😢', label: 'Overwhelmed', color: 'bg-red-500/10 border-red-500/30 text-red-600' },
];

const selfCareIdeas = [
  "Take 5 deep breaths right now 🌬️",
  "Step outside for 5 minutes of fresh air ☀️",
  "Drink a glass of water 💧",
  "Text a friend just to say hi 💬",
  "Put on your favorite song 🎵",
  "Stretch your neck and shoulders 🧘",
  "Write down 3 things you're grateful for 📝",
  "It's okay to ask for help. You don't have to do this alone 💛",
];

export default function Wellness() {
  const [selectedMood, setSelectedMood] = useState(null);
  const [note, setNote] = useState('');
  const [randomTip, setRandomTip] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    setRandomTip(selfCareIdeas[Math.floor(Math.random() * selfCareIdeas.length)]);
  }, []);

  const { data: recentCheckins = [] } = useQuery({
    queryKey: ['wellnessCheckins'],
    queryFn: () => base44.entities.CareJournal.filter({ category: 'Mood' }, '-created_date', 14),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.CareJournal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wellnessCheckins'] });
      setSelectedMood(null);
      setNote('');
    },
  });

  const handleSave = () => {
    const moodLabel = moodOptions.find(m => m.value === selectedMood)?.label || '';
    saveMutation.mutate({
      content: note || `Feeling ${moodLabel.toLowerCase()} today.`,
      category: 'Mood',
      mood: selectedMood,
    });
  };

  return (
    <div className="pb-24 lg:pb-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Heart className="w-7 h-7 text-primary" />
          Caregiver Wellness
        </h1>
        <p className="text-muted-foreground mt-1">Taking care of yourself is just as important. Check in with how you're feeling.</p>
      </div>

      {/* Self Care Tip */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Flower2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Self-Care Reminder</p>
              <p className="text-foreground font-medium">{randomTip}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Mood Check-in */}
      <Card className="mb-6 border-border/50">
        <CardHeader>
          <CardTitle className="font-heading text-lg">How are you feeling today?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 md:gap-3 mb-4">
            {moodOptions.map(mood => (
              <button
                key={mood.value}
                onClick={() => setSelectedMood(mood.value)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                  selectedMood === mood.value ? mood.color + ' shadow-md scale-105' : 'border-border/50 hover:border-border'
                }`}
              >
                <span className="text-2xl md:text-3xl">{mood.emoji}</span>
                <span className="text-xs font-medium text-center leading-tight">{mood.label}</span>
              </button>
            ))}
          </div>
          {selectedMood && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
              <Textarea
                placeholder="Want to add a note? (optional)"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="min-h-[80px]"
              />
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="rounded-xl">
                {saveMutation.isPending ? 'Saving...' : 'Save Check-in'}
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Recent Check-ins */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Recent Check-ins</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCheckins.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">No check-ins yet. How are you feeling today?</p>
          ) : (
            <div className="space-y-3">
              {recentCheckins.map(entry => {
                const moodConfig = moodOptions.find(m => m.value === entry.mood);
                return (
                  <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                    <span className="text-xl mt-0.5">{moodConfig?.emoji || '📝'}</span>
                    <div className="flex-1">
                      <p className="text-sm">{entry.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {entry.created_date ? new Date(entry.created_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}