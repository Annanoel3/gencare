// Who an appointment is for. The person adding it picks: the whole family
// (visibility "family"), certain people ("some" + shared_with), or just
// themselves ("private"). That one choice decides who sees it in the app,
// who gets pushed about it, and whose phone calendar it lands on.
export function canSee(appt: any, userId: string): boolean {
  if (!appt || !userId) return false;
  if (appt.created_by_user_id === userId || appt.created_by_id === userId) return true;
  if (appt.visibility === 'private') return false;
  if (appt.visibility === 'some') return Array.isArray(appt.shared_with) && appt.shared_with.includes(userId);
  return true; // "family" (and anything unset)
}
