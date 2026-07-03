/** Whole months elapsed between an ISO dob (YYYY-MM-DD) and now/asOf. */
export const ageInMonths = (dob: string, asOf: Date = new Date()): number => {
  const birth = new Date(`${dob}T00:00:00`);
  let months =
    (asOf.getFullYear() - birth.getFullYear()) * 12 + (asOf.getMonth() - birth.getMonth());
  if (asOf.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
};

export const ageInDays = (dob: string, asOf: Date = new Date()): number => {
  const birth = new Date(`${dob}T00:00:00`);
  return Math.max(0, Math.floor((asOf.getTime() - birth.getTime()) / 86_400_000));
};

/** Inclusive [min, max] month window around an age, clamped at 0. */
export const ageWindow = (months: number, pad = 3): { min: number; max: number } => ({
  min: Math.max(0, months - pad),
  max: months + pad,
});

export const formatAge = (months: number): string => {
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years} years` : `${years}y ${rem}m`;
};
