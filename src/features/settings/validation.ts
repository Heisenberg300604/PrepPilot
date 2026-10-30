export interface IntResult {
  value?: number;
  error?: string;
}

/** Parse a whole-number input constrained to [min, max]. Empty and fractional input are rejected. */
export function parseBoundedInt(raw: string, min: number, max: number, label: string): IntResult {
  const t = raw.trim();
  if (t === '') return { error: `Enter a number for ${label}.` };
  if (!/^-?\d+$/.test(t)) return { error: `${label} must be a whole number.` };
  const n = Number(t);
  if (n < min || n > max) return { error: `${label} must be between ${min} and ${max}.` };
  return { value: n };
}

export const validateTarget = (raw: string) => parseBoundedInt(raw, 0, 1440, 'Daily target (minutes)');
export const validateSuggestPercent = (raw: string) => parseBoundedInt(raw, 0, 100, 'Completion suggestion');

export function validateDisplayName(raw: string): { value?: string; error?: string } {
  const t = raw.trim();
  if (!t) return { error: 'Display name can’t be empty.' };
  if (t.length > 80) return { error: 'Display name must be 80 characters or fewer.' };
  return { value: t };
}
