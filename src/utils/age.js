import { differenceInMonths, parseISO } from 'date-fns';

// A member counts as a "baby" for baby-care tracking until 24 months old.
export const BABY_AGE_MONTHS = 24;

export function ageInMonths(birthdate) {
  if (!birthdate) return null;
  const d = typeof birthdate === 'string' ? parseISO(birthdate) : birthdate;
  return differenceInMonths(new Date(), d);
}

export function isBaby(member) {
  const m = ageInMonths(member?.birthdate);
  return m !== null && m < BABY_AGE_MONTHS;
}

export function formatAge(birthdate) {
  const m = ageInMonths(birthdate);
  if (m === null) return '';
  if (m < 1) return 'Newborn';
  if (m < 12) return `${m} month${m === 1 ? '' : 's'} old`;
  const years = Math.floor(m / 12);
  const rem = m % 12;
  if (rem === 0) return `${years} year${years === 1 ? '' : 's'} old`;
  return `${years} yr ${rem} mo`;
}