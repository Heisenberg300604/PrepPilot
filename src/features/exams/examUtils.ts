import { daysUntil, plural, todayKey } from '@/lib/format';
import type { ExamDetail } from '@/lib/types';

export const EXAM_COLORS = [
  { value: '#4f46e5', name: 'Indigo' },
  { value: '#0284c7', name: 'Sky' },
  { value: '#059669', name: 'Emerald' },
  { value: '#d97706', name: 'Amber' },
  { value: '#dc2626', name: 'Red' },
  { value: '#db2777', name: 'Pink' },
  { value: '#7c3aed', name: 'Violet' },
  { value: '#475569', name: 'Slate' },
];

/** Human wording for how far away an exam date is. */
export function daysLeftLabel(examDate: string | null | undefined, today = todayKey()): string {
  if (!examDate) return '';
  const d = daysUntil(examDate, today);
  if (d > 1) return `${d} days left`;
  if (d === 1) return 'Tomorrow';
  if (d === 0) return 'Exam day';
  return `${plural(Math.abs(d), 'day')} ago`;
}

/** What deleting an exam removes, and what it deliberately keeps. */
export function describeExamDeletion(impact: ExamDetail['impact']) {
  const placements = impact.playlistPlacements + impact.videoPlacements;
  const removes = [
    plural(impact.subjects, 'subject'),
    plural(impact.folders, 'folder'),
    `${plural(placements, 'place')} where playlists and videos were filed`,
  ];
  const keeps = [
    'the videos and playlists themselves, in your library',
    'all progress, notes and favorites',
    'planner tasks (they are unlinked from this exam, not deleted)',
  ];
  return { removes, keeps };
}
