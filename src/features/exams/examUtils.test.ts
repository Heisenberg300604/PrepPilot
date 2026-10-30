import { describe, expect, it } from 'vitest';
import { daysLeftLabel, describeExamDeletion } from './examUtils';

describe('daysLeftLabel', () => {
  it('describes future, same-day and past exams', () => {
    expect(daysLeftLabel('2027-01-11', '2027-01-01')).toBe('10 days left');
    expect(daysLeftLabel('2027-01-02', '2027-01-01')).toBe('Tomorrow');
    expect(daysLeftLabel('2027-01-01', '2027-01-01')).toBe('Exam day');
    expect(daysLeftLabel('2026-12-30', '2027-01-01')).toBe('2 days ago');
    expect(daysLeftLabel(null)).toBe('');
  });
});

describe('describeExamDeletion', () => {
  it('lists what is removed with correct plurals and what is kept', () => {
    const { removes, keeps } = describeExamDeletion({ subjects: 1, folders: 2, playlistPlacements: 1, videoPlacements: 3 });
    expect(removes).toEqual(['1 subject', '2 folders', '4 places where playlists and videos were filed']);
    expect(keeps.join(' ')).toMatch(/progress, notes and favorites/);
    expect(keeps.join(' ')).toMatch(/planner tasks/);
  });
});
