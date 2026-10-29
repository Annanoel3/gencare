// Shared words and scales for the private Wellness check-in.
export const MOODS = [
  { value: 'great', emoji: '😄', label: 'Great', color: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700', bar: 'bg-emerald-500' },
  { value: 'good', emoji: '🙂', label: 'Good', color: 'bg-blue-500/10 border-blue-500/40 text-blue-700', bar: 'bg-blue-500' },
  { value: 'okay', emoji: '😐', label: 'Okay', color: 'bg-amber-500/10 border-amber-500/40 text-amber-700', bar: 'bg-amber-400' },
  { value: 'poor', emoji: '😟', label: 'Struggling', color: 'bg-orange-500/10 border-orange-500/40 text-orange-700', bar: 'bg-orange-500' },
  { value: 'bad', emoji: '😢', label: 'Overwhelmed', color: 'bg-red-500/10 border-red-500/40 text-red-700', bar: 'bg-red-500' },
];
export const MOOD_SCORE = { great: 5, good: 4, okay: 3, poor: 2, bad: 1 };
export const STRESS = ['Calm', 'Fine', 'Tense', 'Stretched', 'Maxed out'];
export const STRESS_COLORS = ['bg-emerald-400', 'bg-emerald-300', 'bg-amber-300', 'bg-orange-400', 'bg-red-500'];
export const SELF_CARE = ['Slept enough', 'Ate a real meal', 'Got outside', 'Moved my body', 'Talked to a friend', 'Took a break', 'Asked for help', 'Did something fun'];

export const moodOf = (c) => MOODS.find((m) => m.value === c?.mood) || null;
export const isHard = (c) => !!c && (MOOD_SCORE[c.mood] <= 2 || (c.stress || 0) >= 4);
