import { describe, expect, it } from 'vitest';
import { countByDate, groupByDate, isValidDateKey, parseMinutes, resolveSelectedDay, summarizeDay, weekAround } from './dates';

describe('isValidDateKey / resolveSelectedDay', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDateKey('2027-02-28')).toBe(true);
    expect(isValidDateKey('2028-02-29')).toBe(true);
    expect(isValidDateKey('2027-02-29')).toBe(false);
    expect(isValidDateKey('2027-13-01')).toBe(false);
    expect(isValidDateKey('2027-2-1')).toBe(false);
    expect(isValidDateKey('tomorrow')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
  });
  it('falls back to today for a missing/invalid URL param', () => {
    expect(resolveSelectedDay('2027-05-01', '2027-04-01')).toBe('2027-05-01');
    expect(resolveSelectedDay(null, '2027-04-01')).toBe('2027-04-01');
    expect(resolveSelectedDay('junk', '2027-04-01')).toBe('2027-04-01');
  });
});

describe('weekAround', () => {
  it('returns seven consecutive days centred on the selected day', () => {
    expect(weekAround('2027-03-10')).toEqual(['2027-03-07', '2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12', '2027-03-13']);
  });
  it('crosses month and year boundaries', () => {
    expect(weekAround('2027-01-02')[0]).toBe('2026-12-30');
    expect(weekAround('2027-02-27')[6]).toBe('2027-03-02');
  });
});

describe('summarizeDay', () => {
  const t = (status: 'TODO' | 'DONE', estimatedDurationMinutes: number) => ({ status, estimatedDurationMinutes });
  it('counts planned/completed tasks and minutes', () => {
    expect(summarizeDay([t('DONE', 50), t('TODO', 30), t('DONE', 10)], 120)).toEqual({ planned: 3, completed: 2, plannedMinutes: 90, completedMinutes: 60, targetPercent: 50 });
  });
  it('caps at 100% and handles a zero target without NaN/Infinity', () => {
    expect(summarizeDay([t('DONE', 300)], 120).targetPercent).toBe(100);
    expect(summarizeDay([t('DONE', 30)], 0).targetPercent).toBe(0);
  });
  it('handles an empty day', () => {
    expect(summarizeDay([], 120)).toEqual({ planned: 0, completed: 0, plannedMinutes: 0, completedMinutes: 0, targetPercent: 0 });
  });
});

describe('grouping', () => {
  const tasks = [
    { id: 'a', scheduledDate: '2027-03-12' },
    { id: 'b', scheduledDate: '2027-03-11' },
    { id: 'c', scheduledDate: '2027-03-12' },
  ];
  it('groups by date in ascending order, keeping task order inside a day', () => {
    expect(groupByDate(tasks).map(([d, l]) => [d, l.map((x) => x.id)])).toEqual([
      ['2027-03-11', ['b']],
      ['2027-03-12', ['a', 'c']],
    ]);
    expect(groupByDate([])).toEqual([]);
  });
  it('counts tasks per date', () => {
    expect(countByDate(tasks)).toEqual({ '2027-03-12': 2, '2027-03-11': 1 });
  });
});

describe('parseMinutes', () => {
  it.each([
    ['0', 0],
    ['45', 45],
    ['1440', 1440],
    [' 30 ', 30],
  ])('accepts %j', (raw, n) => expect(parseMinutes(raw)).toBe(n));
  it.each(['', '-5', '1441', '12.5', 'abc', '1e3'])('rejects %j', (raw) => expect(parseMinutes(raw)).toBeNull());
});
