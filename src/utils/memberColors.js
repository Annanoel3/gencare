// Shared color palette for family members. Index-based so each member keeps
// a stable color as long as the member list order (sorted -created_date) is stable.
export const MEMBER_COLOR_PALETTE = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-amber-500',
];

const FALLBACK_COLOR = 'bg-gray-400';

export function getMemberColorClass(member, members = []) {
  if (!member) return FALLBACK_COLOR;
  if (member.color && typeof member.color === 'string' && member.color.startsWith('bg-')) return member.color;
  const idx = members.findIndex(m => m.id === member.id);
  return idx >= 0 ? MEMBER_COLOR_PALETTE[idx % MEMBER_COLOR_PALETTE.length] : FALLBACK_COLOR;
}

export function getMemberColorByMemberId(memberId, members = []) {
  const member = members.find(m => m.id === memberId);
  return getMemberColorClass(member, members);
}