/** Single source of truth for user-facing branding. */
export const brand = {
  name: 'PrepPilot',
  tagline: 'Your preparation. Your pace. Your progress.',
  description: 'Organise your syllabus, YouTube lectures, notes and daily plan in one calm workspace.',
  /** localStorage key for the cached theme (the source of truth is the saved profile). */
  themeStorageKey: 'preppilot-theme',
} as const;
